import { addDays, daysBetween } from './dates';
import type { SetInput } from './model';
import {
  BAND_LEVELS,
  EXERCISES,
  QUICK_FINISHER,
  QUICK_REST_STEPS,
  QUICK_ROUNDS,
  SESSIONS_PER_WEEK,
  WEEKLY_SET_CAP,
  WORKOUTS,
  exercise,
  findVariant,
  nextQuickRest,
  variantIndex,
  type Exercise,
  type Muscle,
  type WorkoutId
} from './program';

/**
 * Progression engine. Everything is derived by replaying the logged sets in
 * date order, so there is no separate state to keep in sync.
 *
 * After each session, per exercise:
 * - progress: every working set reached the top of the range (≤2 RIR)
 *   → +1 set while weekly volume allows, else next band level, else next variant.
 * - easy: the same at ≥3 RIR → skip the extra set, go straight to more load.
 * - stall: total reps dropped two sessions in a row, or RIR 0 below the range
 *   → repeat once; still stalled → −1 set, or step back a band/variant.
 * - hold: keep the load and add reps (double progression).
 * - incomplete: fewer sets than prescribed (e.g. deload) → no change.
 *
 * Quick (Q) sessions share the ladders but progress differently first:
 * all rounds at the top of the range shortens that exercise's circuit rest
 * 90 → 75 → 60 → 45 s; at 45 s the load goes up (band or variant) and the
 * rest starts again at 90 s. Q never changes the A/B set count, and the
 * finisher (swings, plank) is logged for history only.
 */

export type LoggedSet = Pick<SetInput, 'date' | 'exercise' | 'variant' | 'setNumber' | 'reps' | 'seconds' | 'rir' | 'band'>
  & { workout?: WorkoutId };

export type Outcome = 'progress' | 'easy' | 'hold' | 'stall' | 'incomplete';

export type Change =
  | 'start'
  | 'set+'
  | 'band+'
  | 'variant+'
  | 'top'
  | 'reps+'
  | 'repeat'
  | 'set-'
  | 'band-'
  | 'variant-'
  | 'rest-'
  | 'manual'
  | 'none';

export type SessionSummary = {
  date: string;
  workout: WorkoutId;
  variant: string;
  band: number | null;
  sets: number;
  /** Total reps (or seconds for holds). */
  total: number;
  /** Best single set. */
  best: number;
  minRir: number | null;
};

export type ExerciseState = {
  exercise: string;
  variant: string;
  band: number | null;
  /** Prescribed working sets (EMOM: minutes). */
  sets: number;
  /** Suggested reps/seconds per set for the next session. */
  target: number;
  lastOutcome: Outcome | null;
  change: Change;
  stallStrikes: number;
  dropStreak: number;
  lastTotal: number | null;
  lastDate: string | null;
  /** Rest between exercises in the Quick circuit, in seconds. */
  quickRest: number;
  history: SessionSummary[];
};

export type Override = { variant: string; band: number | null; date: string };

export type ReplayOptions = {
  /** Last day of the most recent deload; stall counters restart after it. */
  resetAfter?: string | null;
  /** Manual "too hard / too easy" choices, newest wins over history of the same day or older. */
  overrides?: Record<string, Override>;
};

function valueOf(ex: Exercise, set: LoggedSet): number {
  return (ex.kind === 'hold' ? set.seconds : set.reps) ?? 0;
}

export function summarize(ex: Exercise, sets: readonly LoggedSet[]): SessionSummary {
  const values = sets.map((set) => valueOf(ex, set));
  const rirs = sets.map((set) => set.rir).filter((rir): rir is number => rir !== null);
  const bands = sets.map((set) => set.band).filter((band): band is number => band !== null);
  const first = sets[0];
  return {
    date: first?.date ?? '',
    workout: first?.workout ?? 'A',
    variant: first?.variant ?? ex.start,
    band: bands.length > 0 ? Math.max(...bands) : null,
    sets: sets.length,
    total: values.reduce((sum, value) => sum + value, 0),
    best: values.length > 0 ? Math.max(...values) : 0,
    minRir: rirs.length > 0 ? Math.min(...rirs) : null
  };
}

/** How one session went against what was prescribed. */
export function evaluate(ex: Exercise, sets: readonly LoggedSet[], prescribedSets: number): Outcome {
  if (sets.length === 0 || sets.length < prescribedSets) {
    return 'incomplete';
  }
  const values = sets.map((set) => valueOf(ex, set));
  if (values.every((value) => value >= ex.max)) {
    // Unknown effort counts as a normal working set (2 RIR).
    const minRir = Math.min(...sets.map((set) => set.rir ?? 2));
    return minRir >= 3 ? 'easy' : 'progress';
  }
  if (sets.some((set) => set.rir === 0 && valueOf(ex, set) < ex.min)) {
    return 'stall';
  }
  return 'hold';
}

export function initialState(ex: Exercise): ExerciseState {
  const variant = findVariant(ex, ex.start);
  return {
    exercise: ex.id,
    variant: variant.id,
    band: variant.banded ? 2 : null,
    sets: ex.sets,
    target: ex.min,
    lastOutcome: null,
    change: 'start',
    stallStrikes: 0,
    dropStreak: 0,
    lastTotal: null,
    lastDate: null,
    quickRest: QUICK_REST_STEPS[0]!,
    history: []
  };
}

/** Times per week an exercise comes up when A and B alternate 3×/week. */
export function weeklyFrequency(exerciseId: string): number {
  const perWorkout = SESSIONS_PER_WEEK / 2;
  return (WORKOUTS.A.includes(exerciseId) ? perWorkout : 0) + (WORKOUTS.B.includes(exerciseId) ? perWorkout : 0);
}

/** Estimated hard sets per week for a muscle group at the current prescriptions. */
export function weeklySets(muscle: Muscle, states: Record<string, ExerciseState>): number {
  let total = 0;
  for (const ex of Object.values(EXERCISES)) {
    if (ex.muscle === muscle) {
      total += (states[ex.id]?.sets ?? ex.sets) * weeklyFrequency(ex.id);
    }
  }
  return total;
}

function hasVolumeRoom(ex: Exercise, states: Record<string, ExerciseState>): boolean {
  if (ex.muscle === 'conditioning') {
    return true;
  }
  return weeklySets(ex.muscle, states) + weeklyFrequency(ex.id) <= WEEKLY_SET_CAP;
}

function loadUp(ex: Exercise, state: ExerciseState): void {
  const variant = findVariant(ex, state.variant);
  // Heavier load: the Quick circuit starts again with its longest rest.
  state.quickRest = QUICK_REST_STEPS[0]!;
  if (variant.banded && state.band !== null && state.band < BAND_LEVELS) {
    state.band += 1;
    state.sets = ex.sets;
    state.target = ex.min;
    state.change = 'band+';
    return;
  }
  const next = ex.ladder[variantIndex(ex, state.variant) + 1];
  if (next) {
    // A new banded step starts a bit lighter so the band can climb again.
    state.band = next.banded ? (variant.banded && state.band !== null ? Math.max(1, state.band - 2) : 1) : null;
    state.variant = next.id;
    state.sets = ex.sets;
    state.target = ex.min;
    state.change = 'variant+';
    return;
  }
  state.sets = Math.min(ex.maxSets, state.sets + 1);
  state.target = ex.max;
  state.change = 'top';
}

function stepBack(ex: Exercise, state: ExerciseState): void {
  const variant = findVariant(ex, state.variant);
  state.quickRest = QUICK_REST_STEPS[0]!;
  if (state.sets > ex.sets) {
    state.sets -= 1;
    state.change = 'set-';
  } else if (variant.banded && state.band !== null && state.band > 1) {
    state.band -= 1;
    state.change = 'band-';
  } else if (variantIndex(ex, state.variant) > 0) {
    const previous = ex.ladder[variantIndex(ex, state.variant) - 1]!;
    state.variant = previous.id;
    state.band = previous.banded ? Math.max(1, state.band ?? 2) : null;
    state.sets = ex.sets;
    state.change = 'variant-';
  } else {
    state.change = 'repeat';
  }
  state.target = ex.min;
}

function apply(
  ex: Exercise,
  state: ExerciseState,
  sets: readonly LoggedSet[],
  states: Record<string, ExerciseState>
): void {
  const summary = summarize(ex, sets);
  if (summary.workout === 'Q' && (ex.id === QUICK_FINISHER.swing || ex.id === QUICK_FINISHER.plank)) {
    // The Quick finisher is logged for history only; its A/B prescription stays.
    state.lastDate = summary.date;
    state.history.push(summary);
    return;
  }
  // What was actually done wins: a manual switch shows up in the log.
  if (variantIndex(ex, summary.variant) >= 0 && summary.variant !== state.variant) {
    state.variant = summary.variant;
    state.sets = Math.max(ex.sets, Math.min(state.sets, ex.maxSets));
  }
  if (findVariant(ex, state.variant).banded && summary.band !== null) {
    state.band = summary.band;
  }

  if (summary.workout === 'Q') {
    applyQuick(ex, state, sets, summary);
    return;
  }

  let outcome = evaluate(ex, sets, state.sets);
  const comparable = state.history.filter((session) => session.workout !== 'Q').at(-1);
  const sameLoad = comparable !== undefined
    && comparable.variant === summary.variant
    && comparable.band === summary.band;

  if (outcome === 'hold') {
    state.dropStreak = sameLoad && state.lastTotal !== null && summary.total < state.lastTotal
      ? state.dropStreak + 1
      : 0;
    if (state.dropStreak >= 2) {
      outcome = 'stall';
    }
  }

  switch (outcome) {
    case 'progress':
      state.stallStrikes = 0;
      state.dropStreak = 0;
      if (state.sets < ex.maxSets && hasVolumeRoom(ex, states)) {
        state.sets += 1;
        state.target = Math.max(ex.min, ex.max - 2);
        state.change = 'set+';
      } else {
        loadUp(ex, state);
      }
      break;
    case 'easy':
      state.stallStrikes = 0;
      state.dropStreak = 0;
      loadUp(ex, state);
      break;
    case 'stall':
      stall(ex, state, summary);
      break;
    case 'hold':
      state.stallStrikes = 0;
      state.change = 'reps+';
      state.target = Math.max(ex.min, Math.min(ex.max, summary.best + 1));
      break;
    case 'incomplete':
      state.change = 'none';
      break;
  }

  state.lastOutcome = outcome;
  if (outcome !== 'incomplete') {
    state.lastTotal = summary.total;
  }
  state.lastDate = summary.date;
  state.history.push(summary);
}

function stall(ex: Exercise, state: ExerciseState, summary: SessionSummary): void {
  state.stallStrikes += 1;
  if (state.stallStrikes >= 2) {
    state.stallStrikes = 0;
    state.dropStreak = 0;
    stepBack(ex, state);
  } else {
    state.change = 'repeat';
    state.target = Math.max(ex.min, Math.min(ex.max, summary.best));
  }
}

function applyQuick(ex: Exercise, state: ExerciseState, sets: readonly LoggedSet[], summary: SessionSummary): void {
  state.lastDate = summary.date;
  state.history.push(summary);
  const outcome = evaluate(ex, sets, QUICK_ROUNDS);
  switch (outcome) {
    case 'progress':
      state.stallStrikes = 0;
      if (state.quickRest > QUICK_REST_STEPS.at(-1)!) {
        state.quickRest = nextQuickRest(state.quickRest);
        state.change = 'rest-';
        state.target = ex.max;
      } else {
        loadUp(ex, state);
      }
      break;
    case 'easy':
      state.stallStrikes = 0;
      loadUp(ex, state);
      break;
    case 'stall':
      stall(ex, state, summary);
      break;
    case 'hold':
      state.stallStrikes = 0;
      state.change = 'reps+';
      state.target = Math.max(ex.min, Math.min(ex.max, summary.best + 1));
      break;
    case 'incomplete':
      break;
  }
  state.lastOutcome = outcome;
}

/** Groups sets by day, workout and exercise, oldest first. */
export function groupSessions(sets: readonly LoggedSet[]): { date: string; exercise: string; sets: LoggedSet[] }[] {
  const groups = new Map<string, { date: string; exercise: string; sets: LoggedSet[] }>();
  for (const set of sets) {
    const key = `${set.date}|${set.workout ?? 'A'}|${set.exercise}`;
    const group = groups.get(key) ?? { date: set.date, exercise: set.exercise, sets: [] };
    group.sets.push(set);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, sets: [...group.sets].sort((a, b) => a.setNumber - b.setNumber) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Current state of every exercise, replayed from the whole log. */
export function replay(sets: readonly LoggedSet[], options: ReplayOptions = {}): Record<string, ExerciseState> {
  const states: Record<string, ExerciseState> = {};
  for (const ex of Object.values(EXERCISES)) {
    states[ex.id] = initialState(ex);
  }
  const resetAfter = options.resetAfter ?? null;

  for (const session of groupSessions(sets)) {
    const ex = EXERCISES[session.exercise];
    const state = states[session.exercise];
    if (!ex || !state) {
      continue;
    }
    if (resetAfter !== null && state.lastDate !== null && state.lastDate <= resetAfter && session.date > resetAfter) {
      state.stallStrikes = 0;
      state.dropStreak = 0;
      state.lastTotal = null;
    }
    apply(ex, state, session.sets, states);
  }

  for (const [exerciseId, override] of Object.entries(options.overrides ?? {})) {
    const ex = EXERCISES[exerciseId];
    const state = states[exerciseId];
    if (!ex || !state || variantIndex(ex, override.variant) < 0) {
      continue;
    }
    if (state.lastDate === null || override.date >= state.lastDate) {
      state.variant = override.variant;
      state.band = findVariant(ex, override.variant).banded ? (override.band ?? state.band ?? 1) : null;
      state.sets = ex.sets;
      state.target = ex.min;
      state.change = 'manual';
    }
  }
  return states;
}

/** One step harder or easier on the ladder, for the "too easy / too hard" buttons. */
export function adjust(exerciseId: string, state: Pick<ExerciseState, 'variant' | 'band'>, direction: 1 | -1): { variant: string; band: number | null } {
  const ex = exercise(exerciseId);
  const variant = findVariant(ex, state.variant);
  const index = variantIndex(ex, variant.id);
  if (variant.banded && state.band !== null) {
    const band = state.band + direction;
    if (band >= 1 && band <= BAND_LEVELS) {
      return { variant: variant.id, band };
    }
  }
  const next = ex.ladder[index + direction];
  if (!next) {
    return { variant: variant.id, band: state.band };
  }
  const band = next.banded ? (direction === 1 ? 1 : BAND_LEVELS) : null;
  return { variant: next.id, band };
}

export type Prescription = {
  sets: number;
  min: number;
  max: number;
  target: number;
  rir: string;
};

/** One exercise of the Quick circuit: fixed rounds, rest from the engine. */
export function prescribeQuick(ex: Exercise, state: ExerciseState, deload: boolean): Prescription & { rest: number } {
  const base = prescribe(ex, { ...state, sets: QUICK_ROUNDS }, deload);
  return { ...base, sets: deload ? QUICK_ROUNDS - 1 : QUICK_ROUNDS, rest: deload ? QUICK_REST_STEPS[0]! : state.quickRest };
}

export function prescribe(ex: Exercise, state: ExerciseState, deload: boolean): Prescription {
  if (deload) {
    return {
      sets: Math.max(1, Math.ceil(state.sets / 2)),
      min: ex.min,
      max: ex.max,
      target: ex.min,
      rir: '3–4 RIR (deload: easy)'
    };
  }
  return {
    sets: state.sets,
    min: ex.min,
    max: ex.max,
    target: state.target,
    rir: ex.rirFloor >= 1 ? '1–3 RIR, never to failure' : '1–3 RIR (last set may go to 0)'
  };
}

export type DeloadStatus = {
  active: boolean;
  due: boolean;
  reason: 'scheduled' | 'stalls' | null;
  /** Weeks of training since the last deload (or the start). */
  weeks: number;
  stalled: string[];
};

export const DELOAD_EVERY_WEEKS = 6;

export function isStalled(state: ExerciseState): boolean {
  return state.lastOutcome === 'stall';
}

export function deloadStatus(
  states: Record<string, ExerciseState>,
  firstSessionDate: string | null,
  today: string,
  deloadFrom: string | null
): DeloadStatus {
  const active = deloadFrom !== null && today >= deloadFrom && today <= addDays(deloadFrom, 6);
  const blockStart = deloadFrom !== null && deloadFrom <= today ? addDays(deloadFrom, 7) : firstSessionDate;
  const weeks = blockStart === null ? 0 : Math.max(0, Math.floor(daysBetween(blockStart, today) / 7));
  const stalled = Object.values(states).filter(isStalled).map((state) => state.exercise);
  if (active) {
    return { active, due: false, reason: null, weeks, stalled };
  }
  if (stalled.length >= 2) {
    return { active, due: true, reason: 'stalls', weeks, stalled };
  }
  if (weeks >= DELOAD_EVERY_WEEKS) {
    return { active, due: true, reason: 'scheduled', weeks, stalled };
  }
  return { active, due: false, reason: null, weeks, stalled };
}

export const CHANGE_LABELS: Record<Change, string> = {
  start: 'Starting point',
  'set+': 'Progress: +1 set',
  'band+': 'Progress: next band level',
  'variant+': 'Progress: next variation',
  top: 'Top of the ladder: add a set or slow the tempo',
  'reps+': 'Beat last time by a rep',
  repeat: 'Stalled: repeat this load',
  'set-': 'Stalled twice: −1 set for now',
  'band-': 'Stalled twice: one band lighter',
  'variant-': 'Stalled twice: one step back',
  'rest-': 'Progress: shorter Quick rest',
  manual: 'Set by you',
  none: 'Same as last time'
};

export function isProgression(change: Change): boolean {
  return change === 'set+' || change === 'band+' || change === 'variant+' || change === 'top' || change === 'rest-';
}
