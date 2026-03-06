/**
 * Web Audio engine: loads samples, triggers playback with choke groups,
 * 16-voice polyphony with voice stealing, and metronome.
 */

import type { Voice } from "./types";
import type { NoteGroup } from "./sample-kit";
import { loadSampleKit, pickSample, buildSampleList } from "./sample-kit";

/** Choke group definitions: playing any note in a group chokes other notes in that group */
const CHOKE_GROUPS: number[][] = [
  [42, 46, 23, 21], // Closed HH chokes Open HH, Half-Open, Splash
  [44, 46, 23, 21], // Pedal HH chokes same
];

const MAX_VOICES = 16;

/** All sample filenames in the FreePats-GM kit */
const SAMPLE_FILES = [
  "21_v1_rr1.wav",
  "21_v1_rr2.wav",
  "21_v1_rr3.wav",
  "21_v1_rr4.wav",
  "23_v1_rr1.wav",
  "23_v1_rr2.wav",
  "23_v1_rr3.wav",
  "23_v1_rr4.wav",
  "36.wav",
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
  "40.wav",
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
    this.ctx = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 44100,
    });
    this.masterGain = this.ctx.createGain();
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

    // Apply choke groups — stop any voice in same choke group
    for (const group of CHOKE_GROUPS) {
      if (group.includes(note)) {
        this.chokeNotes(group);
        break;
      }
    }

    const noteGroup = this.kit.get(note);
    if (!noteGroup) return;

    const buffer = pickSample(noteGroup, velocity);
    if (!buffer) return;

    // Voice stealing if at max
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift()!;
      oldest.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      oldest.source.stop();
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    // Scale velocity to gain (quadratic curve for natural feel)
    const vol = (velocity / 127) ** 2;
    gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start();

    const voice: Voice = {
      source,
      gainNode,
      note,
      startTime: this.ctx.currentTime,
    };
    this.voices.push(voice);

    source.onended = () => {
      const idx = this.voices.indexOf(voice);
      if (idx >= 0) this.voices.splice(idx, 1);
    };
  }

  /** Stop all voices playing notes in the given set */
  private chokeNotes(notes: number[]): void {
    const t = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => {
      if (notes.includes(v.note)) {
        // Quick fade out to avoid click
        v.gainNode.gain.setValueAtTime(v.gainNode.gain.value, t);
        v.gainNode.gain.linearRampToValueAtTime(0, t + 0.01);
        v.source.stop(t + 0.015);
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
    const noteGroup = this.kit.get(note);
    if (!noteGroup) return null;

    const buffer = pickSample(noteGroup, velocity);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    const vol = (velocity / 127) ** 2;
    gainNode.gain.setValueAtTime(vol, time);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(time);

    return source;
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }
}
