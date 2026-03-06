/**
 * Web Audio engine: loads samples, triggers playback with choke groups,
 * polyphony with voice stealing, and metronome.
 */

import type { Voice } from "./types";
import type { NoteGroup } from "./sample-kit";
import { loadSampleKit, pickSample, buildSampleList } from "./sample-kit";

/** Choke group definitions: playing any note in a group chokes other notes in that group */
const CHOKE_GROUPS: number[][] = [
  [42, 46, 23, 21], // Closed HH chokes Open HH, Half-Open, Splash
  [44, 46, 23, 21], // Pedal HH chokes same
];

const MAX_VOICES = 32;

/** Notes that should remap to another note's sample when no sample exists */
const NOTE_REMAP: Record<number, number> = {
  35: 36, // Acoustic Bass Drum → Bass Drum 1
  40: 37, // Electric Snare (rimshot on Alesis Nitro) → Side Stick
};

/** Resolve a note to one that has a loaded sample */
function resolveNote(note: number, kit: Map<number, any>): number {
  if (kit.has(note)) return note;
  return NOTE_REMAP[note] ?? note;
}

/** All sample filenames */
const SAMPLE_FILES = [
  "21_v1_rr1.wav",
  "21_v1_rr2.wav",
  "21_v1_rr3.wav",
  "21_v1_rr4.wav",
  "23_v1_rr1.wav",
  "23_v1_rr2.wav",
  "23_v1_rr3.wav",
  "23_v1_rr4.wav",
  "36_v1.wav",
  "36_v2.wav",
  "36_v3.wav",
  "36_v4.wav",
  "36_v5.wav",
  "37_v1.wav",
  "37_v2.wav",
  "37_v3.wav",
  "37_v4.wav",
  "37_v5.wav",
  "37_v6.wav",
  "37_v7.wav",
  "37_v8.wav",
  "38_v1_rr1.wav",
  "38_v1_rr2.wav",
  "38_v2_rr1.wav",
  "38_v2_rr2.wav",
  "38_v2_rr3.wav",
  "38_v2_rr4.wav",
  "38_v2_rr5.wav",
  "38_v2_rr6.wav",
  "38_v2_rr7.wav",
  "39_v1_rr1.wav",
  "39_v1_rr2.wav",
  "39_v1_rr3.wav",
  "39_v1_rr4.wav",
  "39_v1_rr5.wav",
  "39_v1_rr6.wav",
  "39_v1_rr7.wav",
  "39_v1_rr8.wav",
  "39_v1_rr9.wav",
  "41_v1_rr1.wav",
  "41_v1_rr2.wav",
  "42_v1_rr1.wav",
  "42_v1_rr2.wav",
  "42_v1_rr3.wav",
  "42_v1_rr4.wav",
  "42_v1_rr5.wav",
  "42_v1_rr6.wav",
  "42_v1_rr7.wav",
  "43_v1_rr1.wav",
  "43_v1_rr2.wav",
  "44.wav",
  "45_v1_rr1.wav",
  "45_v1_rr2.wav",
  "45_v1_rr3.wav",
  "46_v1_rr1.wav",
  "46_v1_rr2.wav",
  "46_v1_rr3.wav",
  "46_v1_rr4.wav",
  "47_v1_rr1.wav",
  "47_v1_rr2.wav",
  "47_v1_rr3.wav",
  "48_v1_rr1.wav",
  "48_v1_rr2.wav",
  "48_v1_rr3.wav",
  "49_v1_rr1.wav",
  "49_v1_rr2.wav",
  "50_v1_rr1.wav",
  "50_v1_rr2.wav",
  "50_v1_rr3.wav",
  "51_v1_rr1.wav",
  "51_v1_rr2.wav",
  "51_v1_rr3.wav",
  "51_v2_rr1.wav",
  "51_v2_rr2.wav",
  "57.wav",
  "58_v1_rr1.wav",
  "58_v1_rr2.wav",
  "58_v1_rr3.wav",
  "58_v1_rr4.wav",
];

export class AudioEngine {
  ctx: AudioContext;
  private kit: Map<number, NoteGroup> = new Map();
  private voices: Voice[] = [];
  private masterGain: GainNode;
  private scheduledOscillators: OscillatorNode[] = [];
  loaded = false;

  constructor() {
    // Use the system's native sample rate and request balanced latency.
    // "interactive" can cause underruns on Linux when many nodes are created rapidly.
    this.ctx = new AudioContext({
      latencyHint: "playback",
    });

    // No compressor/limiter — they cause pumping artifacts on drum transients.
    // Instead, keep per-voice volume low enough that overlapping hits stay under 1.0.
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);
  }

  async loadKit(basePath: string): Promise<void> {
    await this.resume();
    const entries = buildSampleList(SAMPLE_FILES, basePath);
    this.kit = await loadSampleKit(this.ctx, entries);
    this.loaded = true;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /** Trigger a drum sample */
  trigger(note: number, velocity: number): void {
    if (!this.loaded) return;

    const resolved = resolveNote(note, this.kit);

    // Apply choke groups — choke OTHER notes in the group, not the same note
    for (const group of CHOKE_GROUPS) {
      if (group.includes(resolved)) {
        this.chokeNotes(group, resolved);
        break;
      }
    }

    const noteGroup = this.kit.get(resolved);
    if (!noteGroup) return;

    const buffer = pickSample(noteGroup, velocity);
    if (!buffer) return;

    // Voice stealing if at max
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift()!;
      this.fadeOutVoice(oldest);
    }

    // Schedule slightly in the future so the audio thread can process it
    // cleanly within a render quantum. source.start() without a time can
    // cause glitches when the main thread is busy (React re-renders etc).
    const startTime = this.ctx.currentTime + 0.005;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    // Velocity curve — keep headroom so overlapping hits don't clip
    const vol = (velocity / 127) ** 1.5;
    gainNode.gain.value = vol;

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(startTime);

    const voice: Voice = {
      source,
      gainNode,
      note: resolved,
      startTime,
    };
    this.voices.push(voice);

    source.onended = () => {
      const idx = this.voices.indexOf(voice);
      if (idx >= 0) this.voices.splice(idx, 1);
      source.disconnect();
      gainNode.disconnect();
    };
  }

  /** Fade out a voice cleanly */
  private fadeOutVoice(v: Voice): void {
    const t = this.ctx.currentTime;
    v.gainNode.gain.cancelScheduledValues(t);
    v.gainNode.gain.setValueAtTime(v.gainNode.gain.value, t);
    v.gainNode.gain.setTargetAtTime(0, t, 0.005);
    v.source.stop(t + 0.03);
    v.source.onended = () => {
      v.source.disconnect();
      v.gainNode.disconnect();
    };
  }

  /** Stop voices playing other notes in the choke group (not the triggering note itself) */
  private chokeNotes(notes: number[], exclude: number): void {
    this.voices = this.voices.filter((v) => {
      if (v.note !== exclude && notes.includes(v.note)) {
        this.fadeOutVoice(v);
        return false;
      }
      return true;
    });
  }

  /** Play a metronome click */
  playClick(accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1000 : 800;
    gain.gain.setValueAtTime(accent ? 0.3 : 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + 0.03
    );
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  /** Schedule a metronome click at a specific AudioContext time */
  scheduleClick(time: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1000 : 800;
    gain.gain.setValueAtTime(0, time);
    gain.gain.setValueAtTime(accent ? 0.3 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.03);

    this.scheduledOscillators.push(osc);
    osc.onended = () => {
      const idx = this.scheduledOscillators.indexOf(osc);
      if (idx >= 0) this.scheduledOscillators.splice(idx, 1);
    };
  }

  /** Cancel all scheduled metronome clicks */
  cancelScheduled(): void {
    for (const osc of this.scheduledOscillators) {
      try { osc.stop(); } catch {}
    }
    this.scheduledOscillators = [];
  }

  /** Schedule a sample trigger at a specific AudioContext time */
  scheduleTrigger(
    note: number,
    velocity: number,
    time: number
  ): AudioBufferSourceNode | null {
    const resolved = resolveNote(note, this.kit);
    const noteGroup = this.kit.get(resolved);
    if (!noteGroup) return null;

    const buffer = pickSample(noteGroup, velocity);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    const vol = (velocity / 127) ** 1.5;
    gainNode.gain.value = vol;

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(time);

    return source;
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }
}
