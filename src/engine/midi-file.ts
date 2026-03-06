/**
 * MIDI file parsing using @tonejs/midi — extracts drum track.
 */

import { Midi } from "@tonejs/midi";
import type { DrumTrack, MidiNote } from "./types";

/**
 * Fix common MIDI mapping issue:
 * - If file has many note 44 (pedal HH) but no note 42 (closed HH), remap 44→42.
 *   Many MIDI files misuse pedal HH for the main closed hi-hat pattern.
 */
function fixHiHatMapping(notes: MidiNote[]): MidiNote[] {
  const count42 = notes.filter((n) => n.note === 42).length;
  const count44 = notes.filter((n) => n.note === 44).length;

  if (count42 === 0 && count44 > 20) {
    return notes.map((n) =>
      n.note === 44 ? { ...n, note: 42 } : n
    );
  }

  return notes;
}

/** Parse a MIDI file from an ArrayBuffer */
export function parseMidiFile(buffer: ArrayBuffer): DrumTrack {
  const midi = new Midi(buffer);

  // Find drum track: channel 10 (index 9) or track with notes in drum range
  let drumTrack = midi.tracks.find((t) => t.channel === 9);

  if (!drumTrack) {
    // Fallback: find track with most notes in GM drum range (35-81)
    drumTrack = midi.tracks
      .filter((t) => t.notes.some((n) => n.midi >= 35 && n.midi <= 81))
      .sort((a, b) => b.notes.length - a.notes.length)[0];
  }

  if (!drumTrack) {
    throw new Error("No drum track found in MIDI file");
  }

  let notes: MidiNote[] = drumTrack.notes
    .filter((n) => n.midi >= 21 && n.midi <= 81)
    .map((n) => ({
      note: n.midi,
      velocity: Math.round(n.velocity * 127),
      time: n.time,
      ticks: n.ticks,
    }))
    .sort((a, b) => a.time - b.time);

  // Auto-fix: if file uses note 44 (pedal HH) but has no note 42 (closed HH),
  // remap 44→42. Many MIDI files misuse 44 for the main hi-hat pattern.
  notes = fixHiHatMapping(notes);

  // Get BPM from tempo map
  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

  // Get time signature
  const ts = midi.header.timeSignatures[0];
  const timeSignature: [number, number] = ts
    ? [ts.timeSignature[0], ts.timeSignature[1]]
    : [4, 4];

  const lastNote = notes[notes.length - 1];
  const durationSeconds = lastNote ? lastNote.time + 1 : 0;

  return {
    name: drumTrack.name || midi.name || "Untitled",
    bpm: Math.round(bpm * 10) / 10,
    timeSignature,
    ppq: midi.header.ppq,
    durationSeconds,
    notes,
  };
}

/** Parse a MIDI file from a File object */
export async function parseMidiFromFile(file: File): Promise<DrumTrack> {
  const buffer = await file.arrayBuffer();
  return parseMidiFile(buffer);
}

/** Parse a MIDI file from a URL */
export async function parseMidiFromUrl(url: string): Promise<DrumTrack> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  return parseMidiFile(buffer);
}
