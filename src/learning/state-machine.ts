/**
 * Learning state machine — orchestrates the full learning flow.
 */

import type {
  LearningState,
  Segment,
  DrumTrack,
  SegmentResult,
} from "../engine/types";
import { BpmController } from "./bpm-controller";
import { segmentTrack } from "./segmenter";

export interface LearningSession {
  state: LearningState;
  track: DrumTrack | null;
  segments: Segment[];
  currentSegmentIndex: number;
  /** For combine mode: range of segments being combined */
  combineRange: [number, number];
  bpmController: BpmController | null;
  metronomeEnabled: boolean;
  /** Segments that have been passed at target BPM */
  passedSegments: Set<number>;
  /** Current attempt streak (consecutive passes) */
  streak: number;
  lastResult: SegmentResult | null;
  /** Message to display in HUD */
  statusMessage: string;
}

export function createSession(): LearningSession {
  return {
    state: "IDLE",
    track: null,
    segments: [],
    currentSegmentIndex: 0,
    combineRange: [0, 0],
    bpmController: null,
    metronomeEnabled: true,
    passedSegments: new Set(),
    streak: 0,
    lastResult: null,
    statusMessage: "Load a MIDI file to begin",
  };
}

export function loadSong(session: LearningSession, track: DrumTrack): LearningSession {
  const segments = segmentTrack(track);
  return {
    ...session,
    state: "SONG_LOADED",
    track,
    segments,
    currentSegmentIndex: 0,
    combineRange: [0, 0],
    bpmController: new BpmController(track.bpm),
    metronomeEnabled: true,
    passedSegments: new Set(),
    streak: 0,
    lastResult: null,
    statusMessage: `Loaded: ${segments.length} segments at ${track.bpm} BPM`,
  };
}

/** Start listening mode (play through whole song) */
export function startListening(session: LearningSession): LearningSession {
  return {
    ...session,
    state: "LISTENING",
    statusMessage: "Listen to the song...",
  };
}

/** Start practicing current segment */
export function startSegment(session: LearningSession): LearningSession {
  if (!session.bpmController) return session;
  session.bpmController.reset();
  return {
    ...session,
    state: "SEGMENT_PREVIEW",
    statusMessage: `Segment ${session.currentSegmentIndex + 1}: Preview`,
  };
}

/** Move from preview to count-in */
export function startCountIn(session: LearningSession): LearningSession {
  return {
    ...session,
    state: "PREP_COUNT",
    statusMessage: "Count in...",
  };
}

/** Move from count-in to playing */
export function startPlaying(session: LearningSession): LearningSession {
  return {
    ...session,
    state: "PLAYING",
    statusMessage: "Play!",
  };
}

/** Process evaluation result and determine next state */
export function processResult(
  session: LearningSession,
  result: SegmentResult
): LearningSession {
  if (!session.bpmController) return session;

  const updated = { ...session, lastResult: result, state: "EVALUATE" as LearningState };

  if (result.passed) {
    if (session.bpmController.atTarget) {
      // Passed at target BPM — segment complete
      updated.passedSegments = new Set(session.passedSegments);
      updated.passedSegments.add(session.currentSegmentIndex);
      updated.streak = session.streak + 1;
      updated.statusMessage = `Pass! Accuracy: ${Math.round(result.accuracy * 100)}%`;

      // Check if all segments passed
      if (updated.passedSegments.size === session.segments.length) {
        updated.state = "EXAM_WITH_CLICK";
        updated.statusMessage = "All segments passed! Exam with metronome...";
      } else {
        updated.state = "NEXT_SEGMENT";
        updated.statusMessage = `Segment complete! Moving to next...`;
      }
    } else {
      // Passed but not at target — increase BPM
      session.bpmController.onPass();
      updated.statusMessage = `Pass! BPM → ${session.bpmController.currentBpm}`;
      updated.state = "SEGMENT_PREVIEW";
    }
  } else {
    // Failed
    session.bpmController.onFail();
    updated.streak = 0;
    updated.statusMessage = `Try again. Accuracy: ${Math.round(result.accuracy * 100)}% (need 80%). BPM: ${session.bpmController.currentBpm}`;
    updated.state = "SEGMENT_PREVIEW";
  }

  return updated;
}

/** Advance to the next segment */
export function nextSegment(session: LearningSession): LearningSession {
  const nextIdx = session.currentSegmentIndex + 1;
  if (nextIdx >= session.segments.length) {
    return {
      ...session,
      state: "EXAM_WITH_CLICK",
      statusMessage: "All segments practiced! Full exam with metronome...",
    };
  }

  const target = session.bpmController?.targetBpm ?? session.track?.bpm;
  return {
    ...session,
    currentSegmentIndex: nextIdx,
    state: "SEGMENT_PREVIEW",
    bpmController: target
      ? new BpmController(target)
      : session.bpmController,
    statusMessage: `Segment ${nextIdx + 1}/${session.segments.length}`,
  };
}

/** Jump to a specific segment */
export function jumpToSegment(
  session: LearningSession,
  index: number
): LearningSession {
  if (index < 0 || index >= session.segments.length) return session;
  const target = session.bpmController?.targetBpm ?? session.track?.bpm;
  return {
    ...session,
    currentSegmentIndex: index,
    state: "SEGMENT_PREVIEW",
    bpmController: target
      ? new BpmController(target)
      : session.bpmController,
    statusMessage: `Jumped to segment ${index + 1}`,
  };
}

/** Process exam result */
export function processExamResult(
  session: LearningSession,
  result: SegmentResult,
  withClick: boolean
): LearningSession {
  if (result.passed) {
    if (withClick) {
      return {
        ...session,
        lastResult: result,
        state: "EXAM_WITHOUT_CLICK",
        metronomeEnabled: false,
        statusMessage: "Exam passed with click! Now without metronome...",
      };
    } else {
      return {
        ...session,
        lastResult: result,
        state: "SONG_COMPLETE",
        statusMessage: "Congratulations! Song complete!",
      };
    }
  } else {
    return {
      ...session,
      lastResult: result,
      state: withClick ? "EXAM_WITH_CLICK" : "EXAM_WITHOUT_CLICK",
      statusMessage: `Exam: ${Math.round(result.accuracy * 100)}% — try again`,
    };
  }
}
