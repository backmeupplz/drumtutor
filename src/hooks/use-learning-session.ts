import { useState, useRef, useCallback } from "preact/hooks";
import type {
  DrumTrack,
  Segment,
  SegmentResult,
  HitResult,
} from "../engine/types";
import type { RecordedHit } from "../learning/evaluator";
import { evaluateSegment } from "../learning/evaluator";
import {
  type LearningSession,
  createSession,
  loadSong,
  startSegment,
  startCountIn,
  startPlaying,
  processResult,
  nextSegment,
  jumpToSegment,
  startListening,
  processExamResult,
} from "../learning/state-machine";
import { AudioEngine } from "../engine/audio-engine";
import { bpmToSecondsPerBeat } from "../utils/timing";

export function useLearningSession(engine: AudioEngine | null) {
  const [session, setSession] = useState<LearningSession>(createSession);
  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const playStartTimeRef = useRef<number>(0);
  const segmentTimerRef = useRef<number>(0);
  const countInTimerRef = useRef<number>(0);
  const hitResultsRef = useRef<Map<number, HitResult>>(new Map());

  const currentSegment: Segment | null =
    session.segments[session.currentSegmentIndex] ?? null;

  const currentBpm = session.bpmController?.currentBpm ?? 0;
  const targetBpm = session.bpmController?.targetBpm ?? 0;

  /** Load a parsed MIDI file */
  const load = useCallback((track: DrumTrack) => {
    setSession((s) => loadSong(s, track));
  }, []);

  /** Start practicing from current segment */
  const start = useCallback(() => {
    setSession((s) => {
      if (s.state === "SONG_LOADED" || s.state === "EVALUATE" || s.state === "NEXT_SEGMENT") {
        return startSegment(s);
      }
      return s;
    });
  }, []);

  /** Begin listening mode */
  const listen = useCallback(() => {
    setSession((s) => startListening(s));
  }, []);

  /** Begin count-in and then playing */
  const beginPlaying = useCallback(() => {
    if (!engine) return;

    setSession((s) => {
      const counted = startCountIn(s);

      // Schedule 4-beat count-in
      const beatDur = bpmToSecondsPerBeat(
        s.bpmController?.currentBpm ?? 120
      );
      const now = engine.ctx.currentTime;

      for (let i = 0; i < 4; i++) {
        engine.scheduleClick(now + i * beatDur, i === 0);
      }

      // After count-in, transition to PLAYING
      const countInDuration = 4 * beatDur;
      clearTimeout(countInTimerRef.current);
      countInTimerRef.current = window.setTimeout(() => {
        recordedHitsRef.current = [];
        hitResultsRef.current = new Map();
        playStartTimeRef.current = engine.ctx.currentTime;
        setSession((s2) => startPlaying(s2));

        // Schedule segment end
        const seg = s.segments[s.currentSegmentIndex];
        if (seg && s.bpmController) {
          const bpmRatio = (s.bpmController.targetBpm) / s.bpmController.currentBpm;
          const segDuration = (seg.endTime - seg.startTime) * bpmRatio;

          // Schedule metronome clicks during segment
          if (s.metronomeEnabled) {
            const timeSig = s.track?.timeSignature ?? [4, 4];
            const numBeats = Math.ceil(segDuration / beatDur);
            for (let i = 0; i < numBeats; i++) {
              engine.scheduleClick(
                engine.ctx.currentTime + i * beatDur,
                i % timeSig[0] === 0
              );
            }
          }

          clearTimeout(segmentTimerRef.current);
          segmentTimerRef.current = window.setTimeout(() => {
            evaluate();
          }, segDuration * 1000);
        }
      }, countInDuration * 1000);

      return counted;
    });
  }, [engine]);

  /** Record a hit during playing */
  const recordHit = useCallback(
    (note: number, velocity: number) => {
      if (!engine) return;
      const elapsed = engine.ctx.currentTime - playStartTimeRef.current;
      recordedHitsRef.current.push({ note, velocity, time: elapsed });
    },
    [engine]
  );

  /** Evaluate the current attempt */
  const evaluate = useCallback(() => {
    setSession((s) => {
      const seg = s.segments[s.currentSegmentIndex];
      if (!seg || !s.bpmController || !s.track) return s;

      const result = evaluateSegment(
        seg.notes,
        recordedHitsRef.current,
        seg.startTime,
        s.bpmController.currentBpm,
        s.track.bpm
      );

      // Build hit results map
      const resultsMap = new Map<number, HitResult>();
      result.hits.forEach((h, i) => resultsMap.set(i, h));
      hitResultsRef.current = resultsMap;

      return processResult(s, result);
    });
  }, []);

  /** Move to next segment */
  const goNext = useCallback(() => {
    setSession((s) => nextSegment(s));
  }, []);

  /** Jump to specific segment */
  const goToSegment = useCallback((index: number) => {
    setSession((s) => jumpToSegment(s, index));
  }, []);

  /** Process exam result */
  const examResult = useCallback((result: SegmentResult, withClick: boolean) => {
    setSession((s) => processExamResult(s, result, withClick));
  }, []);

  /** Stop any running timers */
  const stop = useCallback(() => {
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    setSession(createSession);
  }, []);

  return {
    session,
    currentSegment,
    currentBpm,
    targetBpm,
    hitResults: hitResultsRef.current,
    load,
    start,
    listen,
    beginPlaying,
    recordHit,
    evaluate,
    goNext,
    goToSegment,
    examResult,
    stop,
  };
}
