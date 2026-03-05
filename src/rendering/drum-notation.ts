/**
 * Canvas-based drum notation renderer.
 * Draws 5-line staff, noteheads, bar lines, and animated playhead.
 */

import type { MidiNote, HitResult } from "../engine/types";
import {
  layoutNotes,
  LINE_SPACING,
  STAFF_TOP,
  LEFT_MARGIN,
  RIGHT_MARGIN,
  NOTE_RADIUS,
  type NotePosition,
} from "./notation-layout";
import {
  HIT_COLORS,
  NOTE_COLOR_DEFAULT,
  PLAYHEAD_COLOR,
  STAFF_COLOR,
  BAR_LINE_COLOR,
  BG_COLOR,
} from "./colors";

/** Draw the 5-line staff */
function drawStaff(
  ctx: CanvasRenderingContext2D,
  width: number
): void {
  ctx.strokeStyle = STAFF_COLOR;
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const y = STAFF_TOP + i * LINE_SPACING;
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN - 10, y);
    ctx.lineTo(width - RIGHT_MARGIN + 10, y);
    ctx.stroke();
  }
}

/** Draw instrument labels on the left */
function drawLabels(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#666";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const labels: [string, number][] = [
    ["CC", -1],
    ["RC", 0],
    ["HH", -0.5],
    ["SN", 3],
    ["HT", 2.5],
    ["MT", 4],
    ["FT", 5],
    ["BD", 6],
    ["PH", 7],
  ];

  for (const [label, line] of labels) {
    const y = STAFF_TOP + line * LINE_SPACING;
    ctx.fillText(label, LEFT_MARGIN - 15, y);
  }
}

/** Draw bar lines */
function drawBarLines(
  ctx: CanvasRenderingContext2D,
  startTime: number,
  endTime: number,
  bpm: number,
  timeSig: [number, number],
  canvasWidth: number
): void {
  const beatDuration = 60 / bpm;
  const measureDuration = beatDuration * timeSig[0];
  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const duration = endTime - startTime;

  if (duration <= 0) return;

  ctx.strokeStyle = BAR_LINE_COLOR;
  ctx.lineWidth = 1;

  // Draw beat lines (thin, dotted)
  ctx.setLineDash([2, 4]);
  for (
    let t = startTime;
    t <= endTime + 0.001;
    t += beatDuration
  ) {
    const fraction = (t - startTime) / duration;
    const x = LEFT_MARGIN + fraction * usableWidth;
    ctx.beginPath();
    ctx.moveTo(x, STAFF_TOP - LINE_SPACING * 2);
    ctx.lineTo(x, STAFF_TOP + LINE_SPACING * 8);
    ctx.stroke();
  }

  // Draw measure lines (solid, thicker)
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  for (
    let t = startTime;
    t <= endTime + 0.001;
    t += measureDuration
  ) {
    const fraction = (t - startTime) / duration;
    const x = LEFT_MARGIN + fraction * usableWidth;
    ctx.beginPath();
    ctx.moveTo(x, STAFF_TOP - LINE_SPACING * 2);
    ctx.lineTo(x, STAFF_TOP + LINE_SPACING * 8);
    ctx.stroke();
  }
}

/** Draw a single notehead */
function drawNote(
  ctx: CanvasRenderingContext2D,
  pos: NotePosition,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  if (pos.isX) {
    // X notehead for cymbals
    const s = NOTE_RADIUS * 0.8;
    ctx.beginPath();
    ctx.moveTo(pos.x - s, pos.y - s);
    ctx.lineTo(pos.x + s, pos.y + s);
    ctx.moveTo(pos.x + s, pos.y - s);
    ctx.lineTo(pos.x - s, pos.y + s);
    ctx.stroke();
  } else {
    // Filled oval for drums
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, NOTE_RADIUS, NOTE_RADIUS * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw stem
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  if (pos.y > STAFF_TOP + 2 * LINE_SPACING) {
    // Stem up
    ctx.moveTo(pos.x + NOTE_RADIUS, pos.y);
    ctx.lineTo(pos.x + NOTE_RADIUS, pos.y - LINE_SPACING * 3);
  } else {
    // Stem down
    ctx.moveTo(pos.x - NOTE_RADIUS, pos.y);
    ctx.lineTo(pos.x - NOTE_RADIUS, pos.y + LINE_SPACING * 3);
  }
  ctx.stroke();
}

/** Draw the playhead (vertical line showing current position) */
function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  playheadTime: number,
  startTime: number,
  endTime: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const duration = endTime - startTime;
  if (duration <= 0) return;

  const fraction = (playheadTime - startTime) / duration;
  if (fraction < 0 || fraction > 1) return;

  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const x = LEFT_MARGIN + fraction * usableWidth;

  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export interface RenderOptions {
  notes: MidiNote[];
  startTime: number;
  endTime: number;
  bpm: number;
  timeSig: [number, number];
  playheadTime?: number;
  hitResults?: Map<number, HitResult>; // keyed by note index in array
}

/** Main render function — draws complete notation to canvas */
export function renderNotation(
  canvas: HTMLCanvasElement,
  options: RenderOptions
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  // Clear
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Staff
  drawStaff(ctx, w);
  drawLabels(ctx);

  // Bar lines
  drawBarLines(ctx, options.startTime, options.endTime, options.bpm, options.timeSig, w);

  // Notes
  const positions = layoutNotes(options.notes, options.startTime, options.endTime, w);

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    let color = NOTE_COLOR_DEFAULT;

    if (options.hitResults?.has(i)) {
      const result = options.hitResults.get(i)!;
      color = HIT_COLORS[result.quality];
    }

    drawNote(ctx, pos, color);
  }

  // Playhead
  if (options.playheadTime !== undefined) {
    drawPlayhead(ctx, options.playheadTime, options.startTime, options.endTime, w, h);
  }
}
