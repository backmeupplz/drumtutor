/**
 * Canvas-based drum notation renderer.
 * Draws 5-line staff, noteheads, bar lines, and animated playhead.
 */

import type { MidiNote, HitResult, ExtraHit } from "../engine/types";
import {
  layoutNotes,
  noteToY,
  LINE_SPACING,
  STAFF_TOP,
  LEFT_MARGIN,
  RIGHT_MARGIN,
  NOTE_RADIUS,
  type NotePosition,
} from "./notation-layout";
import { getDrumInfo } from "../utils/gm-drum-map";
import {
  HIT_COLORS,
  EXTRA_HIT_COLOR,
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

/** Draw instrument labels on the left — only for instruments present in notes */
function drawLabels(ctx: CanvasRenderingContext2D, notes: MidiNote[]): void {
  ctx.fillStyle = "#666";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  // Collect unique staff positions from actual notes
  const seen = new Map<string, number>(); // shortName → staffLine
  for (const n of notes) {
    const info = getDrumInfo(n.note);
    if (!seen.has(info.shortName)) {
      seen.set(info.shortName, info.staffLine);
    }
  }

  for (const [label, line] of seen) {
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
  _canvasHeight: number
): void {
  const duration = endTime - startTime;
  if (duration <= 0) return;

  const fraction = (playheadTime - startTime) / duration;
  if (fraction < 0 || fraction > 1) return;

  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const x = LEFT_MARGIN + fraction * usableWidth;

  const top = STAFF_TOP - LINE_SPACING * 2;
  const bottom = STAFF_TOP + LINE_SPACING * 8;

  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
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
  extraHits?: ExtraHit[]; // extra hits not matched to expected notes
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
  drawLabels(ctx, options.notes);

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
    } else if (
      options.hitResults &&
      options.playheadTime !== undefined &&
      pos.time < options.playheadTime
    ) {
      // Playhead passed this note without a hit — mark as miss
      color = HIT_COLORS.miss;
    }

    drawNote(ctx, pos, color);
  }

  // Extra hits — small "+" marks for hits not in the sheet
  if (options.extraHits && options.extraHits.length > 0) {
    const duration = options.endTime - options.startTime;
    if (duration > 0) {
      const usableWidth = w - LEFT_MARGIN - RIGHT_MARGIN;
      ctx.strokeStyle = EXTRA_HIT_COLOR;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;

      for (const extra of options.extraHits) {
        const fraction = (extra.songTime - options.startTime) / duration;
        if (fraction < -0.01 || fraction > 1.01) continue;
        const x = LEFT_MARGIN + fraction * usableWidth;
        const y = noteToY(extra.note);
        const s = NOTE_RADIUS * 0.5;

        // Draw small "+" mark
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s);
        ctx.lineTo(x, y + s);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }
  }

  // Playhead
  if (options.playheadTime !== undefined) {
    drawPlayhead(ctx, options.playheadTime, options.startTime, options.endTime, w, h);
  }
}
