interface Props {
  currentBpm: number;
  targetBpm: number;
  segmentIndex: number;
  totalSegments: number;
  metronomeEnabled: boolean;
  onToggleMetronome: () => void;
}

export function TransportBar({
  currentBpm,
  targetBpm,
  segmentIndex,
  totalSegments,
  metronomeEnabled,
  onToggleMetronome,
}: Props) {
  return (
    <div class="flex items-center gap-4 px-4 py-2 bg-[#141414] border-b border-[#2a2a2a] text-sm">
      <span class="text-[#f59e0b] font-bold">drumtutor</span>

      <div class="flex items-center gap-1 ml-auto">
        <span class="text-[#888]">BPM</span>
        <span class="text-[#e0e0e0] font-bold">{currentBpm}</span>
        <span class="text-[#555]">/</span>
        <span class="text-[#888]">{targetBpm}</span>
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
        class={`text-lg ${metronomeEnabled ? "text-[#f59e0b]" : "text-[#555]"} hover:text-[#e0e0e0]`}
        onClick={onToggleMetronome}
        title={metronomeEnabled ? "Metronome ON" : "Metronome OFF"}
      >
        {metronomeEnabled ? "\u{1F50A}" : "\u{1F507}"}
      </button>
    </div>
  );
}
