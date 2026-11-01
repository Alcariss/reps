import type { KeyValueStorage } from '@alcariss/pwa-kit';

/**
 * Writes that have not reached the server yet. pwa-kit's store only writes
 * online, so every logged set goes through here: saved to localStorage first,
 * sent best-effort, and retried on `online`, on finish and on the next start.
 * Nothing leaves the queue until the server has confirmed it.
 */

export type QueueItem<T> = {
  key: string;
  table: string;
  input: T;
  tries: number;
  lastError: string | null;
};

export type FlushResult = { sent: number; skipped: number; failed: number; remaining: number };

export type Queue<T> = {
  items(): QueueItem<T>[];
  /** Adds or replaces the item with the same key. */
  add(key: string, table: string, input: T): void;
  remove(key: string): void;
  size(): number;
  /**
   * Sends items oldest first. `isSaved` lets the caller skip items the server
   * already has (a request that succeeded but whose answer was lost).
   * Stops at the first failure: offline, every request would fail the same way.
   */
  flush(
    send: (item: QueueItem<T>) => Promise<void>,
    isSaved?: (item: QueueItem<T>) => boolean
  ): Promise<FlushResult>;
};

function isQueueItem(value: unknown): value is QueueItem<unknown> {
  return typeof value === 'object'
    && value !== null
    && typeof (value as QueueItem<unknown>).key === 'string'
    && typeof (value as QueueItem<unknown>).table === 'string'
    && 'input' in value;
}

export function createQueue<T>(key: string, storage: KeyValueStorage = globalThis.localStorage): Queue<T> {
  let flushing: Promise<FlushResult> | null = null;

  function load(): QueueItem<T>[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? (parsed.filter(isQueueItem) as QueueItem<T>[]) : [];
    } catch {
      return [];
    }
  }

  function save(items: QueueItem<T>[]): void {
    if (items.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(items));
    }
  }

  async function run(
    send: (item: QueueItem<T>) => Promise<void>,
    isSaved?: (item: QueueItem<T>) => boolean
  ): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, skipped: 0, failed: 0, remaining: 0 };
    const seen = new Set<string>();
    // Re-read each round: sets logged while a flush runs are sent by the same flush.
    for (let item = nextUnseen(seen); item !== undefined; item = nextUnseen(seen)) {
      seen.add(item.key);
      if (isSaved?.(item)) {
        removeKey(item.key);
        result.skipped += 1;
        continue;
      }
      try {
        await send(item);
        removeKey(item.key);
        result.sent += 1;
      } catch (error) {
        const items = load();
        const stored = items.find((candidate) => candidate.key === item.key);
        if (stored) {
          stored.tries += 1;
          stored.lastError = error instanceof Error ? error.message : String(error);
          save(items);
        }
        result.failed += 1;
        break;
      }
    }
    result.remaining = load().length;
    return result;
  }

  function nextUnseen(seen: Set<string>): QueueItem<T> | undefined {
    return load().find((item) => !seen.has(item.key));
  }

  function removeKey(itemKey: string): void {
    save(load().filter((item) => item.key !== itemKey));
  }

  return {
    items: load,
    add(itemKey, table, input) {
      const items = load().filter((item) => item.key !== itemKey);
      items.push({ key: itemKey, table, input, tries: 0, lastError: null });
      save(items);
    },
    remove: removeKey,
    size: () => load().length,
    flush(send, isSaved) {
      // One flush at a time, or a set could be sent twice.
      if (flushing === null) {
        flushing = run(send, isSaved).finally(() => {
          flushing = null;
        });
      }
      return flushing;
    }
  };
}

/** A small JSON value in localStorage, e.g. the in-progress workout. */
export function createSlot<T>(key: string, storage: KeyValueStorage = globalThis.localStorage): {
  load(): T | null;
  save(value: T): void;
  clear(): void;
} {
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      } catch {
        return null;
      }
    },
    save(value) {
      storage.setItem(key, JSON.stringify(value));
    },
    clear() {
      storage.removeItem(key);
    }
  };
}
