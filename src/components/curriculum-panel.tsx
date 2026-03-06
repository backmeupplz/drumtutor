import type { CurriculumStep } from "../engine/types";

interface Props {
  curriculum: CurriculumStep[];
  currentStepIndex: number;
  onJumpToStep: (index: number) => void;
}

function phaseLabel(phase: string, chainSize: number): string {
  if (phase === "individual") return "Singles";
  if (phase === "full") return "Full Song";
  return `Chains of ${chainSize}`;
}

export function CurriculumPanel({ curriculum, currentStepIndex, onJumpToStep }: Props) {
  // Group steps by phase+chainSize
  const groups: { label: string; steps: { step: CurriculumStep; idx: number }[] }[] = [];
  let lastKey = "";

  for (let i = 0; i < curriculum.length; i++) {
    const step = curriculum[i];
    const key = `${step.phase}:${step.chainSize}`;
    if (key !== lastKey) {
      groups.push({
        label: phaseLabel(step.phase, step.chainSize),
        steps: [],
      });
      lastKey = key;
    }
    groups[groups.length - 1].steps.push({ step, idx: i });
  }

  const total = curriculum.length;
  const passed = curriculum.filter((s) => s.status === "passed").length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div class="bg-[#111] border-t border-[#2a2a2a] max-h-48 overflow-y-auto">
      {/* Progress header */}
      <div class="sticky top-0 bg-[#111] px-3 py-1.5 border-b border-[#2a2a2a] flex items-center gap-3">
        <span class="text-xs text-[#888]">
          Step {currentStepIndex + 1}/{total}
        </span>
        <div class="flex-1 h-1.5 bg-[#2a2a2a] rounded">
          <div
            class="h-full bg-[#22c55e] rounded transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span class="text-xs text-[#888]">{pct}%</span>
      </div>

      {/* Step groups */}
      <div class="px-3 py-2 space-y-2">
        {groups.map((group, gi) => (
          <div key={gi}>
            <div class="text-[10px] text-[#666] uppercase tracking-wider mb-1">
              {group.label}
            </div>
            <div class="flex flex-wrap gap-1">
              {group.steps.map(({ step, idx }) => (
                <button
                  key={idx}
                  class={`px-1.5 py-0.5 rounded text-[10px] font-mono leading-tight transition-colors ${
                    step.status === "passed"
                      ? "bg-[#166534] text-[#4ade80]"
                      : step.status === "active"
                        ? "bg-[#1e40af] text-[#93c5fd] ring-1 ring-[#3b82f6]"
                        : "bg-[#1a1a1a] text-[#555]"
                  } cursor-pointer ${
                    step.status === "passed"
                      ? "hover:bg-[#1e3a1e]"
                      : step.status === "active"
                        ? "hover:bg-[#1e3a8a]"
                        : "hover:bg-[#2a2a2a]"
                  }`}
                  onClick={() => onJumpToStep(idx)}
                  title={step.label}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
