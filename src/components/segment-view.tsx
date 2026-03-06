import { useRef, useEffect, useState, useCallback } from "preact/hooks";
import type { MidiNote, HitResult } from "../engine/types";
import { renderNotation } from "../rendering/drum-notation";
import { layoutNotes, NOTE_RADIUS, LEFT_MARGIN, RIGHT_MARGIN } from "../rendering/notation-layout";
import { getDrumInfo } from "../utils/gm-drum-map";

interface Props {
  notes: MidiNote[];
  startTime: number;
  endTime: number;
  bpm: number;
  timeSig: [number, number];
  playheadTime?: number;
  hitResults?: Map<number, HitResult>;
  onTimeClick?: (time: number) => void;
}

interface Tooltip {
  text: string;
  x: number;
  y: number;
}

export function SegmentView({
  notes,
  startTime,
  endTime,
  bpm,
  timeSig,
  playheadTime,
  hitResults,
  onTimeClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      renderNotation(canvas, {
        notes,
        startTime,
        endTime,
        bpm,
        timeSig,
        playheadTime,
        hitResults,
      });
    };

    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [notes, startTime, endTime, bpm, timeSig, playheadTime, hitResults]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const positions = layoutNotes(notes, startTime, endTime, rect.width);
      const hitRadius = NOTE_RADIUS * 2.5;

      let closest: { dist: number; note: number } | null = null;
      for (const pos of positions) {
        const dx = mx - pos.x;
        const dy = my - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitRadius && (!closest || dist < closest.dist)) {
          closest = { dist, note: pos.note };
        }
      }

      if (closest) {
        const info = getDrumInfo(closest.note);
        setTooltip({
          text: `${info.name} (${closest.note})`,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else {
        setTooltip(null);
      }
    },
    [notes, startTime, endTime]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!onTimeClick) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const usable = rect.width - LEFT_MARGIN - RIGHT_MARGIN;
      const frac = Math.max(0, Math.min(1, (x - LEFT_MARGIN) / usable));
      const time = startTime + frac * (endTime - startTime);
      onTimeClick(time);
    },
    [onTimeClick, startTime, endTime]
  );

  return (
    <div
      ref={containerRef}
      class="relative w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        class="w-full h-full"
      />
      {tooltip && (
        <div
          class="absolute pointer-events-none px-2 py-1 bg-[#222] border border-[#444] rounded text-xs text-[#e0e0e0] whitespace-nowrap z-10"
          style={{
            left: `${tooltip.x + 12}px`,
            top: `${tooltip.y - 28}px`,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
