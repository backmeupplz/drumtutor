import type { LearningState } from "../engine/types";

type Mode = "listen" | "practice";

interface Props {
  state: LearningState;
  statusMessage: string;
  accuracy: number | null;
  streak: number;
  listenPaused?: boolean;
  onPlay: () => void;
  onNext: () => void;
  onListen: () => void;
  onListenSegment: () => void;
  onPauseListen: () => void;
  onResumeListen: () => void;
  onSwitchToListen: () => void;
  onSwitchToPractice: () => void;
}

function currentMode(state: LearningState): Mode {
  return state === "LISTENING" ? "listen" : "practice";
}

function stateLabel(state: LearningState, paused?: boolean): string {
  if (state === "LISTENING" && paused) return "Paused";
  switch (state) {
    case "IDLE": return "Idle";
    case "SONG_LOADED": return "Ready";
    case "LISTENING": return "Listening";
    case "SEGMENT_PREVIEW": return "Preview";
    case "PREP_COUNT": return "Count In";
    case "PLAYING": return "Playing";
    case "EVALUATE": return "Result";
    case "NEXT_SEGMENT": return "Next";
    case "COMBINE": return "Combine";
    case "EXAM_WITH_CLICK": return "Exam (click)";
    case "EXAM_WITHOUT_CLICK": return "Exam (no click)";
    case "SONG_COMPLETE": return "Complete!";
  }
}

export function PracticeHud({
  state,
  statusMessage,
  accuracy,
  streak,
  listenPaused,
  onPlay,
  onNext,
  onListen,
  onListenSegment,
  onPauseListen,
  onResumeListen,
  onSwitchToListen,
  onSwitchToPractice,
}: Props) {
  const mode = currentMode(state);
  const showModeToggle =
    state !== "IDLE" &&
    state !== "SONG_LOADED" &&
    state !== "PREP_COUNT" &&
    state !== "PLAYING" &&
    state !== "SONG_COMPLETE";

  return (
    <div class="flex items-center gap-4 px-4 py-2 bg-[#141414] border-t border-b border-[#2a2a2a]">
      {/* Status badge */}
      <span
        class={`text-xs px-2 py-0.5 rounded ${
          state === "PLAYING"
            ? "bg-[#22c55e] text-[#0a0a0a]"
            : state === "LISTENING" && !listenPaused
              ? "bg-[#3b82f6] text-white"
              : state === "SONG_COMPLETE"
                ? "bg-[#f59e0b] text-[#0a0a0a]"
                : "bg-[#2a2a2a] text-[#888]"
        }`}
      >
        {stateLabel(state, listenPaused)}
      </span>

      <span class="text-sm text-[#888] flex-1 truncate">{statusMessage}</span>

      {/* Accuracy / streak (practice only) */}
      {accuracy !== null && state !== "LISTENING" && (
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
      {streak > 0 && state !== "LISTENING" && (
        <div class="flex items-center gap-1 text-sm">
          <span class="text-[#888]">Streak:</span>
          <span class="text-[#f59e0b] font-bold">{streak}</span>
        </div>
      )}

      {/* Mode toggle (Listen / Practice) */}
      {showModeToggle && (
        <div class="flex rounded overflow-hidden border border-[#333]">
          <button
            class={`px-3 py-1 text-xs font-bold ${
              mode === "listen"
                ? "bg-[#3b82f6] text-white"
                : "bg-[#1a1a1a] text-[#888] hover:text-[#e0e0e0]"
            }`}
            onClick={mode === "listen" ? undefined : onSwitchToListen}
          >
            Listen
          </button>
          <button
            class={`px-3 py-1 text-xs font-bold ${
              mode === "practice"
                ? "bg-[#f59e0b] text-[#0a0a0a]"
                : "bg-[#1a1a1a] text-[#888] hover:text-[#e0e0e0]"
            }`}
            onClick={mode === "practice" ? undefined : onSwitchToPractice}
          >
            Practice
          </button>
        </div>
      )}

      {/* Mode-specific controls */}
      <div class="flex gap-2">
        {/* SONG_LOADED: initial entry buttons */}
        {state === "SONG_LOADED" && (
          <>
            <button
              class="px-3 py-1 bg-[#3b82f6] text-white rounded text-xs font-bold hover:bg-[#2563eb]"
              onClick={onListen}
            >
              Listen
            </button>
            <button
              class="px-3 py-1 bg-[#f59e0b] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#d97706]"
              onClick={onSwitchToPractice}
            >
              Practice
            </button>
          </>
        )}

        {/* LISTENING: Play/Pause toggle */}
        {state === "LISTENING" && (
          listenPaused ? (
            <button
              class="px-3 py-1 bg-[#3b82f6] text-white rounded text-xs font-bold hover:bg-[#2563eb]"
              onClick={onResumeListen}
            >
              Play
            </button>
          ) : (
            <button
              class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
              onClick={onPauseListen}
            >
              Pause
            </button>
          )
        )}

        {/* SEGMENT_PREVIEW / EVALUATE / NEXT_SEGMENT: Preview + Play */}
        {(state === "SEGMENT_PREVIEW" ||
          state === "EVALUATE" ||
          state === "NEXT_SEGMENT") && (
          <>
            <button
              class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
              onClick={onListenSegment}
            >
              Preview
            </button>
            <button
              class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
              onClick={onPlay}
            >
              {state === "EVALUATE" || state === "NEXT_SEGMENT" ? "Retry" : "Play"}
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

        {/* Exam states */}
        {(state === "EXAM_WITH_CLICK" || state === "EXAM_WITHOUT_CLICK") && (
          <button
            class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
            onClick={onPlay}
          >
            Start Exam
          </button>
        )}
      </div>
    </div>
  );
}
