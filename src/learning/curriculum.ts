/**
 * Curriculum builder for auto-learn mode.
 *
 * Generates a progressive sequence of steps:
 *   1. Individual segments (size 1)
 *   2. Overlapping chains of size 2, 4, 8, 16, 32, ... (doubling)
 *      Each chain size overlaps by half (stride = size/2), except pairs stride by 1.
 *   3. Full song with metronome
 *   4. Full song without metronome
 */

import type { Segment, CurriculumStep } from "../engine/types";

export function buildCurriculum(segments: Segment[]): CurriculumStep[] {
  const N = segments.length;
  if (N === 0) return [];

  const steps: CurriculumStep[] = [];

  // Phase 1: Individual segments
  for (let i = 0; i < N; i++) {
    steps.push({
      segmentRange: [i, i],
      phase: "individual",
      chainSize: 1,
      label: `S${i + 1}`,
      withClick: true,
      status: "pending",
    });
  }

  // Phase 2: Overlapping chains of increasing size (2, 4, 8, 16, ...)
  for (let size = 2; size < N; size *= 2) {
    // Stride: pairs overlap by 1 (stride=1), larger chains overlap by half (stride=size/2)
    const stride = size === 2 ? 1 : size / 2;

    for (let start = 0; start + size - 1 < N; start += stride) {
      const end = start + size - 1;
      steps.push({
        segmentRange: [start, end],
        phase: "chain",
        chainSize: size,
        label: `S${start + 1}-S${end + 1}`,
        withClick: true,
        status: "pending",
      });
    }

    // If the last chain didn't reach the end, add a trailing chain
    const lastStart = Math.floor((N - size) / stride) * stride;
    const trailingStart = lastStart + stride;
    if (trailingStart + size - 1 < N) {
      // already covered
    } else if (N - size > 0 && (N - size) % stride !== 0) {
      const s = N - size;
      const e = N - 1;
      // Check we didn't already add this exact range
      const last = steps[steps.length - 1];
      if (!last || last.segmentRange[0] !== s || last.segmentRange[1] !== e) {
        steps.push({
          segmentRange: [s, e],
          phase: "chain",
          chainSize: size,
          label: `S${s + 1}-S${e + 1}`,
          withClick: true,
          status: "pending",
        });
      }
    }
  }

  // Phase 3: Full song with metronome
  if (N > 1) {
    steps.push({
      segmentRange: [0, N - 1],
      phase: "full",
      chainSize: N,
      label: "Full (click)",
      withClick: true,
      status: "pending",
    });
  }

  // Phase 4: Full song without metronome
  steps.push({
    segmentRange: [0, N - 1],
    phase: "full",
    chainSize: N,
    label: N > 1 ? "Full (no click)" : "S1 (no click)",
    withClick: false,
    status: "pending",
  });

  return steps;
}

/** Merge contiguous segments into one virtual segment for chain practice */
export function getCombinedSegment(
  segments: Segment[],
  range: [number, number]
): Segment {
  const [start, end] = range;
  const first = segments[start];
  const last = segments[end];

  // Collect all notes from the range
  const notes = [];
  for (let i = start; i <= end; i++) {
    notes.push(...segments[i].notes);
  }

  return {
    index: start,
    startMeasure: first.startMeasure,
    endMeasure: last.endMeasure,
    startTime: first.startTime,
    endTime: last.endTime,
    notes,
    difficulty: Math.max(...segments.slice(start, end + 1).map((s) => s.difficulty)),
  };
}

/** Get storage key for curriculum progress */
export function curriculumStorageKey(trackName: string): string {
  return `drumtutor:curriculum:${trackName}`;
}

/** Save passed step indices to localStorage */
export function saveCurriculumProgress(
  trackName: string,
  passedIndices: number[]
): void {
  localStorage.setItem(
    curriculumStorageKey(trackName),
    JSON.stringify(passedIndices)
  );
}

/** Load passed step indices from localStorage */
export function loadCurriculumProgress(trackName: string): number[] {
  const raw = localStorage.getItem(curriculumStorageKey(trackName));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
