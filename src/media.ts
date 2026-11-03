import type { DemoKey } from './program';

/**
 * Animated GymVisual demos. They are licensed for personal use, so they are
 * not in this public repo: the pwa-kit worker serves them to signed-in users
 * (`?action=media`) and they are kept in Cache Storage for offline workouts.
 * Demos without a GIF keep the public-domain photo frames.
 */
const GIF_FOR: Partial<Record<DemoKey, string>> = {
  'goblet-squat': 'goblet-squat',
  rdl: 'rdl',
  'incline-pushup': 'incline-pushup',
  pushup: 'pushup',
  'feet-elevated-pushup': 'pushup',
  pike: 'pike',
  'door-row': 'door-row',
  'door-row-one-arm': 'door-row',
  'one-arm-row': 'door-row',
  swing: 'swing',
  plank: 'plank',
  'pull-apart': 'pull-apart',
  'good-morning': 'good-morning',
  'worlds-greatest-stretch': 'worlds-greatest-stretch'
};

const CACHE_NAME = 'reps-media-v1';
const objectUrls = new Map<string, string>();

function cacheKey(name: string): string {
  return new URL(`__media/${name}.gif`, document.baseURI).href;
}

/** A ready object URL for the demo's GIF, or null to use the photo frames. */
export function gifUrl(key: DemoKey): string | null {
  const name = GIF_FOR[key];
  return name ? (objectUrls.get(name) ?? null) : null;
}

async function readCached(cache: Cache | null, name: string): Promise<Blob | null> {
  const hit = await cache?.match(cacheKey(name));
  return hit ? hit.blob() : null;
}

async function download(apiUrl: string, token: string | null, name: string, cache: Cache | null): Promise<Blob | null> {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'media');
  url.searchParams.set('name', `${name}.gif`);
  const response = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!response.ok) {
    return null;
  }
  const blob = await response.blob();
  await cache?.put(cacheKey(name), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/gif' } }));
  return blob;
}

/**
 * Loads every GIF from the device cache, downloading the missing ones.
 * Resolves true when at least one new GIF became available.
 */
export async function loadGifs(apiUrl: string, token: string | null): Promise<boolean> {
  const cache = 'caches' in window ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const names = [...new Set(Object.values(GIF_FOR))].filter((name) => !objectUrls.has(name));
  const results = await Promise.all(names.map(async (name) => {
    try {
      const blob = (await readCached(cache, name)) ?? (await download(apiUrl, token, name, cache));
      if (blob) {
        objectUrls.set(name, URL.createObjectURL(blob));
        return true;
      }
    } catch {
      // Offline or not signed in: this demo keeps its photo frames.
    }
    return false;
  }));
  return results.some(Boolean);
}

/** Forget the GIFs on sign-out; they belong to the signed-in user's licence. */
export async function clearGifs(): Promise<void> {
  for (const url of objectUrls.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
  if ('caches' in window) {
    await caches.delete(CACHE_NAME).catch(() => false);
  }
}
