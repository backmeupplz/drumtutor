/**
 * IndexedDB storage for recent MIDI files.
 * Stores raw ArrayBuffer + filename, capped at 20 entries.
 */

const DB_NAME = "drumtutor";
const STORE_NAME = "recent-midis";
const MAX_ENTRIES = 20;

interface RecentMidiEntry {
  filename: string;
  buffer: ArrayBuffer;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "filename" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecentMidi(
  filename: string,
  buffer: ArrayBuffer
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const entry: RecentMidiEntry = { filename, buffer, timestamp: Date.now() };
  store.put(entry);

  // Evict oldest entries beyond MAX_ENTRIES
  const all = await new Promise<RecentMidiEntry[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (all.length > MAX_ENTRIES) {
    all.sort((a, b) => b.timestamp - a.timestamp);
    for (const old of all.slice(MAX_ENTRIES)) {
      store.delete(old.filename);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getRecentMidis(): Promise<
  { filename: string; timestamp: number }[]
> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  const all = await new Promise<RecentMidiEntry[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return all
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ filename, timestamp }) => ({ filename, timestamp }));
}

export async function loadRecentMidi(
  filename: string
): Promise<ArrayBuffer> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  const entry = await new Promise<RecentMidiEntry | undefined>(
    (resolve, reject) => {
      const req = store.get(filename);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }
  );
  db.close();

  if (!entry) throw new Error(`MIDI file "${filename}" not found in storage`);
  return entry.buffer;
}

export async function deleteRecentMidi(filename: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(filename);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
