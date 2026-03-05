/** GM drum note names and staff positions */
export interface DrumInfo {
  name: string;
  shortName: string;
  /** Staff line position: 0 = top line, positive = lower */
  staffLine: number;
  /** True if notehead is an X (cymbals), false if filled oval (drums) */
  isX: boolean;
}

/** Standard GM drum map - note number to drum info */
export const GM_DRUM_MAP: Record<number, DrumInfo> = {
  35: { name: "Acoustic Bass Drum", shortName: "BD", staffLine: 6, isX: false },
  36: { name: "Bass Drum 1", shortName: "BD", staffLine: 6, isX: false },
  37: {
    name: "Side Stick",
    shortName: "SS",
    staffLine: 2,
    isX: true,
  },
  38: { name: "Acoustic Snare", shortName: "SN", staffLine: 3, isX: false },
  39: { name: "Hand Clap", shortName: "HC", staffLine: 3, isX: true },
  40: { name: "Electric Snare", shortName: "SN", staffLine: 3, isX: false },
  41: { name: "Low Floor Tom", shortName: "FT", staffLine: 5.5, isX: false },
  42: {
    name: "Closed Hi-Hat",
    shortName: "HH",
    staffLine: -0.5,
    isX: true,
  },
  43: { name: "High Floor Tom", shortName: "FT", staffLine: 5, isX: false },
  44: { name: "Pedal Hi-Hat", shortName: "PH", staffLine: 7, isX: true },
  45: { name: "Low Tom", shortName: "LT", staffLine: 4.5, isX: false },
  46: { name: "Open Hi-Hat", shortName: "OH", staffLine: -0.5, isX: true },
  47: { name: "Low-Mid Tom", shortName: "MT", staffLine: 4, isX: false },
  48: { name: "Hi-Mid Tom", shortName: "MT", staffLine: 3.5, isX: false },
  49: { name: "Crash Cymbal 1", shortName: "CC", staffLine: -1, isX: true },
  50: { name: "High Tom", shortName: "HT", staffLine: 2.5, isX: false },
  51: { name: "Ride Cymbal 1", shortName: "RC", staffLine: 0, isX: true },
  52: { name: "Chinese Cymbal", shortName: "CH", staffLine: -1.5, isX: true },
  53: { name: "Ride Bell", shortName: "RB", staffLine: 0, isX: true },
  54: { name: "Tambourine", shortName: "TB", staffLine: -0.5, isX: true },
  55: { name: "Splash Cymbal", shortName: "SP", staffLine: -1, isX: true },
  56: { name: "Cowbell", shortName: "CB", staffLine: -0.5, isX: true },
  57: { name: "Crash Cymbal 2", shortName: "CC2", staffLine: -1, isX: true },
  58: { name: "Vibraslap", shortName: "VS", staffLine: 1, isX: true },
  59: { name: "Ride Cymbal 2", shortName: "RC2", staffLine: 0, isX: true },
  // Alesis-specific extras
  21: { name: "Splash Cymbal", shortName: "SP", staffLine: -1, isX: true },
  23: {
    name: "Half-Open Hi-Hat",
    shortName: "HO",
    staffLine: -0.5,
    isX: true,
  },
};

/** Check if two notes are substitutable (rim/head variants) */
export function areNotesEquivalent(a: number, b: number): boolean {
  if (a === b) return true;
  const pairs: [number, number][] = [
    [38, 40], // Acoustic/Electric Snare
    [41, 43], // Floor Tom variants
    [45, 47], // Low/Low-Mid Tom
    [47, 48], // Low-Mid/Hi-Mid Tom
    [49, 57], // Crash 1/2
    [51, 59], // Ride 1/2
    [42, 46], // Closed/Open HH (allow substitution)
    [42, 23], // Closed/Half-open HH
    [46, 23], // Open/Half-open HH
  ];
  return pairs.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
}

/** Get display info for a note, with fallback */
export function getDrumInfo(note: number): DrumInfo {
  return (
    GM_DRUM_MAP[note] ?? {
      name: `Note ${note}`,
      shortName: `${note}`,
      staffLine: 3,
      isX: false,
    }
  );
}
