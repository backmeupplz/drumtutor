/** High-resolution timing utilities */

/** Get current time in seconds from AudioContext or performance.now fallback */
export function now(ctx?: AudioContext): number {
  return ctx ? ctx.currentTime : performance.now() / 1000;
}

/** Convert BPM to seconds per beat */
export function bpmToSecondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Convert beats to seconds at given BPM */
export function beatsToSeconds(beats: number, bpm: number): number {
  return beats * bpmToSecondsPerBeat(bpm);
}

/** Convert seconds to beats at given BPM */
export function secondsToBeats(seconds: number, bpm: number): number {
  return seconds / bpmToSecondsPerBeat(bpm);
}

/**
 * Scale a time value from original BPM to target BPM.
 * Used to adjust MIDI note times when playing at practice speed.
 */
export function scaleTime(
  time: number,
  originalBpm: number,
  targetBpm: number
): number {
  return time * (originalBpm / targetBpm);
}
