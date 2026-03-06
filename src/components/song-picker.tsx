import { useState, useRef, useEffect } from "preact/hooks";
import type { DrumTrack } from "../engine/types";
import { parseMidiFile, parseMidiFromUrl } from "../engine/midi-file";
import {
  saveRecentMidi,
  getRecentMidis,
  loadRecentMidi,
  deleteRecentMidi,
} from "../engine/midi-storage";

interface Props {
  onLoad: (track: DrumTrack) => void;
}

export function SongPicker({ onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<
    { filename: string; timestamp: number }[]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRecentMidis().then(setRecents).catch(() => {});
  }, []);

  const handleFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const track = parseMidiFile(buffer);
      await saveRecentMidi(file.name, buffer);
      setRecents(await getRecentMidis());
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
      const trimmed = url.trim();
      const response = await fetch(trimmed);
      if (!response.ok)
        throw new Error(`Failed to fetch: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const track = parseMidiFile(buffer);
      const filename =
        decodeURIComponent(trimmed.split("/").pop() || "url-file.mid");
      await saveRecentMidi(filename, buffer);
      setRecents(await getRecentMidis());
      onLoad(track);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleRecent = async (filename: string) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await loadRecentMidi(filename);
      const track = parseMidiFile(buffer);
      await saveRecentMidi(filename, buffer); // bump timestamp
      setRecents(await getRecentMidis());
      onLoad(track);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleDeleteRecent = async (
    e: Event,
    filename: string
  ) => {
    e.stopPropagation();
    await deleteRecentMidi(filename);
    setRecents(await getRecentMidis());
  };

  return (
    <div class="flex flex-col gap-4 p-6 bg-[#141414] border border-[#2a2a2a] rounded max-w-md mx-auto">
      <h2 class="text-lg text-[#f59e0b]">Load MIDI File</h2>

      {error && <p class="text-sm text-[#ef4444]">{error}</p>}

      {recents.length > 0 && (
        <div class="flex flex-col gap-2">
          <p class="text-xs text-[#888]">Recent files</p>
          <div class="flex flex-wrap gap-2">
            {recents.map((r) => (
              <button
                key={r.filename}
                class="group flex items-center gap-1 px-3 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-xs text-[#e0e0e0] hover:border-[#f59e0b] hover:text-[#f59e0b] transition-colors"
                onClick={() => handleRecent(r.filename)}
                disabled={loading}
              >
                <span class="truncate max-w-[160px]">{r.filename}</span>
                <span
                  class="ml-1 opacity-0 group-hover:opacity-100 text-[#888] hover:text-[#ef4444] transition-opacity"
                  onClick={(e) => handleDeleteRecent(e, r.filename)}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
