import { useState, useRef, useCallback } from "preact/hooks";
import type { LearningState } from "../engine/types";
import type { MidiDevice } from "../engine/midi-input";

interface Props {
  currentBpm: number;
  targetBpm: number;
  segmentIndex: number;
  totalSegments: number;
  metronomeEnabled: boolean;
  state: LearningState;
  // MIDI
  midiConnected: boolean;
  midiDeviceName: string;
  midiDevices: MidiDevice[];
  midiError: string | null;
  onMidiInit: () => void;
  onMidiConnect: (id: string) => void;
  onMidiDisconnect: () => void;
  // Controls
  onToggleMetronome: () => void;
  onSetTargetBpm: (bpm: number) => void;
  onReset: () => void;
}

export function TransportBar({
  currentBpm,
  targetBpm,
  segmentIndex,
  totalSegments,
  metronomeEnabled,
  state,
  midiConnected,
  midiDeviceName,
  midiDevices,
  midiError,
  onMidiInit,
  onMidiConnect,
  onMidiDisconnect,
  onToggleMetronome,
  onSetTargetBpm,
  onReset,
}: Props) {
  const showReset = state !== "IDLE" && state !== "SONG_LOADED";
  const [editingBpm, setEditingBpm] = useState(false);
  const [midiOpen, setMidiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitBpm = useCallback(() => {
    const val = parseInt(inputRef.current?.value ?? "", 10);
    if (!isNaN(val) && val > 0) {
      onSetTargetBpm(val);
    }
    setEditingBpm(false);
  }, [onSetTargetBpm]);

  const startEditing = useCallback(() => {
    setEditingBpm(true);
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }, []);

  const handleMidiClick = useCallback(() => {
    if (midiConnected) {
      onMidiDisconnect();
      return;
    }
    if (midiDevices.length === 0) {
      onMidiInit();
    }
    setMidiOpen((v) => !v);
  }, [midiConnected, midiDevices.length, onMidiInit, onMidiDisconnect]);

  return (
    <div class="flex items-center gap-3 px-4 py-2 bg-[#141414] border-b border-[#2a2a2a] text-sm">
      <span class="text-[#f59e0b] font-bold">drumtutor</span>

      {/* MIDI selector */}
      <div class="relative">
        <button
          class={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${
            midiConnected
              ? "bg-[#1a2e1a] text-[#22c55e] hover:bg-[#1a3a1a]"
              : midiError
                ? "bg-[#2e1a1a] text-[#ef4444] hover:bg-[#3a1a1a]"
                : "bg-[#2a2a2a] text-[#888] hover:bg-[#333]"
          }`}
          onClick={handleMidiClick}
          title={midiConnected ? `${midiDeviceName} — click to disconnect` : "Connect MIDI device"}
        >
          <span class={`w-1.5 h-1.5 rounded-full ${midiConnected ? "bg-[#22c55e]" : "bg-[#555]"}`} />
          {midiConnected ? midiDeviceName.split(" ").slice(0, 2).join(" ") : "MIDI"}
        </button>

        {midiOpen && !midiConnected && (
          <div class="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded shadow-lg z-20 min-w-[200px]">
            {midiDevices.length === 0 ? (
              <div class="px-3 py-2 text-xs text-[#888]">
                {midiError ? midiError : "Detecting..."}
                <button
                  class="block mt-1 text-[#f59e0b] hover:underline"
                  onClick={() => { onMidiInit(); }}
                >
                  Refresh
                </button>
              </div>
            ) : (
              midiDevices.map((d) => (
                <button
                  key={d.id}
                  class="block w-full px-3 py-2 text-xs text-left text-[#e0e0e0] hover:bg-[#2a2a2a]"
                  onClick={() => {
                    onMidiConnect(d.id);
                    setMidiOpen(false);
                  }}
                >
                  {d.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div class="flex items-center gap-1 ml-auto">
        <span class="text-[#888]">BPM</span>
        <span class="text-[#e0e0e0] font-bold">{currentBpm}</span>
        <span class="text-[#555]">/</span>
        {editingBpm ? (
          <input
            ref={inputRef}
            type="number"
            defaultValue={targetBpm}
            class="w-12 px-1 py-0 bg-[#0a0a0a] border border-[#f59e0b] rounded text-sm text-[#e0e0e0] text-center"
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitBpm();
              if (e.key === "Escape") setEditingBpm(false);
            }}
          />
        ) : (
          <span
            class="text-[#888] cursor-pointer hover:text-[#f59e0b] border-b border-dashed border-[#555]"
            onClick={startEditing}
            title="Click to set target BPM"
          >
            {targetBpm}
          </span>
        )}
      </div>

      <div class="flex items-center gap-1">
        <span class="text-[#888]">Seg</span>
        <span class="text-[#e0e0e0] font-bold">
          {totalSegments > 0 ? segmentIndex + 1 : 0}
        </span>
        <span class="text-[#555]">/</span>
        <span class="text-[#888]">{totalSegments}</span>
      </div>

      <button
        class={`px-2 py-0.5 rounded text-xs font-bold ${
          metronomeEnabled
            ? "bg-[#f59e0b] text-[#0a0a0a]"
            : "bg-[#2a2a2a] text-[#555]"
        } hover:opacity-80`}
        onClick={onToggleMetronome}
        title={metronomeEnabled ? "Click track ON" : "Click track OFF"}
      >
        Click
      </button>

      {showReset && (
        <button
          class="px-3 py-1 bg-[#2a2a2a] text-[#888] rounded text-xs hover:bg-[#333] hover:text-[#e0e0e0]"
          onClick={onReset}
          title="Reset — stop all audio and return to song selection"
        >
          Reset
        </button>
      )}
    </div>
  );
}
