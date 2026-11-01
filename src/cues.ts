/** Beeps, vibration and the screen wake lock used during a workout. */


import { createAudioEngine, usePlaybackSession, type AudioContextLike } from './audio';

const audio = createAudioEngine(() => {
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
});

usePlaybackSession(navigator);
// iOS only lets a gesture start audio; any tap anywhere counts. Kept for the
// app's lifetime because iOS can interrupt the context again later.
for (const type of ['pointerdown', 'touchend'] as const) {
  document.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void audio.wake();
  }
});

/** Call from a click handler: iOS only allows audio that a gesture unlocked. */
export function unlockAudio(): void {
  audio.unlock();
}

export function beep(options: { frequency?: number; duration?: number; volume?: number } = {}): void {
  audio.play({ frequency: options.frequency ?? 880, duration: options.duration ?? 0.15, volume: options.volume ?? 0.3 });
}

export function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

export type Signals = { sound: boolean; vibrate: boolean };

/** End of a rest or a hold: three beeps and a buzz. */
export function alarm(signals: Signals): void {
  if (signals.sound) {
    beep({ frequency: 880 });
    window.setTimeout(() => beep({ frequency: 880 }), 250);
    window.setTimeout(() => beep({ frequency: 1320, duration: 0.3 }), 500);
  }
  if (signals.vibrate) {
    vibrate([200, 100, 200]);
  }
}

export function tick(signals: Signals, accent = false): void {
  if (signals.sound) {
    beep({ frequency: accent ? 1320 : 660, duration: 0.06, volume: 0.2 });
  }
}

type WakeLockSentinelLike = { release(): Promise<void> };
let wakeLock: WakeLockSentinelLike | null = null;
let wanted = false;

async function requestWakeLock(): Promise<void> {
  const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!api || document.visibilityState !== 'visible') {
    return;
  }
  try {
    wakeLock = await api.request('screen');
  } catch {
    // Low battery or no permission: the workout still works, the screen may dim.
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') {
    void requestWakeLock();
  }
});

export function keepScreenOn(on: boolean): void {
  wanted = on;
  if (on) {
    if (wakeLock === null) {
      void requestWakeLock();
    }
  } else {
    void wakeLock?.release().catch(() => undefined);
    wakeLock = null;
  }
}
