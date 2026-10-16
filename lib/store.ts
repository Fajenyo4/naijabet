import { getStore } from "@netlify/blobs";

// Netlify Blobs: persistent key/value storage that survives redeploys. Outside Netlify
// (local dev, tests) it isn't available, so every helper degrades to "no data".
function store() {
  try {
    return getStore("football-data");
  } catch {
    return null;
  }
}

export async function readJSON<T>(key: string): Promise<T | null> {
  try {
    return ((await store()?.get(key, { type: "json" })) as T | null) ?? null;
  } catch (e) {
    console.warn(`[store] read ${key} failed`, e);
    return null;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await store()?.setJSON(key, value);
  } catch (e) {
    console.warn(`[store] write ${key} failed`, e);
  }
}
