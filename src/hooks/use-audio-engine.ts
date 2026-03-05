import { useState, useRef, useCallback } from "preact/hooks";
import { AudioEngine } from "../engine/audio-engine";

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const init = useCallback(async () => {
    if (engineRef.current?.loaded) return engineRef.current;
    setLoading(true);

    const engine = new AudioEngine();
    const base = import.meta.env.BASE_URL + "samples";
    await engine.loadKit(base);
    engineRef.current = engine;
    setLoaded(true);
    setLoading(false);
    return engine;
  }, []);

  const trigger = useCallback((note: number, velocity: number) => {
    engineRef.current?.trigger(note, velocity);
  }, []);

  return {
    engine: engineRef.current,
    loaded,
    loading,
    init,
    trigger,
  };
}
