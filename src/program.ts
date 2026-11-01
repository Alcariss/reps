import demoNames from './demos.json';

/**
 * The training program: exercises, their progression ladders and the two
 * alternating full-body workouts. Pure data, no DOM.
 */

/** A and B are the full plan; Q is the 20–25 min Quick circuit. */
export type WorkoutId = 'A' | 'B' | 'Q';
export type PlanId = 'A' | 'B';
export type ExerciseKind = 'reps' | 'hold' | 'emom';
export type Muscle = 'legs' | 'hinge' | 'push' | 'pull' | 'core' | 'conditioning';
export type DemoKey = keyof typeof demoNames;

export type Variant = {
  id: string;
  name: string;
  demo: DemoKey;
  /** Reps are counted per side (split squats, single-leg work, one-arm press). */
  perSide?: boolean;
  /** The band level is the load and can go up before the next variant. */
  banded?: boolean;
  tempo?: string;
  /** Extra cue shown for this step only. */
  hint?: string;
};

export type Exercise = {
  id: string;
  name: string;
  kind: ExerciseKind;
  muscle: Muscle;
  /** Main lifts rest longer and count toward the weekly volume cap. */
  main: boolean;
  /** Working sets at the start of a variant (EMOM: minutes). */
  sets: number;
  maxSets: number;
  /** Reps per set, seconds per hold, or reps per EMOM minute. */
  min: number;
  max: number;
  restSeconds: number;
  /** Lowest RIR to aim for. 1 = never grind to failure (RDL, swing). */
  rirFloor: number;
  /** Uses a resistance band, so a band level is logged. */
  usesBand: boolean;
  cues: string[];
  ladder: Variant[];
  /** Variant a new user starts on. */
  start: string;
  /** Warm-up movement only: shown with a demo, never logged or progressed. */
  warmup?: boolean;
};

export const BAND_LEVELS = 6;
export const WEEKLY_SET_CAP = 15;
export const SESSIONS_PER_WEEK = 3;

export const EXERCISES: Record<string, Exercise> = {
  squat: {
    id: 'squat',
    name: 'Goblet squat',
    kind: 'reps',
    muscle: 'legs',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 8,
    max: 15,
    restSeconds: 120,
    rirFloor: 1,
    usesBand: false,
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
  'split-squat': {
    id: 'split-squat',
    name: 'Split squat',
    kind: 'reps',
    muscle: 'legs',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 8,
    max: 12,
    restSeconds: 120,
    rirFloor: 1,
    usesBand: false,
    cues: [
      'Long stance',
      'Back knee goes straight down',
      'Drive through front heel and midfoot',
      'Slight forward lean for more glutes'
    ],
    ladder: [
      { id: 'kb-split-squat', name: 'KB split squat', demo: 'split-squat', perSide: true, tempo: '2-0-1' },
      { id: 'rfe-split-squat', name: 'Rear-foot-elevated (Bulgarian) split squat', demo: 'split-squat', perSide: true, tempo: '2-0-1', hint: 'Back foot on a chair or sofa.' },
      { id: 'rfe-split-squat-kb', name: 'Bulgarian split squat with KB', demo: 'split-squat', perSide: true, tempo: '2-0-1' },
      { id: 'rfe-split-squat-1-5', name: 'Bulgarian split squat 1½ reps', demo: 'split-squat', perSide: true, tempo: '3-0-1' }
    ],
    start: 'kb-split-squat'
  },
  rdl: {
    id: 'rdl',
    name: 'Romanian deadlift',
    kind: 'reps',
    muscle: 'hinge',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 8,
    max: 15,
    restSeconds: 120,
    rirFloor: 1,
    usesBand: false,
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
    main: true,
    sets: 3,
    maxSets: 4,
    min: 6,
    max: 15,
    restSeconds: 90,
    rirFloor: 0,
    usesBand: true,
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
  press: {
    id: 'press',
    name: 'One-arm KB press',
    kind: 'reps',
    muscle: 'push',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 6,
    max: 12,
    restSeconds: 90,
    rirFloor: 1,
    usesBand: false,
    cues: [
      'Rack: straight wrist, vertical forearm',
      'Squeeze glutes, brace, ribs down',
      'Press up and slightly back, bicep by ear',
      'Lower under control'
    ],
    ladder: [
      { id: 'half-kneeling-press', name: 'Half-kneeling one-arm KB press', demo: 'press', perSide: true, tempo: '2-0-1' },
      { id: 'standing-press', name: 'Standing one-arm KB press', demo: 'press', perSide: true, tempo: '2-0-1' },
      { id: 'tempo-press', name: 'Pause press (2 s at the top, 3 s down)', demo: 'press', perSide: true, tempo: '3-2-1' }
    ],
    start: 'half-kneeling-press'
  },
  row: {
    id: 'row',
    name: 'Bent-over band row',
    kind: 'reps',
    muscle: 'pull',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 10,
    max: 20,
    restSeconds: 90,
    rirFloor: 0,
    usesBand: true,
    cues: [
      'Stand on the band, hinge ~45°, flat back',
      'Elbows to back pockets, squeeze blades',
      'No shrug, torso still',
      '2–3 s return'
    ],
    ladder: [
      { id: 'band-row', name: 'Two-arm bent-over band row', demo: 'row', banded: true, tempo: '1-1-3' },
      { id: 'band-row-short', name: 'Band row, shorter grip', demo: 'row', banded: true, tempo: '1-1-3', hint: 'Choke up on the band for more tension.' },
      { id: 'band-row-double', name: 'Band row, two bands', demo: 'row', banded: true, tempo: '1-1-3' },
      { id: 'band-row-squeeze', name: 'Band row, 2 s squeeze at the top', demo: 'row', banded: true, tempo: '1-2-3' },
      { id: 'kb-row', name: 'One-arm 16 kg KB row', demo: 'row', perSide: true, tempo: '1-1-3' }
    ],
    start: 'band-row'
  },
  'pull-apart': {
    id: 'pull-apart',
    name: 'Band pull-apart / face pull',
    kind: 'reps',
    muscle: 'pull',
    main: false,
    sets: 2,
    maxSets: 3,
    min: 15,
    max: 25,
    restSeconds: 60,
    rirFloor: 0,
    usesBand: true,
    cues: [
      'Straight arms (elbows high for face pull)',
      'Blades back and down',
      '1 s hold, slow return'
    ],
    ladder: [
      { id: 'pull-apart', name: 'Band pull-apart', demo: 'pull-apart', banded: true, tempo: '1-1-2' },
      { id: 'face-pull', name: 'Band face pull', demo: 'face-pull', banded: true, tempo: '1-1-2', hint: 'Anchor the band at face height (door anchor).' }
    ],
    start: 'pull-apart'
  },
  'scap-pushup': {
    id: 'scap-pushup',
    name: 'Scapular push-up',
    kind: 'reps',
    muscle: 'core',
    main: false,
    sets: 2,
    maxSets: 2,
    min: 8,
    max: 15,
    restSeconds: 60,
    rirFloor: 0,
    usesBand: false,
    cues: [
      'High plank, arms locked',
      'Sink the chest by squeezing the blades, no elbow bend',
      'Push the floor away to spread the blades',
      'Slow, neck neutral'
    ],
    ladder: [
      { id: 'scap-pushup', name: 'Scapular push-up', demo: 'pushup', tempo: '2-1-2' },
      { id: 'scap-pushup-band', name: 'Banded scapular push-up', demo: 'pushup', banded: true, tempo: '2-1-2' }
    ],
    start: 'scap-pushup'
  },
  'dead-bug': {
    id: 'dead-bug',
    name: 'Dead bug',
    kind: 'reps',
    muscle: 'core',
    main: false,
    sets: 2,
    maxSets: 3,
    min: 6,
    max: 10,
    restSeconds: 60,
    rirFloor: 0,
    usesBand: false,
    cues: [
      'Low back pressed to the floor',
      'Extend opposite arm and leg slowly on the exhale',
      'Stop before the back arches'
    ],
    ladder: [
      { id: 'dead-bug', name: 'Dead bug', demo: 'dead-bug', perSide: true, tempo: '3-1-3' },
      { id: 'dead-bug-kb', name: 'Dead bug holding the KB', demo: 'dead-bug', perSide: true, tempo: '3-1-3' }
    ],
    start: 'dead-bug'
  },
  'one-arm-row': {
    id: 'one-arm-row',
    name: 'Single-arm band row',
    kind: 'reps',
    muscle: 'pull',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 10,
    max: 20,
    restSeconds: 90,
    rirFloor: 0,
    usesBand: true,
    cues: [
      'Band under the opposite foot, staggered stance, flat back',
      'Pull the elbow back past the ribs, not out to the side',
      'Squeeze the shoulder blade back and down at the top',
      '2–3 s return, no torso twist'
    ],
    ladder: [
      { id: 'one-arm-band-row', name: 'Single-arm band row', demo: 'one-arm-row', perSide: true, banded: true, tempo: '1-1-3' },
      { id: 'one-arm-band-row-squeeze', name: 'Single-arm band row, 2 s squeeze', demo: 'one-arm-row', perSide: true, banded: true, tempo: '1-2-3' },
      { id: 'one-arm-kb-row', name: 'One-arm 16 kg KB row', demo: 'one-arm-row', perSide: true, tempo: '1-1-3', hint: 'Free hand on a chair or knee for support.' }
    ],
    start: 'one-arm-band-row'
  },
  'band-press': {
    id: 'band-press',
    name: 'Single-arm band overhead press',
    kind: 'reps',
    muscle: 'push',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 8,
    max: 15,
    restSeconds: 90,
    rirFloor: 1,
    usesBand: true,
    cues: [
      'Band under the same-side foot, hand at the shoulder',
      'Glutes tight, ribs down, no leaning back',
      'Press straight up, bicep by the ear',
      'Lower slowly against the band'
    ],
    ladder: [
      { id: 'one-arm-band-press', name: 'Single-arm band overhead press', demo: 'band-press', perSide: true, banded: true, tempo: '2-0-1' },
      { id: 'one-arm-band-press-pause', name: 'Band overhead press, 2 s hold at the top', demo: 'band-press', perSide: true, banded: true, tempo: '3-2-1' }
    ],
    start: 'one-arm-band-press'
  },
  'floor-press': {
    id: 'floor-press',
    name: 'KB floor press',
    kind: 'reps',
    muscle: 'push',
    main: true,
    sets: 3,
    maxSets: 4,
    min: 8,
    max: 12,
    restSeconds: 90,
    rirFloor: 1,
    usesBand: false,
    cues: [
      'Lie on your back, knees bent, KB in the rack, wrist straight',
      'Elbow about 45° from the body',
      'Lower until the upper arm touches the floor, pause softly',
      'Press straight up over the shoulder'
    ],
    ladder: [
      { id: 'kb-floor-press', name: 'One-arm KB floor press', demo: 'floor-press', perSide: true, tempo: '2-1-1' },
      { id: 'kb-floor-press-tempo', name: 'KB floor press, 3 s down + 2 s pause', demo: 'floor-press', perSide: true, tempo: '3-2-1' },
      { id: 'kb-floor-press-legs-up', name: 'KB floor press, legs straight (no leg drive)', demo: 'floor-press', perSide: true, tempo: '3-1-1' }
    ],
    start: 'kb-floor-press'
  },
  'band-good-morning': {
    id: 'band-good-morning',
    name: 'Band good morning',
    kind: 'reps',
    muscle: 'hinge',
    main: false,
    sets: 1,
    maxSets: 1,
    min: 10,
    max: 10,
    restSeconds: 0,
    rirFloor: 3,
    usesBand: true,
    cues: [
      'Medium band under the feet and behind the neck',
      'Soft knees, push the hips back, flat back',
      'Stop at the hamstring stretch, stand tall by squeezing glutes'
    ],
    ladder: [{ id: 'band-good-morning', name: 'Band good morning', demo: 'good-morning' }],
    start: 'band-good-morning',
    warmup: true
  },
  'worlds-greatest-stretch': {
    id: 'worlds-greatest-stretch',
    name: 'World’s greatest stretch',
    kind: 'reps',
    muscle: 'core',
    main: false,
    sets: 1,
    maxSets: 1,
    min: 4,
    max: 4,
    restSeconds: 0,
    rirFloor: 3,
    usesBand: false,
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
  swing: {
    id: 'swing',
    name: 'KB swing EMOM',
    kind: 'emom',
    muscle: 'conditioning',
    main: false,
    sets: 6,
    maxSets: 10,
    min: 10,
    max: 15,
    restSeconds: 0,
    rirFloor: 1,
    usesBand: false,
    cues: [
      'Hinge, not squat: hike the bell back',
      'Snap the hips, arms are ropes, bell to chest height',
      'Standing plank at the top, no lean back',
      'Sharp exhale'
    ],
    ladder: [
      { id: 'two-arm-swing', name: 'Two-arm KB swing', demo: 'swing' },
      { id: 'one-arm-swing', name: 'One-arm KB swing (alternate each minute)', demo: 'swing' }
    ],
    start: 'two-arm-swing'
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    kind: 'hold',
    muscle: 'core',
    main: false,
    sets: 2,
    maxSets: 2,
    min: 20,
    max: 45,
    restSeconds: 60,
    rirFloor: 0,
    usesBand: false,
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
    start: 'plank'
  }
};

export const WORKOUTS: Record<PlanId, readonly string[]> = {
  A: ['squat', 'pushup', 'row', 'rdl', 'pull-apart', 'dead-bug', 'scap-pushup'],
  B: ['split-squat', 'rdl', 'press', 'row', 'pushup', 'swing', 'plank']
};

/**
 * Quick: a 20–25 min circuit for busy days. Same exercise ids as A/B, so
 * history and ladders are shared; only rest and rounds differ.
 */
export const QUICK_ROUNDS = 3;
export const QUICK_REST_STEPS: readonly number[] = [90, 75, 60, 45];
export const QUICK_FINISHER = { rounds: 3, swing: 'swing', swings: 15, plank: 'plank', plankMin: 30, plankMax: 45 } as const;
export const QUICK_WARMUP: readonly { exercise: string; amount: string }[] = [
  { exercise: 'pull-apart', amount: '15, light band' },
  { exercise: 'worlds-greatest-stretch', amount: '4 per side' },
  { exercise: 'band-good-morning', amount: '10, medium band' }
];
/** Exercises the Quick circuit can contain, for the Progress tab. */
export const QUICK_POOL: readonly string[] = ['squat', 'rdl', 'pushup', 'floor-press', 'band-press', 'one-arm-row'];

/**
 * The 4-exercise circuit. Every second Quick session swaps the push-up for a
 * press, alternating KB floor press and band overhead press.
 */
export function quickCircuit(previousQuickSessions: number): string[] {
  const slot = previousQuickSessions % 2 === 0 ? 'pushup' : previousQuickSessions % 4 === 1 ? 'floor-press' : 'band-press';
  return ['squat', 'rdl', slot, 'one-arm-row'];
}

export function nextQuickRest(rest: number): number {
  return QUICK_REST_STEPS.find((step) => step < rest) ?? QUICK_REST_STEPS.at(-1)!;
}

export const WARMUP: readonly string[] = [
  '1–2 min easy movement (march, arm circles, jumping jacks)',
  '10 band pull-aparts',
  '10 scapular push-ups',
  '10 hip hinges or KB halos',
  '1 easy ramp-up set of the first exercise'
];

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

export function otherWorkout(workout: PlanId): PlanId {
  return workout === 'A' ? 'B' : 'A';
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
