/**
 * Layout calculations for drum notation rendering.
 */

import type { MidiNote } from "../engine/types";
import { getDrumInfo } from "../utils/gm-drum-map";

/** Vertical spacing between staff lines */
export const LINE_SPACING = 18;

/** Top margin before first staff line */
export const STAFF_TOP = 40;

/** Left margin for labels */
export const LEFT_MARGIN = 50;

/** Right margin */
export const RIGHT_MARGIN = 20;

/** Note head radius */
export const NOTE_RADIUS = 7;

/** Convert staff line position to Y coordinate */
export function staffLineToY(staffLine: number): number {
  return STAFF_TOP + staffLine * LINE_SPACING;
}

/** Get Y position for a MIDI note number */
export function noteToY(note: number): number {
  const info = getDrumInfo(note);
  return staffLineToY(info.staffLine);
}

/** Note position within the canvas */
export interface NotePosition {
  x: number;
  y: number;
  note: number;
  isX: boolean;
  time: number;
}

/**
 * Calculate X positions for notes in a time range.
 * Maps time linearly to X within the available width.
 */
export function layoutNotes(
  notes: MidiNote[],
  startTime: number,
  endTime: number,
  canvasWidth: number
): NotePosition[] {
  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const duration = endTime - startTime;

  if (duration <= 0) return [];

  return notes.map((n) => {
    const fraction = (n.time - startTime) / duration;
    return {
      x: LEFT_MARGIN + fraction * usableWidth,
      y: noteToY(n.note),
      note: n.note,
      isX: getDrumInfo(n.note).isX,
      time: n.time,
    };
  });
}
