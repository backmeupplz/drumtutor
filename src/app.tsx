import { useState, useCallback, useRef, useEffect } from "preact/hooks";
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

export function App() {
  const audio = useAudioEngine();
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Playhead animation
  const [playheadTime, setPlayheadTime] = useState<number | undefined>(
    undefined
  );
  const rafRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);

  // MIDI note handler — trigger audio + record for evaluation
  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      audio.trigger(note, velocity);
      learningRef.current?.recordHit(note, velocity);
    },
    [audio.trigger]
  );

  const midi = useMidiInput(handleNoteOn);

  // Learning session — pass engine ref
  const learning = useLearningSession(audio.engine);
  const learningRef = useRef(learning);
  learningRef.current = learning;

  // Initialize audio on first interaction
  const initAudio = useCallback(async () => {
    await audio.init();
    setAudioInitialized(true);
  }, [audio.init]);

  // Handle MIDI file loaded
  const handleSongLoad = useCallback(
    (track: DrumTrack) => {
      learning.load(track);
    },
    [learning.load]
  );

  // Animate playhead during PLAYING state
  useEffect(() => {
    if (
      learning.session.state !== "PLAYING" &&
      learning.session.state !== "PREP_COUNT"
    ) {
      cancelAnimationFrame(rafRef.current);
      if (learning.session.state !== "EVALUATE") {
        setPlayheadTime(undefined);
      }
      return;
    }

    if (learning.session.state === "PLAYING" && audio.engine) {
      playStartRef.current = audio.engine.currentTime;

      const segment = learning.currentSegment;
      if (!segment || !learning.session.track) return;

      const bpmRatio =
        learning.session.track.bpm / learning.currentBpm;

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
  }, [learning.session.state]);

  // Toggle metronome
  const [metronomeOn, setMetronomeOn] = useState(true);

  const segment = learning.currentSegment;

  // If no audio yet, show init button
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
      {/* Transport Bar */}
      <TransportBar
        currentBpm={learning.currentBpm}
        targetBpm={learning.targetBpm}
        segmentIndex={learning.session.currentSegmentIndex}
        totalSegments={learning.session.segments.length}
        metronomeEnabled={metronomeOn}
        onToggleMetronome={() => setMetronomeOn(!metronomeOn)}
      />

      {/* Main Content */}
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
              onInit={async () => {
                await midi.init();
              }}
              onConnect={midi.connect}
              onDisconnect={midi.disconnect}
            />

            {learning.session.state === "IDLE" && (
              <SongPicker onLoad={handleSongLoad} />
            )}

            {learning.session.state === "SONG_LOADED" &&
              learning.session.track && (
                <div class="p-4 bg-[#141414] border border-[#2a2a2a] rounded max-w-md mx-auto text-sm">
                  <div class="text-[#f59e0b] font-bold mb-2">
                    {learning.session.track.name}
                  </div>
                  <div class="text-[#888] space-y-1">
                    <div>
                      BPM: {learning.session.track.bpm} | Time:{" "}
                      {learning.session.track.timeSignature.join("/")}
                    </div>
                    <div>
                      Notes: {learning.session.track.notes.length} | Segments:{" "}
                      {learning.session.segments.length}
                    </div>
                    <div>
                      Duration:{" "}
                      {Math.round(learning.session.track.durationSeconds)}s
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Segment Notation View */}
        {segment &&
          learning.session.state !== "IDLE" &&
          learning.session.track && (
            <div class="flex-1 p-2">
              <SegmentView
                notes={segment.notes}
                startTime={segment.startTime}
                endTime={segment.endTime}
                bpm={learning.session.track.bpm}
                timeSig={learning.session.track.timeSignature}
                playheadTime={playheadTime}
                hitResults={learning.hitResults}
              />
            </div>
          )}
      </div>

      {/* Practice HUD */}
      <PracticeHud
        state={learning.session.state}
        statusMessage={learning.session.statusMessage}
        accuracy={learning.session.lastResult?.accuracy ?? null}
        streak={learning.session.streak}
        onStart={learning.start}
        onPlay={learning.beginPlaying}
        onNext={learning.goNext}
        onListen={learning.listen}
        onStop={learning.stop}
      />

      {/* Song Overview */}
      {learning.session.segments.length > 0 && (
        <SongOverview
          segments={learning.session.segments}
          currentIndex={learning.session.currentSegmentIndex}
          passedSegments={learning.session.passedSegments}
          onSelect={learning.goToSegment}
        />
      )}
    </div>
  );
}
