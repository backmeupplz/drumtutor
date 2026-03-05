import type { LearningState } from "../engine/types";

interface Props {
  state: LearningState;
  statusMessage: string;
  accuracy: number | null;
  streak: number;
  onStart: () => void;
  onPlay: () => void;
  onNext: () => void;
  onListen: () => void;
  onStop: () => void;
}

function stateLabel(state: LearningState): string {
  switch (state) {
    case "IDLE":
      return "Idle";
    case "SONG_LOADED":
      return "Ready";
    case "LISTENING":
      return "Listening";
    case "SEGMENT_PREVIEW":
      return "Preview";
    case "PREP_COUNT":
      return "Count In";
    case "PLAYING":
      return "Playing";
    case "EVALUATE":
      return "Result";
    case "NEXT_SEGMENT":
      return "Next";
    case "COMBINE":
      return "Combine";
    case "EXAM_WITH_CLICK":
      return "Exam (click)";
    case "EXAM_WITHOUT_CLICK":
      return "Exam (no click)";
    case "SONG_COMPLETE":
      return "Complete!";
  }
}

export function PracticeHud({
  state,
  statusMessage,
  accuracy,
  streak,
  onStart,
  onPlay,
  onNext,
  onListen,
  onStop,
}: Props) {
  return (
    <div class="flex items-center gap-4 px-4 py-2 bg-[#141414] border-t border-b border-[#2a2a2a]">
      <div class="flex items-center gap-2">
        <span
          class={`text-xs px-2 py-0.5 rounded ${
            state === "PLAYING"
              ? "bg-[#22c55e] text-[#0a0a0a]"
              : state === "SONG_COMPLETE"
                ? "bg-[#f59e0b] text-[#0a0a0a]"
                : "bg-[#2a2a2a] text-[#888]"
          }`}
        >
          {stateLabel(state)}
        </span>
      </div>

      <span class="text-sm text-[#888] flex-1 truncate">{statusMessage}</span>

      {accuracy !== null && (
        <div class="flex items-center gap-1 text-sm">
          <span class="text-[#888]">Acc:</span>
          <span
            class={`font-bold ${
              accuracy >= 0.8
                ? "text-[#22c55e]"
                : accuracy >= 0.6
                  ? "text-[#eab308]"
                  : "text-[#ef4444]"
            }`}
          >
            {Math.round(accuracy * 100)}%
          </span>
        </div>
      )}

      {streak > 0 && (
        <div class="flex items-center gap-1 text-sm">
          <span class="text-[#888]">Streak:</span>
          <span class="text-[#f59e0b] font-bold">{streak}</span>
        </div>
      )}

      <div class="flex gap-2">
        {state === "SONG_LOADED" && (
          <>
            <button
              class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
              onClick={onListen}
            >
              Listen
            </button>
            <button
              class="px-3 py-1 bg-[#f59e0b] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#d97706]"
              onClick={onStart}
            >
              Start
            </button>
          </>
        )}
        {state === "SEGMENT_PREVIEW" && (
          <button
            class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
            onClick={onPlay}
          >
            Play
          </button>
        )}
        {(state === "EVALUATE" || state === "NEXT_SEGMENT") && (
          <>
            <button
              class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
              onClick={onPlay}
            >
              Retry
            </button>
            {state === "NEXT_SEGMENT" && (
              <button
                class="px-3 py-1 bg-[#f59e0b] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#d97706]"
                onClick={onNext}
              >
                Next
              </button>
            )}
          </>
        )}
        {(state === "EXAM_WITH_CLICK" || state === "EXAM_WITHOUT_CLICK") && (
          <button
            class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
            onClick={onPlay}
          >
            Start Exam
          </button>
        )}
        {state !== "IDLE" && state !== "SONG_LOADED" && (
          <button
            class="px-3 py-1 bg-[#2a2a2a] text-[#888] rounded text-xs hover:bg-[#333] hover:text-[#e0e0e0]"
            onClick={onStop}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
