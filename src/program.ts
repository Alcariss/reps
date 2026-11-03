import demoNames from './demos.json';

/**
 * The training program: one 20–25 min full-body circuit ("Quick"), its
 * exercises and their progression ladders. Pure data, no DOM.
 */

/**
 * Logged workout of a set. Only 'Q' is created now; 'A' and 'B' are sets from
 * the earlier two-workout plan, still read so their history counts.
 */
export type WorkoutId = 'A' | 'B' | 'Q';
export type ExerciseKind = 'reps' | 'hold';
export type Muscle = 'legs' | 'hinge' | 'push' | 'pull' | 'core' | 'conditioning';
export type DemoKey = keyof typeof demoNames;

export type Variant = {
  id: string;
  name: string;
  demo: DemoKey;
  /** Reps are counted per side (single-leg work, one-arm row). */
  perSide?: boolean;
  /** The band level is the load and can go up before the next variant. */
  banded?: boolean;
  tempo?: string;
  /** Extra cue shown for this step only. */
  hint?: string;
  /** Form cues for this step when they differ from the exercise's. */
  cues?: string[];
};

export type Exercise = {
  id: string;
  name: string;
  kind: ExerciseKind;
  muscle: Muscle;
  /** Reps per round, or seconds for holds. */
  min: number;
  max: number;
  /** Lowest RIR to aim for. 1 = never grind to failure (RDL, swing). */
  rirFloor: number;
  cues: string[];
  ladder: Variant[];
  /** Variant a new user starts on. */
  start: string;
  /** Warm-up movement only: shown with a demo, never logged or progressed. */
  warmup?: boolean;
  /** Finisher (swings, plank): fixed targets, logged for history only. */
  finisher?: boolean;
};

export const BAND_LEVELS = 6;
export const SESSIONS_PER_WEEK = 3;

const BENT_OVER_ROW_CUES = [
  'Band under the opposite foot, staggered stance, flat back',
  'Elbow to the back pocket, not out to the side',
  'Squeeze the shoulder blade back and down',
  '2–3 s return, no torso twist'
];

export const EXERCISES: Record<string, Exercise> = {
  squat: {
    id: 'squat',
    name: 'Goblet squat',
    kind: 'reps',
    muscle: 'legs',
    min: 8,
    max: 15,
    rirFloor: 1,
    cues: [
      'KB vertical at chest, elbows down',
      'Spread the floor, knees over toes',
      'Sit between your heels, chest tall',
      'Drive through the whole foot, squeeze glutes'
    ],
    ladder: [
      { id: 'goblet-squat', name: 'Goblet squat', demo: 'goblet-squat', tempo: '2-0-1' },
      { id: 'goblet-squat-tempo', name: 'Goblet squat, 3 s down + 2 s pause', demo: 'goblet-squat', tempo: '3-2-1' },
      { id: 'goblet-squat-1-5', name: 'Goblet squat 1½ reps', demo: 'goblet-squat', tempo: '3-0-1', hint: 'Down, half up, down again, then stand: one rep.' }
    ],
    start: 'goblet-squat'
  },
  rdl: {
    id: 'rdl',
    name: 'Romanian deadlift',
    kind: 'reps',
    muscle: 'hinge',
    min: 8,
    max: 15,
    rirFloor: 1,
    cues: [
      'Soft knees, hips back like closing a car door',
      'KB slides along thighs, spine neutral, lats tight',
      'Stop at the hamstring stretch (~mid-shin)',
      'Hips forward to stand, no leaning back'
    ],
    ladder: [
      { id: 'kb-rdl', name: 'KB Romanian deadlift', demo: 'rdl', tempo: '3-0-1' },
      { id: 'kb-rdl-tempo', name: 'KB RDL, 4 s lowering', demo: 'rdl', tempo: '4-0-1' },
      { id: 'supported-sl-rdl', name: 'Supported single-leg RDL', demo: 'single-leg-rdl', perSide: true, tempo: '3-0-1', hint: 'Back toes lightly on the floor (kickstand).' },
      { id: 'sl-rdl', name: 'Single-leg RDL', demo: 'single-leg-rdl', perSide: true, tempo: '3-0-1' },
      { id: 'sl-rdl-band', name: 'Single-leg RDL + band', demo: 'single-leg-rdl', perSide: true, tempo: '3-0-1', hint: 'Band under the stance foot, held with the bell.' }
    ],
    start: 'kb-rdl'
  },
  pushup: {
    id: 'pushup',
    name: 'Push-up',
    kind: 'reps',
    muscle: 'push',
    min: 6,
    max: 15,
    rirFloor: 0,
    cues: [
      'Band across upper back, ends under hands',
      'Elbows 30–45° from the body',
      'Rigid plank, glutes and abs braced',
      'Push the floor away to lockout'
    ],
    ladder: [
      { id: 'incline-pushup', name: 'Incline push-up', demo: 'incline-pushup', tempo: '3-0-1', hint: 'Hands on a table or bench.' },
      { id: 'pushup', name: 'Push-up', demo: 'pushup', tempo: '3-0-1' },
      { id: 'band-pushup', name: 'Band push-up', demo: 'pushup', banded: true, tempo: '3-0-1' },
      { id: 'deficit-pushup', name: 'Deficit push-up', demo: 'pushup', tempo: '3-0-1', hint: 'Hands on books or handles, chest below hands.' },
      { id: 'feet-elevated-pushup', name: 'Feet-elevated push-up', demo: 'feet-elevated-pushup', tempo: '3-0-1' },
      { id: 'archer-pushup', name: 'Archer push-up', demo: 'pushup', perSide: true, tempo: '3-0-1', hint: 'Wide hands, shift onto one arm, the other stays straight.' }
    ],
    start: 'band-pushup'
  },
  'pike-pushup': {
    id: 'pike-pushup',
    name: 'Pike push-up',
    kind: 'reps',
    muscle: 'push',
    min: 6,
    max: 12,
    rirFloor: 1,
    cues: [
      'Hips high in an inverted V',
      'Head travels forward to make a triangle with the hands',
      'Elbows about 45° from the body',
      'Push back up and away'
    ],
    ladder: [
      { id: 'incline-pike-pushup', name: 'Incline pike push-up', demo: 'pike', tempo: '2-0-1', hint: 'Hands on a chair seat or the sofa.' },
      { id: 'pike-pushup', name: 'Pike push-up', demo: 'pike', tempo: '2-0-1' },
      { id: 'feet-elevated-pike-pushup', name: 'Feet-elevated pike push-up', demo: 'pike', tempo: '2-0-1', hint: 'Feet on a chair or step, hips stacked over the shoulders.' },
      { id: 'pause-pike-pushup', name: 'Pause pike push-up (2 s at the bottom)', demo: 'pike', tempo: '3-2-1' }
    ],
    start: 'incline-pike-pushup'
  },
  'one-arm-row': {
    id: 'one-arm-row',
    name: 'Band row',
    kind: 'reps',
    muscle: 'pull',
    min: 10,
    max: 20,
    rirFloor: 0,
    cues: [
      'Anchor at chest height, step back until the band is taut at full reach',
      'Elbows to back pockets',
      'Squeeze the shoulder blades, no shrug',
      '2–3 s return'
    ],
    ladder: [
      { id: 'door-band-row', name: 'Door-anchored band row', demo: 'door-row', banded: true, tempo: '1-1-3', hint: 'Both handles, standing, door anchor at chest height.' },
      { id: 'door-one-arm-row', name: 'Single-arm door-anchored band row', demo: 'door-row-one-arm', perSide: true, banded: true, tempo: '1-1-3' },
      { id: 'one-arm-band-row', name: 'Single-arm bent-over band row', demo: 'one-arm-row', perSide: true, banded: true, tempo: '1-1-3', cues: BENT_OVER_ROW_CUES },
      { id: 'one-arm-band-row-squeeze', name: 'Single-arm bent-over band row, 2 s squeeze', demo: 'one-arm-row', perSide: true, banded: true, tempo: '1-2-3', cues: BENT_OVER_ROW_CUES },
      { id: 'one-arm-kb-row', name: 'One-arm 16 kg KB row', demo: 'one-arm-row', perSide: true, tempo: '1-1-3', hint: 'Free hand on a chair or knee for support.', cues: BENT_OVER_ROW_CUES }
    ],
    start: 'door-band-row'
  },
  swing: {
    id: 'swing',
    name: 'KB swing',
    kind: 'reps',
    muscle: 'conditioning',
    min: 10,
    max: 15,
    rirFloor: 1,
    cues: [
      'Hinge, not squat: hike the bell back',
      'Snap the hips, arms are ropes, bell to chest height',
      'Standing plank at the top, no lean back',
      'Sharp exhale'
    ],
    ladder: [
      { id: 'two-arm-swing', name: 'Two-arm KB swing', demo: 'swing' },
      { id: 'one-arm-swing', name: 'One-arm KB swing (alternate each round)', demo: 'swing' }
    ],
    start: 'two-arm-swing',
    finisher: true
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    kind: 'hold',
    muscle: 'core',
    min: 30,
    max: 45,
    rirFloor: 0,
    cues: [
      'Elbows under shoulders',
      'Squeeze glutes and quads, ribs down',
      'Breathe'
    ],
    ladder: [
      { id: 'plank', name: 'Plank', demo: 'plank' },
      { id: 'rkc-plank', name: 'RKC plank (max tension)', demo: 'plank', hint: 'Pull elbows toward toes, squeeze everything.' },
      { id: 'long-lever-plank', name: 'Long-lever plank', demo: 'plank', hint: 'Elbows a hand-width ahead of the shoulders.' }
    ],
    start: 'plank',
    finisher: true
  },
  'pull-apart': {
    id: 'pull-apart',
    name: 'Band pull-apart',
    kind: 'reps',
    muscle: 'pull',
    min: 15,
    max: 25,
    rirFloor: 0,
    cues: [
      'Straight arms (elbows high for face pull)',
      'Blades back and down',
      '1 s hold, slow return'
    ],
    ladder: [
      { id: 'pull-apart', name: 'Band pull-apart', demo: 'pull-apart', banded: true, tempo: '1-1-2' },
      { id: 'face-pull', name: 'Band face pull', demo: 'face-pull', banded: true, tempo: '1-1-2', hint: 'Anchor the band at face height (door anchor).' }
    ],
    start: 'pull-apart',
    warmup: true
  },
  'worlds-greatest-stretch': {
    id: 'worlds-greatest-stretch',
    name: 'World’s greatest stretch',
    kind: 'reps',
    muscle: 'core',
    min: 4,
    max: 4,
    rirFloor: 3,
    cues: [
      'Long lunge, back knee off the floor',
      'Same-side elbow down toward the instep',
      'Rotate and reach that arm to the ceiling, eyes follow the hand',
      'Slow, breathe out into each position'
    ],
    ladder: [{ id: 'worlds-greatest-stretch', name: 'World’s greatest stretch', demo: 'worlds-greatest-stretch', perSide: true }],
    start: 'worlds-greatest-stretch',
    warmup: true
  },
  'band-good-morning': {
    id: 'band-good-morning',
    name: 'Bodyweight good morning',
    kind: 'reps',
    muscle: 'hinge',
    min: 10,
    max: 10,
    rirFloor: 3,
    cues: [
      'Hands behind the head, elbows wide',
      'Soft knees, push the hips back, flat back',
      'Stop at the hamstring stretch, stand tall by squeezing glutes'
    ],
    ladder: [{ id: 'band-good-morning', name: 'Bodyweight good morning', demo: 'good-morning' }],
    start: 'band-good-morning',
    warmup: true
  }
};

/**
 * The workout: 3 rounds of a 4-exercise circuit, so each muscle gets
 * 3 rounds × 3 sessions = 9 hard sets a week.
 */
export const ROUNDS = 3;
export const DELOAD_ROUNDS = 2;
export const REST_STEPS: readonly number[] = [90, 75, 60, 45];
export const FINISHER = { rounds: 3, swing: 'swing', swings: 15, plank: 'plank', plankMin: 30, plankMax: 45 } as const;
export const WARMUP: readonly { exercise: string; amount: string }[] = [
  { exercise: 'pull-apart', amount: '15, light band' },
  { exercise: 'worlds-greatest-stretch', amount: '4 per side' },
  { exercise: 'band-good-morning', amount: '10, slow' }
];
/** Exercises the circuit can contain. */
export const CIRCUIT_POOL: readonly string[] = ['squat', 'rdl', 'pushup', 'pike-pushup', 'one-arm-row'];

/** The 4-exercise circuit. Every second session swaps the push-up for the pike push-up (shoulders). */
export function circuitFor(previousSessions: number): string[] {
  return ['squat', 'rdl', previousSessions % 2 === 0 ? 'pushup' : 'pike-pushup', 'one-arm-row'];
}

export function nextRest(rest: number): number {
  return REST_STEPS.find((step) => step < rest) ?? REST_STEPS.at(-1)!;
}

/** Shown when "too hard" is pressed on the easiest step and lightest band. */
export const EASIER_ADVICE: Record<string, string> = {
  squat: 'Squat down to a chair or sofa, or hold the bell lower at the chest.',
  rdl: 'Shorten the range: stop just below the knees, bell close to the legs.',
  pushup: 'Put your hands higher: kitchen counter, or a wall.',
  'pike-pushup': 'Put your hands higher (sofa arm or table), or bend the knees a little.',
  'one-arm-row': 'Step closer to the door to loosen the band.'
};

export function exercise(id: string): Exercise {
  const found = EXERCISES[id];
  if (!found) {
    throw new Error(`Unknown exercise: ${id}`);
  }
  return found;
}

export function variantIndex(ex: Exercise, variantId: string): number {
  return ex.ladder.findIndex((variant) => variant.id === variantId);
}

export function findVariant(ex: Exercise, variantId: string): Variant {
  return ex.ladder[variantIndex(ex, variantId)] ?? ex.ladder[0]!;
}

export function unitLabel(ex: Exercise, variant: Variant): string {
  if (ex.kind === 'hold') {
    return 's';
  }
  return variant.perSide ? 'reps/side' : 'reps';
}

const DEMO_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Local precached frames, written by `npm run demos`. */
export function demoFrames(key: DemoKey, base: string): [string, string] {
  return [`${base}exercises/${key}-0.webp`, `${base}exercises/${key}-1.webp`];
}

/** The original public-domain frames, used when the local copy is missing. */
export function remoteDemoFrame(key: DemoKey, frame: 0 | 1): string {
  return `${DEMO_BASE}/${demoNames[key]}/${frame}.jpg`;
}
