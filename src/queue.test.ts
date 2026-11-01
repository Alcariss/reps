import { describe, expect, it } from 'vitest';
import { createQueue, createSlot } from './queue';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    }
  };
}

describe('queue', () => {
  it('persists items across instances (reload, app kill)', () => {
    const storage = memoryStorage();
    createQueue<{ reps: number }>('q', storage).add('a', 'sets', { reps: 10 });
    const again = createQueue<{ reps: number }>('q', storage);
    expect(again.items()).toEqual([{ key: 'a', table: 'sets', input: { reps: 10 }, tries: 0, lastError: null }]);
  });

  it('replaces an item with the same key', () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    queue.add('a', 'sets', 2);
    expect(queue.items().map((item) => item.input)).toEqual([2]);
  });

  it('sends in order and removes what the server confirmed', async () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    queue.add('b', 'body', 2);
    const sent: number[] = [];
    const result = await queue.flush(async (item) => {
      sent.push(item.input);
    });
    expect(sent).toEqual([1, 2]);
    expect(result).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 0 });
    expect(queue.size()).toBe(0);
  });

  it('keeps everything and stops at the first failure (offline)', async () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    queue.add('b', 'sets', 2);
    let calls = 0;
    const result = await queue.flush(async () => {
      calls += 1;
      throw new Error('offline');
    });
    expect(calls).toBe(1);
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 1, remaining: 2 });
    expect(queue.items()[0]).toMatchObject({ key: 'a', tries: 1, lastError: 'offline' });
  });

  it('retries later and succeeds', async () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    await queue.flush(async () => {
      throw new Error('offline');
    });
    const result = await queue.flush(async () => undefined);
    expect(result.sent).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('skips items the server already has', async () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    queue.add('b', 'sets', 2);
    const sent: number[] = [];
    const result = await queue.flush(async (item) => {
      sent.push(item.input);
    }, (item) => item.key === 'a');
    expect(sent).toEqual([2]);
    expect(result).toMatchObject({ sent: 1, skipped: 1, remaining: 0 });
  });

  it('runs one flush at a time and picks up items added meanwhile', async () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    const sent: number[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = async (item: { input: number }): Promise<void> => {
      if (item.input === 1) {
        await gate;
      }
      sent.push(item.input);
    };
    const first = queue.flush(send);
    queue.add('b', 'sets', 2);
    const second = queue.flush(send);
    expect(second).toBe(first);
    release();
    await first;
    expect(sent).toEqual([1, 2]);
    expect(queue.size()).toBe(0);
  });

  it('removes an item on undo', () => {
    const queue = createQueue<number>('q', memoryStorage());
    queue.add('a', 'sets', 1);
    queue.remove('a');
    expect(queue.size()).toBe(0);
  });

  it('survives corrupt storage', () => {
    const storage = memoryStorage();
    storage.setItem('q', '{not json');
    expect(createQueue('q', storage).items()).toEqual([]);
  });
});

describe('slot', () => {
  it('stores and clears a draft', () => {
    const slot = createSlot<{ step: number }>('d', memoryStorage());
    expect(slot.load()).toBeNull();
    slot.save({ step: 2 });
    expect(slot.load()).toEqual({ step: 2 });
    slot.clear();
    expect(slot.load()).toBeNull();
  });
});
