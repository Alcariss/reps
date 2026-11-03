/**
 * Generated lo-fi beats for workouts: jazzy 7th chords on a soft electric
 * piano, a round bass, swung drums, a sparse pentatonic melody and vinyl
 * crackle. Everything is synthesised with Web Audio, so there are no files,
 * no licences and it works offline. A seeded random keeps each bar fresh.
 */

export const BPM = 80;
const STEPS_PER_BAR = 16;
const SWING = 0.18;
const LOOKAHEAD_S = 0.15;
const TICK_MS = 30;

/** Bars of chords as MIDI note numbers (root first). */
const PROGRESSIONS: readonly (readonly (readonly number[])[])[] = [
  // Fmaj7 – Em7 – Dm7 – Cmaj7
  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
  // Dm9 – G13 – Cmaj9 – Am7
  [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 48, 52, 55]],
  // Ebmaj7 – Dm7 – Cm7 – Bbmaj7
  [[51, 55, 58, 62], [50, 53, 57, 60], [48, 51, 55, 58], [46, 50, 53, 57]],
  // Am7 – D9 – Gmaj7 – Em7
  [[45, 48, 52, 55], [50, 54, 57, 60, 64], [43, 47, 50, 54], [52, 55, 59, 62]]
];

/** Kick and snare on a 16-step bar; hats are generated. */
const KICK = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Seconds from the start of the bar to a 16th step, with off-beat 8ths pushed late. */
export function stepOffset(step: number, bpm = BPM): number {
  const sixteenth = 60 / bpm / 4;
  const eighth = sixteenth * 2;
  const base = step * sixteenth;
  return step % 4 === 2 ? base + SWING * eighth : base;
}

export function barSeconds(bpm = BPM): number {
  return (60 / bpm) * 4;
}

/** Small deterministic PRNG (mulberry32), so tests can pin the output. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minor-pentatonic notes over a chord, an octave or two above its root. */
export function melodyNotes(chord: readonly number[]): number[] {
  const root = (chord[0] ?? 48) + 24;
  return [0, 3, 5, 7, 10, 12].map((interval) => root + interval);
}

export type MusicPlayer = {
  start(): void;
  stop(): void;
  /** Resume after iOS suspended or interrupted the context (needs a gesture or a visible page). */
  wake(): void;
  readonly playing: boolean;
};

type Ctx = AudioContext;

export function createMusic(createContext: () => Ctx | null = defaultContext): MusicPlayer {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let timer: number | null = null;
  let crackle: AudioBufferSourceNode | null = null;
  let noise: AudioBuffer | null = null;
  let nextStepTime = 0;
  let step = 0;
  let bar = 0;
  let progression = PROGRESSIONS[0] ?? [];
  const rand = random(Date.now());

  function chordFor(barIndex: number): readonly number[] {
    return progression[barIndex % progression.length] ?? [48, 52, 55, 59];
  }

  function voice(context: Ctx, out: AudioNode, note: number, time: number, length: number, volume: number): void {
    // Electric-piano-ish: a sine plus a quiet detuned triangle, soft attack, long release.
    for (const [type, detune, level] of [['sine', 0, 1], ['triangle', 7, 0.25]] as const) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = midiToHz(note);
      osc.detune.value = detune + (rand() - 0.5) * 6;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(volume * level, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(volume * level * 0.4, time + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
      osc.connect(gain).connect(out);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
  }

  function kick(context: Ctx, out: AudioNode, time: number): void {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  function noiseHit(context: Ctx, out: AudioNode, time: number, options: { type: BiquadFilterType; freq: number; volume: number; length: number }): void {
    if (!noise) {
      return;
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.value = options.freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(options.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + options.length);
    source.connect(filter).connect(gain).connect(out);
    source.start(time, rand() * 0.5);
    source.stop(time + options.length + 0.02);
  }

  function schedule(context: Ctx, out: AudioNode, time: number): void {
    const chord = chordFor(bar);
    const bar16 = barSeconds() / 4;
    if (step === 0) {
      if (bar % 8 === 0 && bar > 0) {
        progression = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)] ?? progression;
      }
      // Chord, slightly strummed; the bass enters on 1 and pushes on the "and" of 3.
      chord.forEach((note, index) => voice(context, out, note, time + index * 0.012, barSeconds() * 0.95, 0.06));
      voice(context, out, (chord[0] ?? 48) - 12, time, bar16 * 2.5, 0.22);
    }
    if (step === 10) {
      voice(context, out, (chord[0] ?? 48) - 12, time, bar16 * 1.5, 0.16);
    }
    if (KICK[step] || (step === 7 && rand() < 0.25)) {
      kick(context, out, time);
    }
    if (SNARE[step]) {
      noiseHit(context, out, time, { type: 'bandpass', freq: 1800, volume: 0.35, length: 0.18 });
    }
    if (step % 2 === 0 && rand() > 0.1) {
      noiseHit(context, out, time, { type: 'highpass', freq: 7000, volume: 0.05 + rand() * 0.05, length: 0.05 });
    }
    if (step % 2 === 0 && rand() < 0.22) {
      const notes = melodyNotes(chord);
      voice(context, out, notes[Math.floor(rand() * notes.length)] ?? 72, time, bar16 * 1.2, 0.05);
    }
  }

  function pump(): void {
    if (!ctx || !master) {
      return;
    }
    if (nextStepTime < ctx.currentTime - 0.25) {
      // Back from a suspended context or a throttled timer: rejoin at the next bar, don't catch up.
      step = 0;
      bar += 1;
      nextStepTime = ctx.currentTime + 0.05;
    }
    while (nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      const barStart = nextStepTime - stepOffset(step);
      schedule(ctx, master, nextStepTime);
      step += 1;
      if (step === STEPS_PER_BAR) {
        step = 0;
        bar += 1;
        nextStepTime = barStart + barSeconds();
      } else {
        nextStepTime = barStart + stepOffset(step);
      }
    }
  }

  function startCrackle(context: Ctx, out: AudioNode): void {
    const length = context.sampleRate * 3;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (rand() * 2 - 1) * 0.012 + (rand() < 0.0006 ? (rand() * 2 - 1) * 0.5 : 0);
    }
    crackle = context.createBufferSource();
    crackle.buffer = buffer;
    crackle.loop = true;
    crackle.connect(out);
    crackle.start();
  }

  return {
    wake() {
      if (ctx && timer !== null && ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined);
      }
    },
    get playing() {
      return timer !== null;
    },
    start() {
      if (timer !== null) {
        return;
      }
      ctx ??= createContext();
      if (!ctx) {
        return;
      }
      void ctx.resume().catch(() => undefined);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3200;
      master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 1.5);
      master.connect(lowpass).connect(ctx.destination);
      if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = rand() * 2 - 1;
        }
      }
      startCrackle(ctx, master);
      progression = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)] ?? progression;
      step = 0;
      bar = 0;
      nextStepTime = ctx.currentTime + 0.1;
      timer = window.setInterval(pump, TICK_MS);
      pump();
    },
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      if (ctx && master) {
        const old = master;
        old.gain.cancelScheduledValues(ctx.currentTime);
        old.gain.setValueAtTime(Math.max(old.gain.value, 0.0001), ctx.currentTime);
        old.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        window.setTimeout(() => old.disconnect(), 800);
      }
      crackle?.stop(ctx ? ctx.currentTime + 0.7 : 0);
      crackle = null;
      master = null;
    }
  };
}

function defaultContext(): Ctx | null {
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}
