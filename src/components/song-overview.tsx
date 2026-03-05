import type { Segment } from "../engine/types";

interface Props {
  segments: Segment[];
  currentIndex: number;
  passedSegments: Set<number>;
  onSelect: (index: number) => void;
}

export function SongOverview({
  segments,
  currentIndex,
  passedSegments,
  onSelect,
}: Props) {
  if (segments.length === 0) return null;

  return (
    <div class="flex flex-col gap-1 p-3 bg-[#141414] border-t border-[#2a2a2a]">
      <div class="text-xs text-[#888] mb-1">
        Song Overview ({segments.length} segments)
      </div>
      <div class="flex gap-1 flex-wrap">
        {segments.map((seg) => {
          let bg = "#2a2a2a"; // todo: gray
          let border = "transparent";

          if (passedSegments.has(seg.index)) {
            bg = "#166534"; // passed: green
          }
          if (seg.index === currentIndex) {
            border = "#3b82f6"; // current: blue border
            if (!passedSegments.has(seg.index)) {
              bg = "#1e3a5f"; // current but not passed: blue tint
            }
          }

          // Difficulty indicator via opacity
          const opacity = 0.5 + seg.difficulty * 0.5;

          return (
            <button
              key={seg.index}
              class="w-8 h-6 rounded text-[10px] leading-none font-bold cursor-pointer hover:brightness-125 transition-all"
              style={{
                backgroundColor: bg,
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor: border,
                opacity,
                color: "#e0e0e0",
              }}
              onClick={() => onSelect(seg.index)}
              title={`Segment ${seg.index + 1}: measures ${seg.startMeasure + 1}-${seg.endMeasure}, ${seg.notes.length} notes`}
            >
              {seg.index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
