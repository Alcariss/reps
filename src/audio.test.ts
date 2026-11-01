import { describe, expect, it } from 'vitest';
import { createAudioEngine, usePlaybackSession, type AudioContextLike } from './audio';

function fakeContext(initial = 'suspended') {
  const log: string[] = [];
  let release: () => void = () => undefined;
  const node = () => ({ connect: (target: unknown) => target as never });
  const ctx = {
    state: initial,
    currentTime: 1,
    destination: {},
    resumeCalls: 0,
    log,
    /** Lets the test decide when resume() resolves. */
    finishResume: () => release(),
    resume() {
      ctx.resumeCalls += 1;
      return new Promise<void>((resolve) => {
        release = () => {
          ctx.state = 'running';
          resolve();
        };
      });
    },
    createOscillator: () => {
      const osc = {
        ...node(), type: '', frequency: { value: 0 },
        start: () => log.push(`tone ${osc.frequency.value}`),
        stop: () => undefined
      };
      osc.connect = () => ({ connect: () => ({}) }) as never;
      return osc;
    },
    createGain: () => ({ ...node(), gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined } }),
    createBuffer: () => ({}),
    createBufferSource: () => ({ ...node(), buffer: null as unknown, start: () => log.push('silence') })
  };
  return ctx;
}

const tone = { frequency: 660, duration: 0.06, volume: 0.2 };

describe('audio engine', () => {
  it('plays immediately when running', () => {
    const ctx = fakeContext('running');
    createAudioEngine(() => ctx as unknown as AudioContextLike).play(tone);
    expect(ctx.log).toEqual(['tone 660']);
  });

  it('queues a beep until resume() resolves instead of dropping it', async () => {
    const ctx = fakeContext('suspended');
    const audio = createAudioEngine(() => ctx as unknown as AudioContextLike);
    audio.play(tone);
    audio.play({ ...tone, frequency: 1320 });
    expect(ctx.log).toEqual([]);
    expect(ctx.resumeCalls).toBe(1);
    ctx.finishResume();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ctx.log).toEqual(['tone 660', 'tone 1320']);
  });

  it('resumes an interrupted context (iOS after a call or backgrounding)', async () => {
    const ctx = fakeContext('interrupted');
    const audio = createAudioEngine(() => ctx as unknown as AudioContextLike);
    const woken = audio.wake();
    ctx.finishResume();
    await woken;
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1);
  });

  it('plays a silent buffer on the first unlock only', () => {
    const ctx = fakeContext('suspended');
    const audio = createAudioEngine(() => ctx as unknown as AudioContextLike);
    audio.unlock();
    audio.unlock();
    expect(ctx.log).toEqual(['silence']);
    expect(ctx.resumeCalls).toBe(1);
  });

  it('does nothing without Web Audio', () => {
    const audio = createAudioEngine(() => null);
    expect(() => {
      audio.unlock();
      audio.play(tone);
    }).not.toThrow();
  });
});

describe('usePlaybackSession', () => {
  it('switches the iOS audio session to playback so the silent switch does not mute beeps', () => {
    const nav = { audioSession: { type: 'auto' } };
    expect(usePlaybackSession(nav)).toBe(true);
    expect(nav.audioSession.type).toBe('playback');
  });

  it('is a no-op where audioSession is missing', () => {
    expect(usePlaybackSession({})).toBe(false);
  });
});
