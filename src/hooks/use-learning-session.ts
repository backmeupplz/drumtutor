import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import type {
  DrumTrack,
  Segment,
  SegmentResult,
  HitResult,
  HitQuality,
  ExtraHit,
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
  startAutoLearn as smStartAutoLearn,
} from "../learning/state-machine";
import { BpmController } from "../learning/bpm-controller";
import { AudioEngine } from "../engine/audio-engine";
import { bpmToSecondsPerBeat } from "../utils/timing";
import {
  getCombinedSegment,
  saveCurriculumProgress,
  loadCurriculumProgress,
} from "../learning/curriculum";

/** Timing windows (fraction of a beat) — same as evaluator */
const CORRECT_WINDOW = 0.15;
const LATE_EARLY_WINDOW = 0.25;

/** Chain fail threshold before re-learning constituent segments */
const CHAIN_RELEARN_THRESHOLD = 10;

export function useLearningSession(engine: AudioEngine | null) {
  const [session, setSession] = useState<LearningSession>(createSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const playStartTimeRef = useRef<number>(0);
  const segmentTimerRef = useRef<number>(0);
  const countInTimerRef = useRef<number>(0);
  const hitResultsRef = useRef<Map<number, HitResult>>(new Map());
  const extraHitsRef = useRef<ExtraHit[]>([]);
  const autoAdvanceTimerRef = useRef<number>(0);

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
        const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
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
  const listenStartAudioTimeRef = useRef<number>(0);
  const listenFromTimeRef = useRef<number>(0);
  const listenPositionRef = useRef<number>(0);
  const listenBpmRatioRef = useRef<number>(1);
  const [listenPaused, setListenPaused] = useState(false);
  const listenPausedRef = useRef(false);
  listenPausedRef.current = listenPaused;

  // Use activeSegment when available, otherwise fall back to segments[currentSegmentIndex]
  const currentSegment: Segment | null =
    session.activeSegment ?? session.segments[session.currentSegmentIndex] ?? null;

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
    if (!isFinite(bpmRatio) || bpmRatio <= 0) return;

    const now = engine.ctx.currentTime;
    listenStartAudioTimeRef.current = now;
    listenFromTimeRef.current = fromTime;
    listenPositionRef.current = fromTime;
    listenBpmRatioRef.current = bpmRatio;

    const sources: AudioBufferSourceNode[] = [];

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

    if (metronomeOnRef.current) {
      const timeSig = track.timeSignature;
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
        activeSegment: s.segments[idx] ?? null,
        state: "SEGMENT_PREVIEW",
        bpmController: new BpmController(target),
        statusMessage: `Segment ${idx + 1}: Preview`,
      };
    });
  }, [cancelListenSources]);

  /** Get current listen position in song time */
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
    const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
    const track = s.track;
    if (!seg || !track || !s.bpmController) return;

    hitResultsRef.current = new Map();
    extraHitsRef.current = [];
    setHitResultVersion(0);

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

    for (const note of seg.notes) {
      const t = (note.time - seg.startTime) * bpmRatio;
      const src = engine.scheduleTrigger(note.note, note.velocity, now + t);
      if (src) sources.push(src);
    }

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
    const s = sessionRef.current;
    const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
    if (!seg) return undefined;
    const elapsed = engine.ctx.currentTime - segmentListenStartRef.current;
    return seg.startTime + elapsed / segmentListenBpmRatioRef.current;
  }, [engine, segmentListening]);

  /** Begin count-in and then playing */
  const beginPlaying = useCallback(() => {
    if (!engine) return;

    hitResultsRef.current = new Map();
    extraHitsRef.current = [];
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
        extraHitsRef.current = [];
        setHitResultVersion(0);
        playStartTimeRef.current = engine.ctx.currentTime;
        setSession((s2) => startPlaying(s2));

        const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
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

      const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
      if (!seg || !s.bpmController || !s.track) return;

      const bpm = s.bpmController.currentBpm;
      const beatDuration = 60 / bpm;
      const bpmRatio = s.track.bpm / bpm;
      const maxMatchDistance = LATE_EARLY_WINDOW * beatDuration;

      let bestIdx = -1;
      let bestOffset = Infinity;

      for (let i = 0; i < seg.notes.length; i++) {
        if (hitResultsRef.current.has(i)) continue;
        const expected = seg.notes[i];
        if (!areNotesEquivalent(expected.note, note)) continue;

        const scaledTime = (expected.time - seg.startTime) * bpmRatio;
        const offset = elapsed - scaledTime;
        // Only match within the timing window — prevents stealing future notes
        if (Math.abs(offset) > maxMatchDistance) continue;
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

        setHitResultVersion((v) => v + 1);
      } else {
        // Extra hit — not matched to any expected note
        extraHitsRef.current.push({
          note,
          velocity,
          songTime: seg.startTime + elapsed / bpmRatio,
        });
        setHitResultVersion((v) => v + 1);
      }
    },
    [engine]
  );

  /** Evaluate the current attempt */
  const evaluate = useCallback(() => {
    setSession((s) => {
      const seg = s.activeSegment ?? s.segments[s.currentSegmentIndex];
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

    const trackName = sessionRef.current.track?.name;
    if (trackName) {
      localStorage.setItem(`drumtutor:bpm:${trackName}`, String(clamped));
    }

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

    if (wasListening && engine) {
      cancelListenSources();
      listenPositionRef.current = listenSongPos;
      if (!wasPaused) {
        setTimeout(() => {
          scheduleListenFrom(listenSongPos);
        }, 0);
      }
    }
  }, [engine, listenPaused, cancelListenSources, scheduleListenFrom]);

  // ============================================================
  // AUTO-LEARN
  // ============================================================

  const [autoLearnPaused, setAutoLearnPaused] = useState(false);
  const autoLearnPausedRef = useRef(false);
  autoLearnPausedRef.current = autoLearnPaused;
  // When paused, remember what we were about to do so we can resume
  const autoLearnPendingActionRef = useRef<(() => void) | null>(null);

  /** Start auto-learn mode, optionally from a saved step */
  const startAutoLearnMode = useCallback((startFromStep?: number | unknown) => {
    // Guard against click events being passed as argument
    const step = typeof startFromStep === "number" ? startFromStep : undefined;
    clearTimeout(autoAdvanceTimerRef.current);
    setAutoLearnPaused(false);
    autoLearnPendingActionRef.current = null;
    setSession((s) => {
      if (s.segments.length === 0 || !s.track) return s;

      // Load saved progress to determine where to resume
      let resumeStep = step;
      if (resumeStep === undefined) {
        const passedIndices = loadCurriculumProgress(s.track.name);
        if (passedIndices.length > 0) {
          resumeStep = Math.max(...passedIndices) + 1;
        }
      }

      return smStartAutoLearn(s, resumeStep);
    });
  }, [engine]);

  /** Pause auto-learn — cancel pending timers, freeze in place */
  const pauseAutoLearn = useCallback(() => {
    clearTimeout(autoAdvanceTimerRef.current);
    // If we're in a segment listen, stop it
    clearTimeout(segmentListenTimerRef.current);
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    segmentListenSourcesRef.current = [];
    setSegmentListening(false);
    engine?.cancelScheduled();
    // If counting in or playing, cancel those too
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentTimerRef.current);

    setAutoLearnPaused(true);
    setSession((s) => {
      if (!s.autoLearn) return s;
      // Go back to SEGMENT_PREVIEW so we can resume cleanly
      const step = s.autoLearn.curriculum[s.autoLearn.currentStepIndex];
      return {
        ...s,
        state: "SEGMENT_PREVIEW",
        statusMessage: `Paused — ${step?.label ?? ""}`,
      };
    });
  }, [engine]);

  /** Resume auto-learn — restart from current step's preview */
  const resumeAutoLearn = useCallback(() => {
    setAutoLearnPaused(false);
    autoLearnPendingActionRef.current = null;
    // Trigger re-entry into SEGMENT_PREVIEW auto-listen by bumping state
    setSession((s) => {
      if (!s.autoLearn) return s;
      const step = s.autoLearn.curriculum[s.autoLearn.currentStepIndex];
      return {
        ...s,
        state: "SEGMENT_PREVIEW",
        statusMessage: `Listening to ${step?.label ?? ""}...`,
      };
    });
  }, []);

  /** Jump to a specific curriculum step, marking all prior steps as passed */
  const jumpToAutoStep = useCallback((stepIndex: number) => {
    clearTimeout(autoAdvanceTimerRef.current);
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentListenTimerRef.current);
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    segmentListenSourcesRef.current = [];
    setSegmentListening(false);
    setAutoLearnPaused(false);
    autoLearnPendingActionRef.current = null;
    engine?.cancelScheduled();

    setSession((s) => {
      if (!s.autoLearn || !s.track) return s;
      const al = s.autoLearn;
      const curriculum = [...al.curriculum];

      if (stepIndex < 0 || stepIndex >= curriculum.length) return s;

      // Mark all steps before target as passed, target as active, rest as pending
      for (let i = 0; i < curriculum.length; i++) {
        curriculum[i] = {
          ...curriculum[i],
          status: i < stepIndex ? "passed" : i === stepIndex ? "active" : "pending",
        };
      }

      // Save progress
      const passedIndices = curriculum
        .map((step, i) => (step.status === "passed" ? i : -1))
        .filter((i) => i >= 0);
      saveCurriculumProgress(s.track.name, passedIndices);

      const step = curriculum[stepIndex];
      const combined = getCombinedSegment(s.segments, step.segmentRange);
      const target = s.bpmController?.targetBpm ?? s.track.bpm;

      return {
        ...s,
        state: "SEGMENT_PREVIEW",
        activeSegment: combined,
        metronomeEnabled: step.withClick,
        bpmController: new BpmController(target),
        autoLearn: {
          curriculum,
          currentStepIndex: stepIndex,
          stepFailCount: 0,
          relearning: false,
          relearnSubIndex: 0,
          relearnPassed: new Set(),
        },
        statusMessage: step.label,
      };
    });
  }, [engine]);

  /** Stop auto-learn mode — return to manual at current segment */
  const stopAutoLearn = useCallback(() => {
    clearTimeout(autoAdvanceTimerRef.current);
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentListenTimerRef.current);
    for (const src of segmentListenSourcesRef.current) {
      try { src.stop(); } catch {}
    }
    segmentListenSourcesRef.current = [];
    setSegmentListening(false);
    setAutoLearnPaused(false);
    autoLearnPendingActionRef.current = null;
    engine?.cancelScheduled();

    setSession((s) => {
      if (!s.track) return s;
      return {
        ...s,
        autoLearn: null,
        state: "SONG_LOADED",
        statusMessage: `Loaded: ${s.segments.length} segments at ${s.track.bpm} BPM`,
      };
    });
  }, [engine]);

  /** Advance to the next curriculum step */
  const advanceAutoStep = useCallback(() => {
    setSession((s) => {
      if (!s.autoLearn || !s.track) return s;
      const al = s.autoLearn;
      const curriculum = [...al.curriculum];

      // Mark current step as passed
      curriculum[al.currentStepIndex] = {
        ...curriculum[al.currentStepIndex],
        status: "passed",
      };

      // Save progress
      const passedIndices = curriculum
        .map((step, i) => (step.status === "passed" ? i : -1))
        .filter((i) => i >= 0);
      saveCurriculumProgress(s.track.name, passedIndices);

      const nextIdx = al.currentStepIndex + 1;

      // Curriculum complete
      if (nextIdx >= curriculum.length) {
        return {
          ...s,
          autoLearn: { ...al, curriculum, currentStepIndex: al.currentStepIndex },
          state: "SONG_COMPLETE",
          statusMessage: "Congratulations! Song complete!",
        };
      }

      // Activate next step
      curriculum[nextIdx] = { ...curriculum[nextIdx], status: "active" };
      const step = curriculum[nextIdx];
      const combined = getCombinedSegment(s.segments, step.segmentRange);
      const target = s.bpmController?.targetBpm ?? s.track.bpm;

      return {
        ...s,
        state: "SEGMENT_PREVIEW",
        activeSegment: combined,
        metronomeEnabled: step.withClick,
        bpmController: new BpmController(target),
        autoLearn: {
          curriculum,
          currentStepIndex: nextIdx,
          stepFailCount: 0,
          relearning: false,
          relearnSubIndex: 0,
          relearnPassed: new Set(),
        },
        statusMessage: step.label,
      };
    });
  }, []);

  /** Handle re-learning: advance through constituent segments of a failed chain */
  const handleRelearnAdvance = useCallback(() => {
    setSession((s) => {
      if (!s.autoLearn || !s.track) return s;
      const al = s.autoLearn;
      const step = al.curriculum[al.currentStepIndex];
      const [rangeStart, rangeEnd] = step.segmentRange;

      // Mark current relearn sub-segment as passed
      const newPassed = new Set(al.relearnPassed);
      newPassed.add(al.relearnSubIndex);

      const nextSubIdx = al.relearnSubIndex + 1;
      const totalSubs = rangeEnd - rangeStart + 1;

      if (nextSubIdx >= totalSubs || newPassed.size >= totalSubs) {
        // All constituents re-learned — return to the chain
        const combined = getCombinedSegment(s.segments, step.segmentRange);
        const target = s.bpmController?.targetBpm ?? s.track.bpm;
        return {
          ...s,
          state: "SEGMENT_PREVIEW",
          activeSegment: combined,
          bpmController: new BpmController(target),
          autoLearn: {
            ...al,
            stepFailCount: 0,
            relearning: false,
            relearnSubIndex: 0,
            relearnPassed: new Set(),
          },
          statusMessage: `${step.label} (retry)`,
        };
      }

      // Move to next constituent segment
      const segIdx = rangeStart + nextSubIdx;
      const seg = s.segments[segIdx];
      const target = s.bpmController?.targetBpm ?? s.track.bpm;
      return {
        ...s,
        state: "SEGMENT_PREVIEW",
        activeSegment: seg,
        currentSegmentIndex: segIdx,
        bpmController: new BpmController(target),
        autoLearn: {
          ...al,
          relearnSubIndex: nextSubIdx,
          relearnPassed: newPassed,
        },
        statusMessage: `Re-learn S${segIdx + 1} (${newPassed.size + 1}/${totalSubs})`,
      };
    });
  }, []);

  // ============================================================
  // AUTO-ADVANCE CONDUCTOR (useEffect)
  // ============================================================

  /** Schedule an auto-advance action, respecting pause */
  const scheduleAutoAction = useCallback((action: () => void, delayMs: number, pendingMessage: string) => {
    clearTimeout(autoAdvanceTimerRef.current);
    if (autoLearnPausedRef.current) {
      autoLearnPendingActionRef.current = action;
      return;
    }
    // Show what's coming
    setSession((s) => ({ ...s, statusMessage: pendingMessage }));
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      if (autoLearnPausedRef.current) {
        autoLearnPendingActionRef.current = action;
        return;
      }
      action();
    }, delayMs);
  }, []);

  // Auto-listen when entering SEGMENT_PREVIEW in auto mode
  useEffect(() => {
    const s = session;
    if (!s.autoLearn || s.state !== "SEGMENT_PREVIEW" || autoLearnPaused) return;

    const step = s.autoLearn.curriculum[s.autoLearn.currentStepIndex];
    const label = step?.label ?? "";

    const timer = window.setTimeout(() => {
      if (autoLearnPausedRef.current) return;
      setSession((s2) => ({ ...s2, statusMessage: `Listening to ${label}...` }));
      listenSegment();
    }, 300);

    return () => clearTimeout(timer);
  }, [session.state, session.autoLearn?.currentStepIndex, session.autoLearn?.relearning, autoLearnPaused]);

  // Auto count-in after segment listen finishes
  useEffect(() => {
    const s = sessionRef.current;
    if (!s.autoLearn || autoLearnPausedRef.current) return;
    if (s.state !== "SEGMENT_PREVIEW") return;

    if (segmentListening) return;
    if (!prevSegmentListeningRef.current) return;

    // Show "Get ready to play..." immediately and keep it for the full delay
    clearTimeout(autoAdvanceTimerRef.current);
    setSession((s2) => ({ ...s2, statusMessage: "Get ready to play..." }));
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      if (autoLearnPausedRef.current) return;
      beginPlaying();
    }, 1500);

    return () => clearTimeout(autoAdvanceTimerRef.current);
  }, [segmentListening]);

  const prevSegmentListeningRef = useRef(false);
  useEffect(() => {
    prevSegmentListeningRef.current = segmentListening;
  }, [segmentListening]);

  // Auto-advance after evaluation in auto mode
  useEffect(() => {
    const s = session;
    if (!s.autoLearn || s.state !== "EVALUATE" || !s.lastResult || autoLearnPaused) return;

    const al = s.autoLearn;
    const passed = s.lastResult.passed;
    const atTarget = s.bpmController?.atTarget ?? false;
    const step = al.curriculum[al.currentStepIndex];
    const nextStep = al.curriculum[al.currentStepIndex + 1];

    clearTimeout(autoAdvanceTimerRef.current);

    if (passed && atTarget) {
      if (al.relearning) {
        scheduleAutoAction(
          () => handleRelearnAdvance(),
          2000,
          "PASSED — next re-learn segment..."
        );
      } else {
        const nextLabel = nextStep ? `Moving to ${nextStep.label}...` : "Finishing up...";
        scheduleAutoAction(
          () => advanceAutoStep(),
          2000,
          `PASSED — ${nextLabel}`
        );
      }
    } else if (passed && !atTarget) {
      const newBpm = s.bpmController?.currentBpm ?? 0;
      scheduleAutoAction(
        () => beginPlaying(),
        1000,
        `PASSED — BPM up to ${newBpm}, get ready...`
      );
    } else {
      // Failed
      if (!al.relearning && al.stepFailCount >= CHAIN_RELEARN_THRESHOLD && step.chainSize > 1) {
        const [rangeStart] = step.segmentRange;
        scheduleAutoAction(
          () => {
            setSession((s2) => {
              if (!s2.autoLearn || !s2.track) return s2;
              const st = s2.autoLearn.curriculum[s2.autoLearn.currentStepIndex];
              const [rs] = st.segmentRange;
              const seg = s2.segments[rs];
              const target = s2.bpmController?.targetBpm ?? s2.track.bpm;

              return {
                ...s2,
                state: "SEGMENT_PREVIEW",
                activeSegment: seg,
                currentSegmentIndex: rs,
                bpmController: new BpmController(target),
                autoLearn: {
                  ...s2.autoLearn,
                  relearning: true,
                  relearnSubIndex: 0,
                  relearnPassed: new Set(),
                },
                statusMessage: `Re-learn S${rs + 1}`,
              };
            });
          },
          1500,
          `FAILED — too many attempts, re-learning S${rangeStart + 1}...`
        );
      } else {
        scheduleAutoAction(
          () => {
            setSession((s2) => ({
              ...s2,
              state: "SEGMENT_PREVIEW",
              statusMessage: s2.autoLearn
                ? s2.autoLearn.curriculum[s2.autoLearn.currentStepIndex]?.label ?? ""
                : "",
            }));
          },
          1500,
          "FAILED — retrying..."
        );
      }
    }

    return () => clearTimeout(autoAdvanceTimerRef.current);
  }, [session.state, session.lastResult, session.autoLearn?.stepFailCount, autoLearnPaused]);

  /** Full reset */
  const stop = useCallback(() => {
    clearTimeout(segmentTimerRef.current);
    clearTimeout(countInTimerRef.current);
    clearTimeout(segmentListenTimerRef.current);
    clearTimeout(autoAdvanceTimerRef.current);
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
    extraHits: extraHitsRef.current,
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
    startAutoLearn: startAutoLearnMode,
    stopAutoLearn,
    autoLearnPaused,
    pauseAutoLearn,
    resumeAutoLearn,
    jumpToAutoStep,
  };
}
