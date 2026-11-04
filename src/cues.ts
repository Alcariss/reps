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

type WakeLockSentinelLike = { readonly released?: boolean; release(): Promise<void>; addEventListener?(type: 'release', listener: () => void): void };
let wakeLock: WakeLockSentinelLike | null = null;
let requesting = false;
let wanted = false;
let video: HTMLVideoElement | null = null;

/**
 * iOS needs more than the Screen Wake Lock API: home-screen apps before
 * iOS 18.4 accept the request and still lock, and the lock is dropped
 * whenever the app is hidden. So on iOS a silent looping video plays too
 * (the NoSleep.js technique), and both are re-armed on every tap and every
 * return to the app while a workout is open.
 */
const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function requestWakeLock(): Promise<void> {
  const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!api || requesting || document.visibilityState !== 'visible' || (wakeLock !== null && !wakeLock.released)) {
    return;
  }
  requesting = true;
  try {
    const sentinel = await api.request('screen');
    sentinel.addEventListener?.('release', () => {
      if (wakeLock === sentinel) {
        wakeLock = null;
      }
    });
    wakeLock = sentinel;
    if (!wanted) {
      void releaseWakeLock();
    }
  } catch {
    // Low battery or no permission: the video fallback (iOS) may still help.
    wakeLock = null;
  } finally {
    requesting = false;
  }
}

async function releaseWakeLock(): Promise<void> {
  const current = wakeLock;
  wakeLock = null;
  await current?.release().catch(() => undefined);
}

async function loadVideo(): Promise<HTMLVideoElement> {
  if (video) {
    return video;
  }
  const { NO_SLEEP_MP4 } = await import('./no-sleep-video');
  const element = document.createElement('video');
  element.setAttribute('title', 'Keep screen on');
  element.setAttribute('playsinline', '');
  element.setAttribute('aria-hidden', 'true');
  element.loop = true;
  element.src = NO_SLEEP_MP4;
  element.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none';
  // Stay inside the first half-second so the loop never shows a seam.
  element.addEventListener('timeupdate', () => {
    if (element.currentTime > 0.5) {
      element.currentTime = Math.random() * 0.5;
    }
  });
  document.body.append(element);
  video = element;
  return element;
}

function playVideo(): void {
  if (!isIos) {
    return;
  }
  void loadVideo().then((element) => {
    if (wanted && element.paused) {
      element.play().catch(() => undefined);
    }
  });
}

function rearm(): void {
  if (wanted) {
    void requestWakeLock();
    playVideo();
  }
}

// Both need a user gesture on iOS; any tap during a workout re-arms them.
document.addEventListener('pointerdown', rearm, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    rearm();
  }
});

export function keepScreenOn(on: boolean): void {
  if (on === wanted) {
    if (on) {
      rearm();
    }
    return;
  }
  wanted = on;
  if (on) {
    rearm();
  } else {
    void releaseWakeLock();
    video?.pause();
  }
}
