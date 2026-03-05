/**
 * Sample kit loader — parses FreePats-GM WAV filenames into NoteGroups
 * with velocity layers and round-robin cycling.
 *
 * Filename format: {note}[_v{layer}][_rr{rr}].wav
 * Examples: 36.wav, 38_v1_rr1.wav, 38_v2_rr3.wav, 51_v2_rr2.wav
 */

export interface SampleEntry {
  note: number;
  velocityLayer: number;
  rrIndex: number;
  url: string;
}

export interface NoteGroup {
  note: number;
  /** Velocity layers sorted ascending. Each layer has round-robin buffers. */
  layers: AudioBuffer[][];
  /** Current round-robin index per layer */
  rrCounters: number[];
}

/** Parse a sample filename into its components */
export function parseSampleFilename(
  filename: string
): { note: number; velocityLayer: number; rrIndex: number } | null {
  const match = filename.match(/^(\d+)(?:_v(\d+))?(?:_rr(\d+))?\.wav$/);
  if (!match) return null;
  return {
    note: parseInt(match[1], 10),
    velocityLayer: match[2] ? parseInt(match[2], 10) : 1,
    rrIndex: match[3] ? parseInt(match[3], 10) : 1,
  };
}

/** Build a list of sample entries from filenames */
export function buildSampleList(
  filenames: string[],
  baseUrl: string
): SampleEntry[] {
  const entries: SampleEntry[] = [];
  for (const f of filenames) {
    const parsed = parseSampleFilename(f);
    if (!parsed) continue;
    entries.push({
      ...parsed,
      url: `${baseUrl}/${f}`,
    });
  }
  return entries;
}

/** Load all samples and organize into NoteGroups */
export async function loadSampleKit(
  ctx: AudioContext,
  entries: SampleEntry[]
): Promise<Map<number, NoteGroup>> {
  // Group entries by note
  const byNote = new Map<number, SampleEntry[]>();
  for (const e of entries) {
    const list = byNote.get(e.note) ?? [];
    list.push(e);
    byNote.set(e.note, list);
  }

  const groups = new Map<number, NoteGroup>();

  // Load all buffers in parallel
  const loadPromises: Promise<void>[] = [];

  for (const [note, noteEntries] of byNote) {
    // Find max velocity layer and max rr per layer
    const maxLayer = Math.max(...noteEntries.map((e) => e.velocityLayer));
    const layers: AudioBuffer[][] = [];
    const rrCounters: number[] = [];

    for (let v = 1; v <= maxLayer; v++) {
      const layerEntries = noteEntries
        .filter((e) => e.velocityLayer === v)
        .sort((a, b) => a.rrIndex - b.rrIndex);

      const buffers: AudioBuffer[] = new Array(layerEntries.length);
      layers.push(buffers);
      rrCounters.push(0);

      for (let i = 0; i < layerEntries.length; i++) {
        const entry = layerEntries[i];
        loadPromises.push(
          fetch(entry.url)
            .then((r) => r.arrayBuffer())
            .then((ab) => ctx.decodeAudioData(ab))
            .then((buf) => {
              buffers[i] = buf;
            })
        );
      }
    }

    groups.set(note, { note, layers, rrCounters });
  }

  await Promise.all(loadPromises);
  return groups;
}

/** Pick a buffer from a NoteGroup based on velocity, with round-robin */
export function pickSample(
  group: NoteGroup,
  velocity: number
): AudioBuffer | null {
  if (group.layers.length === 0) return null;

  // Map velocity (1-127) to layer index
  const layerIndex = Math.min(
    Math.floor((velocity / 128) * group.layers.length),
    group.layers.length - 1
  );

  const layer = group.layers[layerIndex];
  if (!layer || layer.length === 0) return null;

  // Round-robin within layer
  const rrIndex = group.rrCounters[layerIndex] % layer.length;
  group.rrCounters[layerIndex] = rrIndex + 1;

  return layer[rrIndex] ?? null;
}
