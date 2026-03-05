/** Hit feedback colors */

import type { HitQuality } from "../engine/types";

export const HIT_COLORS: Record<HitQuality, string> = {
  correct: "#22c55e", // green
  early: "#eab308", // yellow
  late: "#f97316", // orange
  miss: "#ef4444", // red
};

export const NOTE_COLOR_DEFAULT = "#e0e0e0";
export const NOTE_COLOR_PLAYING = "#3b82f6";
export const PLAYHEAD_COLOR = "#f59e0b";
export const STAFF_COLOR = "#333";
export const BAR_LINE_COLOR = "#555";
export const BG_COLOR = "#0a0a0a";
