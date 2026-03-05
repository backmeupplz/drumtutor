import { useState, useRef } from "preact/hooks";
import type { DrumTrack } from "../engine/types";
import { parseMidiFromFile, parseMidiFromUrl } from "../engine/midi-file";

interface Props {
  onLoad: (track: DrumTrack) => void;
}

export function SongPicker({ onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const track = await parseMidiFromFile(file);
      onLoad(track);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const track = await parseMidiFromUrl(url.trim());
      onLoad(track);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div class="flex flex-col gap-4 p-6 bg-[#141414] border border-[#2a2a2a] rounded max-w-md mx-auto">
      <h2 class="text-lg text-[#f59e0b]">Load MIDI File</h2>

      {error && <p class="text-sm text-[#ef4444]">{error}</p>}

      <div class="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".mid,.midi"
          onChange={handleFile}
          class="hidden"
        />
        <button
          class="px-4 py-2 bg-[#f59e0b] text-[#0a0a0a] rounded text-sm font-bold hover:bg-[#d97706]"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          {loading ? "Loading..." : "Upload .mid file"}
        </button>
      </div>

      <div class="flex items-center gap-2 text-[#888] text-xs">
        <div class="flex-1 h-px bg-[#2a2a2a]" />
        or
        <div class="flex-1 h-px bg-[#2a2a2a]" />
      </div>

      <div class="flex gap-2">
        <input
          type="text"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          placeholder="MIDI file URL..."
          class="flex-1 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-sm text-[#e0e0e0] placeholder-[#555]"
        />
        <button
          class="px-4 py-2 bg-[#2a2a2a] text-[#e0e0e0] rounded text-sm hover:bg-[#333]"
          onClick={handleUrl}
          disabled={loading}
        >
          Fetch
        </button>
      </div>
    </div>
  );
}
