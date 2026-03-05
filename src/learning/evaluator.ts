/**
 * Performance evaluator — matches hits to expected notes, scores accuracy.
 */

import type { MidiNote, HitResult, HitQuality, SegmentResult } from "../engine/types";
import { areNotesEquivalent } from "../utils/gm-drum-map";

/** Timing windows as fraction of a beat duration */
const CORRECT_WINDOW = 0.15; // ±15%
const LATE_EARLY_WINDOW = 0.25; // ±25%

/** Pass threshold */
const PASS_THRESHOLD = 0.8;

/** Weights for accuracy scoring */
const QUALITY_WEIGHTS: Record<HitQuality, number> = {
  correct: 1.0,
  early: 0.7,
  late: 0.7,
  miss: 0.0,
};

export interface RecordedHit {
  note: number;
  velocity: number;
  /** Time relative to segment start, in seconds */
  time: number;
}

/**
 * Evaluate a segment attempt by matching recorded hits to expected notes.
 * Uses greedy closest-match with note equivalence.
 */
export function evaluateSegment(
  expectedNotes: MidiNote[],
  recordedHits: RecordedHit[],
  segmentStartTime: number,
  bpm: number,
  originalBpm: number
): SegmentResult {
  const beatDuration = 60 / bpm;
  const bpmRatio = originalBpm / bpm;

  // Scale expected note times to current BPM
  const scaledExpected = expectedNotes.map((n) => ({
    ...n,
    scaledTime: (n.time - segmentStartTime) * bpmRatio,
  }));

  // Track which recorded hits have been matched
  const matchedHits = new Set<number>();
  const results: HitResult[] = [];

  for (const expected of scaledExpected) {
    // Find best matching recorded hit
    let bestIdx = -1;
    let bestOffset = Infinity;

    for (let i = 0; i < recordedHits.length; i++) {
      if (matchedHits.has(i)) continue;

      const hit = recordedHits[i];
      if (!areNotesEquivalent(expected.note, hit.note)) continue;

      const offset = hit.time - expected.scaledTime;
      if (Math.abs(offset) < Math.abs(bestOffset)) {
        bestOffset = offset;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      matchedHits.add(bestIdx);
      const absOffset = Math.abs(bestOffset);
      const normalizedOffset = absOffset / beatDuration;

      let quality: HitQuality;
      if (normalizedOffset <= CORRECT_WINDOW) {
        quality = "correct";
      } else if (normalizedOffset <= LATE_EARLY_WINDOW) {
        quality = bestOffset < 0 ? "early" : "late";
      } else {
        quality = "miss";
      }

      results.push({
        expectedNote: expected,
        quality,
        offset: bestOffset,
        playedNote: recordedHits[bestIdx].note,
      });
    } else {
      results.push({
        expectedNote: expected,
        quality: "miss",
        offset: 0,
      });
    }
  }

  // Calculate weighted accuracy
  const totalWeight = results.reduce(
    (sum, r) => sum + QUALITY_WEIGHTS[r.quality],
    0
  );
  const accuracy = results.length > 0 ? totalWeight / results.length : 0;

  return {
    hits: results,
    accuracy,
    passed: accuracy >= PASS_THRESHOLD,
  };
}
