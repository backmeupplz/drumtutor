import { useState, useRef, useCallback } from "preact/hooks";
import type {
  DrumTrack,
  Segment,
  SegmentResult,
  HitResult,
  HitQuality,
} from "../engine/types";
import type { RecordedHit } from "../learning/evaluator";
import { evaluateSegment } from "../learning/evaluator";
import { areNotesEquivalent } from "../utils/gm-drum-map";
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
import { BpmController } from "../learning/bpm-controller";
import { AudioEngine } from "../engine/audio-engine";
import { bpmToSecondsPerBeat } from "../utils/timing";

/** Timing windows (fraction of a beat) — same as evaluator */
const CORRECT_WINDOW = 0.15;
const LATE_EARLY_WINDOW = 0.25;

export function useLearningSession(engine: AudioEngine | null) {
  const [session, setSession] = useState<LearningSession>(createSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const playStartTimeRef = useRef<number>(0);
  const segmentTimerRef = useRef<number>(0);
  const countInTimerRef = useRef<number>(0);
  const hitResultsRef = useRef<Map<number, HitResult>>(new Map());

  // Counter to force re-renders when hitResultsRef changes during PLAYING
  const [hitResultVersion, setHitResultVersion] = useState(0);

  // Metronome toggle — exposed to parent
  const [metronomeOn, setMetronomeOn] = useState(true);
  const metronomeOnRef = useRef(true);
  metronomeOnRef.current = metronomeOn;

  const toggleMetronome = useCallback(() => {
    const newValue = !metronomeOnRef.current;
    metronomeOnRef.current = newValue;
    setMetronomeOn(newValue);
    setSession((s) => ({ ...s, metronomeEnabled: newValue }));

    if (!engine) return;
    const s = sessionRef.current;

    if (!newValue) {
      // Turning OFF: cancel all scheduled clicks
      engine.cancelScheduled();
    } else {
      // Turning ON: reschedule clicks from current position
      const now = engine.ctx.currentTime;

      if (s.state === "LISTENING" && s.track && !listenPausedRef.current) {
        const ratio = listenBpmRatioRef.current;
        const elapsed = now - listenStartAudioTimeRef.current;
        const songPos = listenFromTimeRef.current + elapsed / ratio;
        const origBeatDur = bpmToSecondsPerBeat(s.track.bpm);
        const timeSig = s.track.timeSignature;
        const firstBeatIdx = Math.ceil(songPos / origBeatDur);
        for (let i = firstBeatIdx; ; i++) {
          const songTime = i * origBeatDur;
          if (songTime > s.track.durationSeconds) break;
          const audioOffset = (songTime - songPos) * ratio;
          if (audioOffset < 0) continue;
          engine.scheduleClick(now + audioOffset, i % timeSig[0] === 0);
        }
      } else if (s.state === "PLAYING" && s.bpmController && s.track) {
        const seg = s.segments[s.currentSegmentIndex];
        if (!seg) return;
        const bpm = s.bpmController.currentBpm;
        const beatDur = bpmToSecondsPerBeat(bpm);
        const bpmRatio = s.track.bpm / bpm;
        const elapsed = now - playStartTimeRef.current;
        const segDuration = (seg.endTime - seg.startTime) * bpmRatio;
        const timeSig = s.track.timeSignature;
        const firstBeat = Math.ceil(elapsed / beatDur);
        const numBeats = Math.ceil(segDuration / beatDur);
        for (let i = firstBeat; i < numBeats; i++) {
          engine.scheduleClick(now + (i * beatDur - elapsed), i % timeSig[0] === 0);
        }
      }
    }
  }, [engine]);

  // Listen mode state
  const listenTimerRef = useRef<number>(0);
  const listenSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const listenStartAudioTimeRef = useRef<number>(0); // audio context time when scheduling started
  const listenFromTimeRef = useRef<number>(0); // song time position we started from
  const listenPositionRef = useRef<number>(0); // saved song time position (for pause)
  const listenBpmRatioRef = useRef<number>(1); // track.bpm / listenBpm
  const [listenPaused, setListenPaused] = useState(false);
  const listenPausedRef = useRef(false);
  listenPausedRef.current = listenPaused;

  const currentSegment: Segment | null =
    session.segments[session.currentSegmentIndex] ?? null;

  const currentBpm = session.bpmController?.currentBpm ?? 0;
  const targetBpm = session.bpmController?.targetBpm ?? 0;

  /** Load a parsed MIDI file, restoring saved target BPM if available */
  const load = useCallback((track: DrumTrack) => {
    const saved = localStorage.getItem(`drumtutor:bpm:${track.name}`);
    const savedBpm = saved ? parseInt(saved, 10) : null;

    setSession((s) => {
      const loaded = loadSong(s, track);
      if (savedBpm && savedBpm > 0 && savedBpm <= 300) {
        const ctrl = new BpmController(savedBpm);
        ctrl.setBpm(Math.min(ctrl.currentBpm, savedBpm));
        return { ...loaded, bpmController: ctrl };
      }
      return loaded;
    });
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

  /** Helper: schedule notes from a given song-time position, scaled by target BPM */
  const scheduleListenFrom = useCallback((fromTime: number) => {
    if (!engine) return;
    const s = sessionRef.current;
    const track = s.track;
    if (!track || !track.bpm) return;

    const listenBpm = s.bpmController?.targetBpm || track.bpm;
    const bpmRatio = track.bpm / listenBpm;
    // Guard against invalid ratio
    if (!isFinite(bpmRatio) || bpmRatio <= 0) return;

    const now = engine.ctx.currentTime;
    listenStartAudioTimeRef.current = now;
    listenFromTimeRef.current = fromTime;
    listenPositionRef.current = fromTime;
    listenBpmRatioRef.current = bpmRatio;

    const sources: AudioBufferSourceNode[] = [];

    // Schedule remaining notes scaled by BPM ratio
    for (const note of track.notes) {
      if (note.time < fromTime - 0.01) continue;
      const audioOffset = (note.time - fromTime) * bpmRatio;
      const src = engine.scheduleTrigger(
        note.note,
        note.velocity,
        now + audioOffset
      );
      if (src) sources.push(src);
    }

    // Schedule metronome clicks at target BPM
    if (metronomeOnRef.current) {
      const beatDur = bpmToSecondsPerBeat(listenBpm);
      const timeSig = track.timeSignature;
      // Total real-time duration of remaining song
      const remainingRealTime = (track.durationSeconds - fromTime) * bpmRatio;
      const numBeats = Math.ceil(remainingRealTime / beatDur);
      // First beat: find the beat boundary in song time, then scale
      const origBeatDur = bpmToSecondsPerBeat(track.bpm);
      const firstBeatIdx = Math.ceil(fromTime / origBeatDur);
      for (let i = firstBeatIdx; ; i++) {
        const songTime = i * origBeatDur;
        if (songTime > track.durationSeconds) break;
        const audioOffset = (songTime - fromTime) * bpmRatio;
        if (audioOffset < 0) continue;
        engine.scheduleClick(now + audioOffset, i % timeSig[0] === 0);
      }
    }

    listenSourcesRef.current = sources;

    // Timer to return to SONG_LOADED when done
    clearTimeout(listenTimerRef.current);
    const remainingRealTime = (track.durationSeconds - fromTime) * bpmRatio + 0.5;
    listenTimerRef.current = window.setTimeout(() => {
      listenSourcesRef.current = [];
      setListenPaused(false);
      setSession((s2) => ({
        ...s2,
        state: "SONG_LOADED",
        statusMessage: `Loaded: ${s2.segments.length} segments at ${track.bpm} BPM`,
      }));
    }, remainingRealTime * 1000);
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

  /** Begin listening mode, optionally from a specific time */
  const listen = useCallback((fromTime?: number) => {
    if (!engine) return;
    // Cancel everything: previous listen, practice timers, segment listen
    cancelListenSources();
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentListenTimerRef.current);
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    segmentListenSourcesRef.current = [];
    setSegmentListening(false);

    setListenPaused(false);
    setSession((s) => startListening(s));
    scheduleListenFrom(fromTime ?? 0);
  }, [engine, cancelListenSources, scheduleListenFrom]);

  /** Pause listening */
  const pauseListen = useCallback(() => {
    if (!engine) return;
    // Save current position in song time
    const elapsed = engine.ctx.currentTime - listenStartAudioTimeRef.current;
    listenPositionRef.current = listenFromTimeRef.current + elapsed / listenBpmRatioRef.current;
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

  /** Switch from listening to practice at a specific segment */
  const switchToPractice = useCallback((segmentIndex: number) => {
    cancelListenSources();
    setListenPaused(false);
    setSession((s) => {
      if (!s.track) return s;
      const idx = Math.max(0, Math.min(segmentIndex, s.segments.length - 1));
      const target = s.bpmController?.targetBpm ?? s.track.bpm;
      return {
        ...s,
        currentSegmentIndex: idx,
        state: "SEGMENT_PREVIEW",
        bpmController: new BpmController(target),
        statusMessage: `Segment ${idx + 1}: Preview`,
      };
    });
  }, [cancelListenSources]);

  /** Get current listen position in song time (for playhead, called from app.tsx) */
  const getListenPosition = useCallback((): number => {
    if (!engine) return listenPositionRef.current;
    if (listenPaused) return listenPositionRef.current;
    const ratio = listenBpmRatioRef.current;
    if (!ratio || !isFinite(ratio)) return listenPositionRef.current;
    const elapsed = engine.ctx.currentTime - listenStartAudioTimeRef.current;
    const pos = listenFromTimeRef.current + elapsed / ratio;
    return isFinite(pos) ? pos : 0;
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

    // Clear hit results so notes appear white during preview
    hitResultsRef.current = new Map();
    setHitResultVersion(0);

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

    // Schedule metronome if enabled
    if (metronomeOnRef.current) {
      const beatDur = bpmToSecondsPerBeat(bpm);
      const segDuration = (seg.endTime - seg.startTime) * bpmRatio;
      const timeSig = track.timeSignature;
      const numBeats = Math.ceil(segDuration / beatDur);
      for (let i = 0; i < numBeats; i++) {
        engine.scheduleClick(now + i * beatDur, i % timeSig[0] === 0);
      }
    }

    segmentListenSourcesRef.current = sources;

    // Clean up when done
    const segDuration = (seg.endTime - seg.startTime) * bpmRatio;
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

    // Clear hit results immediately so notes appear white during count-in
    hitResultsRef.current = new Map();
    setHitResultVersion(0);

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
        setHitResultVersion(0);
        playStartTimeRef.current = engine.ctx.currentTime;
        setSession((s2) => startPlaying(s2));

        const seg = s.segments[s.currentSegmentIndex];
        if (seg && s.bpmController) {
          const bpmRatio = s.track!.bpm / s.bpmController.currentBpm;
          const segDuration = (seg.endTime - seg.startTime) * bpmRatio;

          if (metronomeOnRef.current) {
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

  /** Record a hit during playing — with real-time matching */
  const recordHit = useCallback(
    (note: number, velocity: number) => {
      if (!engine) return;
      const s = sessionRef.current;
      if (s.state !== "PLAYING") return;

      const elapsed = engine.ctx.currentTime - playStartTimeRef.current;
      recordedHitsRef.current.push({ note, velocity, time: elapsed });

      // Real-time matching: find the nearest unmatched expected note
      const seg = s.segments[s.currentSegmentIndex];
      if (!seg || !s.bpmController || !s.track) return;

      const bpm = s.bpmController.currentBpm;
      const beatDuration = 60 / bpm;
      const bpmRatio = s.track.bpm / bpm;

      let bestIdx = -1;
      let bestOffset = Infinity;

      for (let i = 0; i < seg.notes.length; i++) {
        if (hitResultsRef.current.has(i)) continue;
        const expected = seg.notes[i];
        if (!areNotesEquivalent(expected.note, note)) continue;

        const scaledTime = (expected.time - seg.startTime) * bpmRatio;
        const offset = elapsed - scaledTime;
        if (Math.abs(offset) < Math.abs(bestOffset)) {
          bestOffset = offset;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
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

        hitResultsRef.current.set(bestIdx, {
          expectedNote: seg.notes[bestIdx],
          quality,
          offset: bestOffset,
          playedNote: note,
        });

        // Force re-render so SegmentView picks up the new color
        setHitResultVersion((v) => v + 1);
      }
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

  /** Change target BPM — reschedules listen mode if active */
  const setTargetBpm = useCallback((bpm: number) => {
    const clamped = Math.max(20, Math.min(300, Math.round(bpm)));

    // Persist per song
    const trackName = sessionRef.current.track?.name;
    if (trackName) {
      localStorage.setItem(`drumtutor:bpm:${trackName}`, String(clamped));
    }

    // Capture current listen position before changing anything
    const wasListening = sessionRef.current.state === "LISTENING";
    let listenSongPos = 0;
    let wasPaused = false;
    if (wasListening && engine) {
      wasPaused = listenPaused;
      if (wasPaused) {
        listenSongPos = listenPositionRef.current;
      } else {
        const elapsed = engine.ctx.currentTime - listenStartAudioTimeRef.current;
        listenSongPos = listenFromTimeRef.current + elapsed / listenBpmRatioRef.current;
      }
    }

    setSession((s) => {
      if (!s.track || !s.bpmController) return s;
      const newController = new BpmController(clamped);
      newController.setBpm(Math.min(s.bpmController.currentBpm, clamped));
      return { ...s, bpmController: newController };
    });

    // Reschedule listen mode at new BPM
    if (wasListening && engine) {
      cancelListenSources();
      listenPositionRef.current = listenSongPos;
      if (!wasPaused) {
        // Will pick up the new targetBpm from session on next call
        // Use setTimeout to let session state settle first
        setTimeout(() => {
          scheduleListenFrom(listenSongPos);
        }, 0);
      }
    }
  }, [engine, listenPaused, cancelListenSources, scheduleListenFrom]);

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
    hitResultVersion,
    listenPaused,
    segmentListening,
    metronomeOn,
    toggleMetronome,
    load,
    start,
    listen,
    listenSegment,
    pauseListen,
    resumeListen,
    stopListen,
    switchToPractice,
    seekListen,
    getListenPosition,
    getSegmentListenPosition,
    beginPlaying,
    recordHit,
    evaluate,
    goNext,
    goToSegment,
    examResult,
    setTargetBpm,
    stop,
  };
}
