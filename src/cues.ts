/** Beeps, vibration and the screen wake lock used during a workout. */

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  audio ??= new Ctor();
  if (audio.state === 'suspended') {
    void audio.resume();
  }
  return audio;
}

/** Call from a click handler: iOS only allows audio that a gesture unlocked. */
export function unlockAudio(): void {
  context();
}

export function beep(options: { frequency?: number; duration?: number; volume?: number } = {}): void {
  const ctx = context();
  if (!ctx) {
    return;
  }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const duration = options.duration ?? 0.15;
  oscillator.type = 'sine';
  oscillator.frequency.value = options.frequency ?? 880;
  gain.gain.setValueAtTime(options.volume ?? 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
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
