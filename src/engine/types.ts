/** A single note event from a parsed MIDI file */
export interface MidiNote {
  note: number;
  velocity: number;
  /** Time in seconds from song start */
  time: number;
  /** Time in ticks from song start */
  ticks: number;
}

/** Parsed drum track from a MIDI file */
export interface DrumTrack {
  name: string;
  bpm: number;
  timeSignature: [number, number]; // [numerator, denominator]
  ppq: number; // pulses per quarter note
  durationSeconds: number;
  notes: MidiNote[];
}

/** A segment of the song for learning */
export interface Segment {
  index: number;
  startMeasure: number;
  endMeasure: number;
  startTime: number;
  endTime: number;
  notes: MidiNote[];
  difficulty: number;
}

/** Hit result from performance evaluation */
export type HitQuality = "correct" | "early" | "late" | "miss";

export interface HitResult {
  expectedNote: MidiNote;
  quality: HitQuality;
  /** Timing offset in seconds (negative = early, positive = late) */
  offset: number;
  /** The actual note played (undefined for misses) */
  playedNote?: number;
}

/** Evaluation result for a segment attempt */
export interface SegmentResult {
  hits: HitResult[];
  accuracy: number;
  passed: boolean;
}

/** Learning state machine states */
export type LearningState =
  | "IDLE"
  | "SONG_LOADED"
  | "LISTENING"
  | "SEGMENT_PREVIEW"
  | "PREP_COUNT"
  | "PLAYING"
  | "EVALUATE"
  | "NEXT_SEGMENT"
  | "COMBINE"
  | "EXAM_WITH_CLICK"
  | "EXAM_WITHOUT_CLICK"
  | "SONG_COMPLETE";

/** A step in the auto-learn curriculum */
export type CurriculumPhase = "individual" | "chain" | "full";

export interface CurriculumStep {
  segmentRange: [number, number]; // inclusive segment indices
  phase: CurriculumPhase;
  chainSize: number; // 1 for individual, 2/4/8/16/... for chains
  label: string;
  withClick: boolean;
  status: "pending" | "active" | "passed";
}

/** State for auto-learn mode */
export interface AutoLearnState {
  curriculum: CurriculumStep[];
  currentStepIndex: number;
  stepFailCount: number;
  relearning: boolean;
  relearnSubIndex: number;
  relearnPassed: Set<number>;
}

/** An extra hit not matched to any expected note */
export interface ExtraHit {
  note: number;
  velocity: number;
  /** Time in original song coordinates (for positioning on staff) */
  songTime: number;
}

/** Voice for polyphonic playback */
export interface Voice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  note: number;
  startTime: number;
}
