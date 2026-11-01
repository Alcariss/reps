/**
 * Web Audio for timer beeps, hardened for iOS Safari:
 * - the context starts 'suspended' until a user gesture resumes it, and iOS
 *   moves it to 'interrupted' after backgrounding or a call;
 * - a tone requested while resume() is pending is played once it resolves;
 * - the first gesture also plays a silent 1-sample buffer, iOS's unlock idiom.
 * Kept free of globals so it can be tested with a fake context.
 */

type AudioNodeLike = { connect(target: unknown): AudioNodeLike };

export type AudioContextLike = {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): AudioNodeLike & {
    type: string;
    frequency: { value: number };
    start(when?: number): void;
    stop(when?: number): void;
  };
  createGain(): AudioNodeLike & {
    gain: { setValueAtTime(value: number, time: number): void; exponentialRampToValueAtTime(value: number, time: number): void };
  };
  createBuffer(channels: number, length: number, sampleRate: number): unknown;
  createBufferSource(): AudioNodeLike & { buffer: unknown; start(when?: number): void };
};

export type Tone = { frequency: number; duration: number; volume: number };

export type AudioEngine = {
  /** Call from a gesture handler: resumes the context and, once, plays silence. */
  unlock(): void;
  /** Resumes a suspended or interrupted context, e.g. when the app is shown again. */
  wake(): Promise<void>;
  play(tone: Tone): void;
};

export function createAudioEngine(createContext: () => AudioContextLike | null): AudioEngine {
  let ctx: AudioContextLike | null = null;
  let resuming: Promise<void> | null = null;
  let unlocked = false;

  function get(): AudioContextLike | null {
    ctx ??= createContext();
    return ctx;
  }

  function resume(context: AudioContextLike): Promise<void> {
    if (context.state === 'running') {
      return Promise.resolve();
    }
    resuming ??= context.resume()
      .catch(() => undefined)
      .finally(() => {
        resuming = null;
      });
    return resuming;
  }

  function playNow(context: AudioContextLike, tone: Tone): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(tone.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.duration);
  }

  return {
    unlock() {
      const context = get();
      if (!context) {
        return;
      }
      void resume(context);
      if (!unlocked) {
        unlocked = true;
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.start(0);
      }
    },
    async wake() {
      const context = get();
      if (context) {
        await resume(context);
      }
    },
    play(tone) {
      const context = get();
      if (!context) {
        return;
      }
      if (context.state === 'running') {
        playNow(context, tone);
      } else {
        // Not dropped: the beep follows as soon as the context is running.
        void resume(context).then(() => playNow(context, tone));
      }
    }
  };
}

/**
 * Safari 17+: the 'playback' session plays through the silent switch; the
 * default 'ambient' session is muted by it. Returns whether it was set.
 */
export function usePlaybackSession(nav: unknown): boolean {
  const session = (nav as { audioSession?: { type: string } } | null)?.audioSession;
  if (!session) {
    return false;
  }
  try {
    session.type = 'playback';
    return true;
  } catch {
    return false;
  }
}
