import type { LearningState, AutoLearnState } from "../engine/types";

type Mode = "listen" | "practice";

interface Props {
  state: LearningState;
  statusMessage: string;
  accuracy: number | null;
  streak: number;
  listenPaused?: boolean;
  autoLearn: AutoLearnState | null;
  autoLearnPaused?: boolean;
  onPlay: () => void;
  onNext: () => void;
  onListen: () => void;
  onListenSegment: () => void;
  onPauseListen: () => void;
  onResumeListen: () => void;
  onSwitchToListen: () => void;
  onSwitchToPractice: () => void;
  onStartAutoLearn: () => void;
  onStopAutoLearn: () => void;
  onPauseAutoLearn: () => void;
  onResumeAutoLearn: () => void;
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
  autoLearn,
  onPlay,
  onNext,
  onListen,
  onListenSegment,
  onPauseListen,
  onResumeListen,
  onSwitchToListen,
  onSwitchToPractice,
  onStartAutoLearn,
  onStopAutoLearn,
  onPauseAutoLearn,
  onResumeAutoLearn,
  autoLearnPaused,
}: Props) {
  const mode = currentMode(state);
  const isAutoMode = autoLearn !== null;

  const showModeToggle =
    !isAutoMode &&
    state !== "IDLE" &&
    state !== "SONG_LOADED" &&
    state !== "PREP_COUNT" &&
    state !== "PLAYING" &&
    state !== "SONG_COMPLETE";

  // Auto-learn progress
  const autoTotal = autoLearn?.curriculum.length ?? 0;
  const autoPassed = autoLearn?.curriculum.filter((s) => s.status === "passed").length ?? 0;
  const autoStep = autoLearn ? autoLearn.currentStepIndex + 1 : 0;
  const autoLabel = autoLearn?.curriculum[autoLearn.currentStepIndex]?.label ?? "";
  const autoPct = autoTotal > 0 ? Math.round((autoPassed / autoTotal) * 100) : 0;

  // Big overlay for auto mode status messages
  type OverlayStyle = { bg: string; text: string } | null;
  let overlay: OverlayStyle = null;
  let overlayMessage = "";

  if (isAutoMode && statusMessage) {
    if (statusMessage.startsWith("PASSED")) {
      overlay = { bg: "bg-[#22c55e]/20", text: "text-[#22c55e]" };
      overlayMessage = statusMessage;
    } else if (statusMessage.startsWith("FAILED")) {
      overlay = { bg: "bg-[#ef4444]/20", text: "text-[#ef4444]" };
      overlayMessage = statusMessage;
    } else if (statusMessage.startsWith("Get ready")) {
      overlay = { bg: "bg-[#3b82f6]/20", text: "text-[#3b82f6]" };
      overlayMessage = statusMessage;
    }
  }

  return (
    <div class="relative">
      {/* Big status overlay */}
      {overlay && (
        <div
          class={`absolute inset-0 flex items-center justify-center z-10 pointer-events-none ${overlay.bg}`}
        >
          <span class={`text-3xl font-black tracking-wider ${overlay.text}`}>
            {overlayMessage}
          </span>
        </div>
      )}

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

        {/* Auto-learn progress or status message */}
        {isAutoMode ? (
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <span class="text-xs text-[#93c5fd] font-bold shrink-0">{autoLabel}</span>
            <span class="text-xs text-[#ccc] shrink-0 truncate max-w-[200px]">{statusMessage}</span>
            <div class="flex-1 h-1.5 bg-[#2a2a2a] rounded min-w-[60px]">
              <div
                class="h-full bg-[#22c55e] rounded transition-all"
                style={{ width: `${autoPct}%` }}
              />
            </div>
            <span class="text-xs text-[#888] shrink-0">
              {autoStep}/{autoTotal}
            </span>
            {autoLearn?.relearning && (
              <span class="text-[10px] text-[#f59e0b] shrink-0">re-learning</span>
            )}
          </div>
        ) : (
          <span class="text-sm text-[#888] flex-1 truncate">{statusMessage}</span>
        )}

        {/* Accuracy / streak (practice only, non-auto) */}
        {!isAutoMode && accuracy !== null && state !== "LISTENING" && (
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
        {!isAutoMode && streak > 0 && state !== "LISTENING" && (
          <div class="flex items-center gap-1 text-sm">
            <span class="text-[#888]">Streak:</span>
            <span class="text-[#f59e0b] font-bold">{streak}</span>
          </div>
        )}

        {/* Mode toggle (Listen / Practice) — hidden in auto mode */}
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

        {/* Controls */}
        <div class="flex gap-2">
          {/* Auto-learn: Pause/Resume + Stop */}
          {isAutoMode && state !== "SONG_COMPLETE" && (
            <>
              {autoLearnPaused ? (
                <button
                  class="px-3 py-1 bg-[#3b82f6] text-white rounded text-xs font-bold hover:bg-[#2563eb]"
                  onClick={onResumeAutoLearn}
                >
                  Resume
                </button>
              ) : (
                <button
                  class="px-3 py-1 bg-[#2a2a2a] text-[#e0e0e0] rounded text-xs hover:bg-[#333]"
                  onClick={onPauseAutoLearn}
                >
                  Pause
                </button>
              )}
              <button
                class="px-3 py-1 bg-[#ef4444] text-white rounded text-xs font-bold hover:bg-[#dc2626]"
                onClick={onStopAutoLearn}
              >
                Stop
              </button>
            </>
          )}

          {/* SONG_LOADED: initial entry buttons */}
          {!isAutoMode && state === "SONG_LOADED" && (
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
              <button
                class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
                onClick={onStartAutoLearn}
              >
                Learn
              </button>
            </>
          )}

          {/* LISTENING: Play/Pause toggle */}
          {!isAutoMode && state === "LISTENING" && (
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

          {/* Manual mode: SEGMENT_PREVIEW / EVALUATE / NEXT_SEGMENT */}
          {!isAutoMode &&
            (state === "SEGMENT_PREVIEW" ||
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
                <button
                  class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
                  onClick={onStartAutoLearn}
                >
                  Learn
                </button>
              </>
            )}

          {/* Exam states */}
          {!isAutoMode &&
            (state === "EXAM_WITH_CLICK" || state === "EXAM_WITHOUT_CLICK") && (
              <button
                class="px-3 py-1 bg-[#22c55e] text-[#0a0a0a] rounded text-xs font-bold hover:bg-[#16a34a]"
                onClick={onPlay}
              >
                Start Exam
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
