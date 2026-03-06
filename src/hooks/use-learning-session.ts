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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const playStartTimeRef = useRef<number>(0);
  const segmentTimerRef = useRef<number>(0);
  const countInTimerRef = useRef<number>(0);
  const hitResultsRef = useRef<Map<number, HitResult>>(new Map());

  // Listen mode state
  const listenTimerRef = useRef<number>(0);
  const listenSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const listenStartAudioTimeRef = useRef<number>(0);
  const listenPositionRef = useRef<number>(0);
  const [listenPaused, setListenPaused] = useState(false);

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

  /** Helper: schedule notes from a given position */
  const scheduleListenFrom = useCallback((fromTime: number) => {
    if (!engine) return;
    const track = sessionRef.current.track;
    if (!track) return;

    const now = engine.ctx.currentTime;
    listenStartAudioTimeRef.current = now - fromTime;
    listenPositionRef.current = fromTime;

    const sources: AudioBufferSourceNode[] = [];

    // Schedule remaining notes
    for (const note of track.notes) {
      if (note.time < fromTime - 0.01) continue;
      const src = engine.scheduleTrigger(
        note.note,
        note.velocity,
        now + (note.time - fromTime)
      );
      if (src) sources.push(src);
    }

    // Schedule metronome clicks
    const beatDur = bpmToSecondsPerBeat(track.bpm);
    const timeSig = track.timeSignature;
    const firstBeat = Math.ceil(fromTime / beatDur);
    const numBeats = Math.ceil(track.durationSeconds / beatDur);
    for (let i = firstBeat; i < numBeats; i++) {
      const t = i * beatDur;
      engine.scheduleClick(now + (t - fromTime), i % timeSig[0] === 0);
    }

    listenSourcesRef.current = sources;

    // Timer to return to SONG_LOADED when done
    clearTimeout(listenTimerRef.current);
    const remaining = track.durationSeconds - fromTime + 0.5;
    listenTimerRef.current = window.setTimeout(() => {
      listenSourcesRef.current = [];
      setListenPaused(false);
      setSession((s) => ({
        ...s,
        state: "SONG_LOADED",
        statusMessage: `Loaded: ${s.segments.length} segments at ${track.bpm} BPM`,
      }));
    }, remaining * 1000);
  }, [engine]);

  /** Stop all scheduled listen sources and metronome */
  const cancelListenSources = useCallback(() => {
    clearTimeout(listenTimerRef.current);
    for (const src of listenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    listenSourcesRef.current = [];
    engine?.cancelScheduled();
  }, [engine]);

  /** Begin listening mode */
  const listen = useCallback(() => {
    if (!engine) return;
    setListenPaused(false);
    scheduleListenFrom(0);
    setSession((s) => startListening(s));
  }, [engine, scheduleListenFrom]);

  /** Pause listening */
  const pauseListen = useCallback(() => {
    if (!engine) return;
    // Save current position
    const elapsed = engine.ctx.currentTime - listenStartAudioTimeRef.current;
    listenPositionRef.current = elapsed;
    cancelListenSources();
    setListenPaused(true);
  }, [engine, cancelListenSources]);

  /** Resume listening from saved position */
  const resumeListen = useCallback(() => {
    if (!engine) return;
    setListenPaused(false);
    scheduleListenFrom(listenPositionRef.current);
  }, [engine, scheduleListenFrom]);

  /** Stop listening — return to SONG_LOADED */
  const stopListen = useCallback(() => {
    cancelListenSources();
    setListenPaused(false);
    setSession((s) => {
      if (!s.track) return createSession();
      return {
        ...s,
        state: "SONG_LOADED",
        statusMessage: `Loaded: ${s.segments.length} segments at ${s.track.bpm} BPM`,
      };
    });
  }, [cancelListenSources]);

  /** Get current listen position (for playhead, called from app.tsx) */
  const getListenPosition = useCallback((): number => {
    if (!engine) return listenPositionRef.current;
    if (listenPaused) return listenPositionRef.current;
    return engine.ctx.currentTime - listenStartAudioTimeRef.current;
  }, [engine, listenPaused]);

  /** Seek to a specific position during listen */
  const seekListen = useCallback((time: number) => {
    if (!engine) return;
    const track = sessionRef.current.track;
    if (!track) return;

    const clamped = Math.max(0, Math.min(time, track.durationSeconds));
    cancelListenSources();
    listenPositionRef.current = clamped;

    if (!listenPaused) {
      scheduleListenFrom(clamped);
    }
  }, [engine, listenPaused, cancelListenSources, scheduleListenFrom]);

  /** Play current segment through speakers (preview) */
  const segmentListenSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const segmentListenTimerRef = useRef<number>(0);
  const segmentListenStartRef = useRef<number>(0);
  const segmentListenBpmRatioRef = useRef<number>(1);
  const [segmentListening, setSegmentListening] = useState(false);

  const listenSegment = useCallback(() => {
    if (!engine) return;
    const s = sessionRef.current;
    const seg = s.segments[s.currentSegmentIndex];
    const track = s.track;
    if (!seg || !track || !s.bpmController) return;

    // Cancel any previous segment listen
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    engine.cancelScheduled();

    const bpm = s.bpmController.currentBpm;
    const bpmRatio = track.bpm / bpm;
    const now = engine.ctx.currentTime;
    const sources: AudioBufferSourceNode[] = [];

    segmentListenStartRef.current = now;
    segmentListenBpmRatioRef.current = bpmRatio;
    setSegmentListening(true);

    // Schedule segment notes at current practice BPM
    for (const note of seg.notes) {
      const t = (note.time - seg.startTime) * bpmRatio;
      const src = engine.scheduleTrigger(note.note, note.velocity, now + t);
      if (src) sources.push(src);
    }

    // Schedule metronome
    const beatDur = bpmToSecondsPerBeat(bpm);
    const segDuration = (seg.endTime - seg.startTime) * bpmRatio;
    const timeSig = track.timeSignature;
    const numBeats = Math.ceil(segDuration / beatDur);
    for (let i = 0; i < numBeats; i++) {
      engine.scheduleClick(now + i * beatDur, i % timeSig[0] === 0);
    }

    segmentListenSourcesRef.current = sources;

    // Clean up when done
    clearTimeout(segmentListenTimerRef.current);
    segmentListenTimerRef.current = window.setTimeout(() => {
      segmentListenSourcesRef.current = [];
      setSegmentListening(false);
    }, (segDuration + 0.5) * 1000);
  }, [engine]);

  /** Get current segment-listen playhead position in song time */
  const getSegmentListenPosition = useCallback((): number | undefined => {
    if (!engine || !segmentListening) return undefined;
    const seg = sessionRef.current.segments[sessionRef.current.currentSegmentIndex];
    if (!seg) return undefined;
    const elapsed = engine.ctx.currentTime - segmentListenStartRef.current;
    return seg.startTime + elapsed / segmentListenBpmRatioRef.current;
  }, [engine, segmentListening]);

  /** Begin count-in and then playing */
  const beginPlaying = useCallback(() => {
    if (!engine) return;

    setSession((s) => {
      const counted = startCountIn(s);

      const beatDur = bpmToSecondsPerBeat(
        s.bpmController?.currentBpm ?? 120
      );
      const now = engine.ctx.currentTime;

      for (let i = 0; i < 4; i++) {
        engine.scheduleClick(now + i * beatDur, i === 0);
      }

      const countInDuration = 4 * beatDur;
      clearTimeout(countInTimerRef.current);
      countInTimerRef.current = window.setTimeout(() => {
        recordedHitsRef.current = [];
        hitResultsRef.current = new Map();
        playStartTimeRef.current = engine.ctx.currentTime;
        setSession((s2) => startPlaying(s2));

        const seg = s.segments[s.currentSegmentIndex];
        if (seg && s.bpmController) {
          const bpmRatio = (s.bpmController.targetBpm) / s.bpmController.currentBpm;
          const segDuration = (seg.endTime - seg.startTime) * bpmRatio;

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

  /** Full reset */
  const stop = useCallback(() => {
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentListenTimerRef.current);
    cancelListenSources();
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    segmentListenSourcesRef.current = [];
    setListenPaused(false);
    setSegmentListening(false);
    engine?.cancelScheduled();
    setSession(createSession);
  }, [engine, cancelListenSources]);

  return {
    session,
    currentSegment,
    currentBpm,
    targetBpm,
    hitResults: hitResultsRef.current,
    listenPaused,
    segmentListening,
    load,
    start,
    listen,
    listenSegment,
    pauseListen,
    resumeListen,
    stopListen,
    seekListen,
    getListenPosition,
    getSegmentListenPosition,
    beginPlaying,
    recordHit,
    evaluate,
    goNext,
    goToSegment,
    examResult,
    stop,
  };
}
