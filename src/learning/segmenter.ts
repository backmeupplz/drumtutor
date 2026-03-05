/**
 * Split a drum track into 2-measure segments for learning.
 */

import type { DrumTrack, MidiNote, Segment } from "../engine/types";

/** Measures per segment */
const MEASURES_PER_SEGMENT = 2;

/** Get the duration of one measure in seconds */
function measureDuration(bpm: number, timeSig: [number, number]): number {
  const beatsPerMeasure = timeSig[0];
  const secondsPerBeat = 60 / bpm;
  return beatsPerMeasure * secondsPerBeat;
}

/** Score difficulty of a segment (0-1) based on density, variety, syncopation */
function scoreDifficulty(
  notes: MidiNote[],
  durationSeconds: number,
  bpm: number
): number {
  if (notes.length === 0 || durationSeconds === 0) return 0;

  // Note density (notes per second, normalized)
  const density = Math.min(notes.length / durationSeconds / 8, 1);

  // Instrument variety (unique notes, normalized)
  const uniqueNotes = new Set(notes.map((n) => n.note)).size;
  const variety = Math.min(uniqueNotes / 6, 1);

  // Syncopation: fraction of notes NOT on beat boundaries
  const beatDuration = 60 / bpm;
  let offBeat = 0;
  for (const n of notes) {
    const beatPos = (n.time % beatDuration) / beatDuration;
    if (beatPos > 0.05 && beatPos < 0.95) offBeat++;
  }
  const syncopation = notes.length > 0 ? offBeat / notes.length : 0;

  return density * 0.4 + variety * 0.3 + syncopation * 0.3;
}

/** Segment a drum track into 2-measure segments, skipping empty ones */
export function segmentTrack(track: DrumTrack): Segment[] {
  const measDur = measureDuration(track.bpm, track.timeSignature);
  const segDur = measDur * MEASURES_PER_SEGMENT;

  // Calculate total measures from last note
  const lastNote = track.notes[track.notes.length - 1];
  if (!lastNote) return [];

  const totalTime = lastNote.time + measDur; // extra measure for safety
  const totalSegments = Math.ceil(totalTime / segDur);

  const segments: Segment[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const startTime = i * segDur;
    const endTime = startTime + segDur;
    const startMeasure = i * MEASURES_PER_SEGMENT;
    const endMeasure = startMeasure + MEASURES_PER_SEGMENT;

    const notes = track.notes.filter(
      (n) => n.time >= startTime - 0.001 && n.time < endTime - 0.001
    );

    // Skip empty segments
    if (notes.length === 0) continue;

    segments.push({
      index: segments.length,
      startMeasure,
      endMeasure,
      startTime,
      endTime,
      notes,
      difficulty: scoreDifficulty(notes, segDur, track.bpm),
    });
  }

  return segments;
}
