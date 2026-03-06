import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";
import type { DrumTrack } from "./engine/types";
import { useAudioEngine } from "./hooks/use-audio-engine";
import { useMidiInput } from "./hooks/use-midi-input";
import { useLearningSession } from "./hooks/use-learning-session";
import { ConnectScreen } from "./components/connect-screen";
import { SongPicker } from "./components/song-picker";
import { SegmentView } from "./components/segment-view";
import { SongOverview } from "./components/song-overview";
import { TransportBar } from "./components/transport-bar";
import { PracticeHud } from "./components/practice-hud";

/** Calculate measure duration in seconds */
function measureDuration(bpm: number, timeSig: [number, number]): number {
  return (60 / bpm) * timeSig[0];
}

/** Format seconds as m:ss */
function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const MEASURES_PER_ROW = 4;
const LISTEN_ROWS = 2;
const LISTEN_WINDOW_MEASURES = MEASURES_PER_ROW * LISTEN_ROWS;

export function App() {
  const audio = useAudioEngine();
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Playhead animation
  const [playheadTime, setPlayheadTime] = useState<number | undefined>(undefined);
  const rafRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);

  // MIDI note handler
  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      audio.trigger(note, velocity);
      learningRef.current?.recordHit(note, velocity);
    },
    [audio.trigger]
  );

  const midi = useMidiInput(handleNoteOn);
  const learning = useLearningSession(audio.engine);
  const learningRef = useRef(learning);
  learningRef.current = learning;

  const initAudio = useCallback(async () => {
    await audio.init();
    setAudioInitialized(true);
  }, [audio.init]);

  const handleSongLoad = useCallback(
    (track: DrumTrack) => {
      learning.load(track);
    },
    [learning.load]
  );

  // Animate playhead
  useEffect(() => {
    const state = learning.session.state;

    if (state === "LISTENING") {
      if (learning.listenPaused) {
        setPlayheadTime(learning.getListenPosition());
        cancelAnimationFrame(rafRef.current);
        return;
      }

      const animate = () => {
        setPlayheadTime(learning.getListenPosition());
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafRef.current);
    }

    // Segment listen playhead (preview)
    if (learning.segmentListening) {
      const animate = () => {
        setPlayheadTime(learning.getSegmentListenPosition());
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafRef.current);
    }

    if (state !== "PLAYING" && state !== "PREP_COUNT") {
      cancelAnimationFrame(rafRef.current);
      if (state !== "EVALUATE") setPlayheadTime(undefined);
      return;
    }

    if (state === "PLAYING" && audio.engine) {
      playStartRef.current = audio.engine.currentTime;
      const segment = learning.currentSegment;
      if (!segment || !learning.session.track) return;

      const bpmRatio = learning.session.track.bpm / learning.currentBpm;

      const animate = () => {
        if (!audio.engine) return;
        const elapsed = audio.engine.currentTime - playStartRef.current;
        const scaledTime = segment.startTime + elapsed / bpmRatio;
        setPlayheadTime(scaledTime);
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [learning.session.state, learning.listenPaused, learning.segmentListening]);

  const [metronomeOn, setMetronomeOn] = useState(true);
  const segment = learning.currentSegment;
  const track = learning.session.track;

  // Listen window: compute 2 rows of 4 measures each around playhead
  const listenRows = useMemo(() => {
    if (!track || learning.session.state !== "LISTENING") return null;

    const measDur = measureDuration(track.bpm, track.timeSignature);
    const pos = playheadTime ?? 0;

    // Place playhead in first row with 1 measure lead-in
    const rawStart = pos - measDur;
    const startMeasure = Math.max(0, Math.floor(rawStart / measDur));
    const windowStart = startMeasure * measDur;

    const rows: { start: number; end: number; notes: typeof track.notes }[] = [];
    for (let r = 0; r < LISTEN_ROWS; r++) {
      const rowStart = windowStart + r * MEASURES_PER_ROW * measDur;
      const rowEnd = rowStart + MEASURES_PER_ROW * measDur;
      const notes = track.notes.filter(
        (n) => n.time >= rowStart - 0.001 && n.time < rowEnd + 0.001
      );
      rows.push({ start: rowStart, end: rowEnd, notes });
    }

    return rows;
  }, [track, learning.session.state, playheadTime]);

  // Seek helpers for listen mode
  const seekRelative = useCallback(
    (measures: number) => {
      if (!track) return;
      const measDur = measureDuration(track.bpm, track.timeSignature);
      const pos = learning.getListenPosition();
      learning.seekListen(pos + measures * measDur);
      // Update playhead immediately when paused
      if (learning.listenPaused) {
        setPlayheadTime(pos + measures * measDur);
      }
    },
    [track, learning]
  );

  // Listen-mode: click on canvas seeks to that time
  const handleListenTimeClick = useCallback(
    (time: number) => {
      learning.seekListen(time);
      setPlayheadTime(time);
    },
    [learning]
  );

  // Listen-mode: click on segment in overview seeks to its start
  const handleListenSegmentSelect = useCallback(
    (index: number) => {
      const seg = learning.session.segments[index];
      if (!seg) return;
      learning.seekListen(seg.startTime);
      setPlayheadTime(seg.startTime);
    },
    [learning]
  );

  // Compute which segment the playhead is in during listen mode
  const listenSegmentIndex = useMemo(() => {
    if (learning.session.state !== "LISTENING" || playheadTime == null) return -1;
    const segs = learning.session.segments;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (playheadTime >= segs[i].startTime) return i;
    }
    return 0;
  }, [learning.session.state, learning.session.segments, playheadTime]);

  if (!audioInitialized) {
    return (
      <div class="flex flex-col items-center justify-center h-full gap-6">
        <h1 class="text-3xl font-bold text-[#f59e0b]">drumtutor</h1>
        <p class="text-[#888] text-sm">
          Browser-based drum learning with your e-kit
        </p>
        <button
          class="px-6 py-3 bg-[#f59e0b] text-[#0a0a0a] rounded font-bold text-lg hover:bg-[#d97706]"
          onClick={initAudio}
        >
          Start
        </button>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-full">
      <TransportBar
        currentBpm={learning.currentBpm}
        targetBpm={learning.targetBpm}
        segmentIndex={learning.session.currentSegmentIndex}
        totalSegments={learning.session.segments.length}
        metronomeEnabled={metronomeOn}
        state={learning.session.state}
        onToggleMetronome={() => setMetronomeOn(!metronomeOn)}
        onReset={learning.stop}
      />

      <div class="flex-1 flex flex-col overflow-hidden">
        {/* MIDI Connection + Song Loading */}
        {(learning.session.state === "IDLE" ||
          learning.session.state === "SONG_LOADED") && (
          <div class="flex flex-col gap-4 p-4">
            <ConnectScreen
              devices={midi.devices}
              connected={midi.connected}
              deviceName={midi.deviceName}
              error={midi.error}
              onInit={async () => { await midi.init(); }}
              onConnect={midi.connect}
              onDisconnect={midi.disconnect}
            />

            {learning.session.state === "IDLE" && (
              <SongPicker onLoad={handleSongLoad} />
            )}

            {learning.session.state === "SONG_LOADED" && track && (
              <div class="p-4 bg-[#141414] border border-[#2a2a2a] rounded max-w-md mx-auto text-sm">
                <div class="text-[#f59e0b] font-bold mb-2">{track.name}</div>
                <div class="text-[#888] space-y-1">
                  <div>BPM: {track.bpm} | Time: {track.timeSignature.join("/")}</div>
                  <div>Notes: {track.notes.length} | Segments: {learning.session.segments.length}</div>
                  <div>Duration: {formatTime(track.durationSeconds)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Windowed listen view — 2 rows of 4 measures */}
        {learning.session.state === "LISTENING" && track && listenRows && (
          <div class="flex-1 flex flex-col p-2 min-h-0">
            {/* Position / time bar */}
            <div class="flex items-center gap-3 px-2 pb-1 text-xs text-[#888]">
              <span>{formatTime(playheadTime ?? 0)}</span>
              <div class="flex-1 h-1.5 bg-[#2a2a2a] rounded relative cursor-pointer"
                onClick={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  const frac = (e.clientX - rect.left) / rect.width;
                  const t = frac * track.durationSeconds;
                  learning.seekListen(t);
                  setPlayheadTime(t);
                }}>
                <div
                  class="h-full bg-[#f59e0b] rounded pointer-events-none"
                  style={{
                    width: `${((playheadTime ?? 0) / track.durationSeconds) * 100}%`,
                  }}
                />
              </div>
              <span>{formatTime(track.durationSeconds)}</span>
            </div>

            {/* 2 notation rows */}
            <div class="flex-1 flex flex-col gap-0 min-h-0">
              {listenRows.map((row, i) => (
                <div key={i} class="flex-1 min-h-0">
                  <SegmentView
                    notes={row.notes}
                    startTime={row.start}
                    endTime={row.end}
                    bpm={track.bpm}
                    timeSig={track.timeSignature}
                    playheadTime={playheadTime}
                    onTimeClick={handleListenTimeClick}
                  />
                </div>
              ))}
            </div>

            {/* Scroll controls when paused */}
            {learning.listenPaused && (
              <div class="flex items-center justify-center gap-3 pt-1">
                <button
                  class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
                  onClick={() => seekRelative(-LISTEN_WINDOW_MEASURES)}
                >
                  &laquo; {LISTEN_WINDOW_MEASURES} bars
                </button>
                <button
                  class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
                  onClick={() => seekRelative(-1)}
                >
                  &lsaquo; 1 bar
                </button>
                <button
                  class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
                  onClick={() => seekRelative(1)}
                >
                  1 bar &rsaquo;
                </button>
                <button
                  class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
                  onClick={() => seekRelative(LISTEN_WINDOW_MEASURES)}
                >
                  {LISTEN_WINDOW_MEASURES} bars &raquo;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Segment Notation View (practice mode) */}
        {segment &&
          learning.session.state !== "IDLE" &&
          learning.session.state !== "LISTENING" &&
          track && (
            <div class="flex-1 p-2">
              <SegmentView
                notes={segment.notes}
                startTime={segment.startTime}
                endTime={segment.endTime}
                bpm={track.bpm}
                timeSig={track.timeSignature}
                playheadTime={playheadTime}
                hitResults={learning.hitResults}
              />
            </div>
          )}
      </div>

      <PracticeHud
        state={learning.session.state}
        statusMessage={learning.session.statusMessage}
        accuracy={learning.session.lastResult?.accuracy ?? null}
        streak={learning.session.streak}
        listenPaused={learning.listenPaused}
        onStart={learning.start}
        onPlay={learning.beginPlaying}
        onNext={learning.goNext}
        onListen={learning.listen}
        onListenSegment={learning.listenSegment}
        onPauseListen={learning.pauseListen}
        onResumeListen={learning.resumeListen}
        onStopListen={learning.stopListen}
      />

      {learning.session.segments.length > 0 && (
        <SongOverview
          segments={learning.session.segments}
          currentIndex={learning.session.state === "LISTENING" ? listenSegmentIndex : learning.session.currentSegmentIndex}
          passedSegments={learning.session.passedSegments}
          onSelect={learning.session.state === "LISTENING" ? handleListenSegmentSelect : learning.goToSegment}
        />
      )}
    </div>
  );
}
