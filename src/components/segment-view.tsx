import { useRef, useEffect } from "preact/hooks";
import type { MidiNote, HitResult } from "../engine/types";
import { renderNotation } from "../rendering/drum-notation";

interface Props {
  notes: MidiNote[];
  startTime: number;
  endTime: number;
  bpm: number;
  timeSig: [number, number];
  playheadTime?: number;
  hitResults?: Map<number, HitResult>;
}

export function SegmentView({
  notes,
  startTime,
  endTime,
  bpm,
  timeSig,
  playheadTime,
  hitResults,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

    // Re-render on resize
    const observer = new ResizeObserver(render);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [notes, startTime, endTime, bpm, timeSig, playheadTime, hitResults]);

  return (
    <canvas
      ref={canvasRef}
      class="w-full flex-1"
      style={{ minHeight: "180px" }}
    />
  );
}
