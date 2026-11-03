import { addDays, daysBetween } from './dates';
import type { SetInput } from './model';
import {
  BAND_LEVELS,
  DELOAD_ROUNDS,
  EXERCISES,
  REST_STEPS,
  ROUNDS,
  exercise,
  findVariant,
  nextRest,
  variantIndex,
  type Exercise,
  type WorkoutId
} from './program';

/**
 * Progression engine. Everything is derived by replaying the logged sets in
 * date order, so there is no separate state to keep in sync.
 *
 * After each session, per circuit exercise (3 rounds):
 * - hold: reps inside the range → beat last time by a rep (double progression).
 * - progress: every round at the top of the range (≤2 RIR) → the rest after
 *   that exercise shortens 90 → 75 → 60 → 45 s; at 45 s the load goes up
 *   (next band level, else next variant) and the rest starts again at 90 s.
 * - easy: the same at ≥3 RIR → load goes up straight away.
 * - stall: total reps dropped two sessions in a row at the same load, or
 *   RIR 0 below the range → repeat once; still stalled → one band or step back.
 * - incomplete: fewer rounds than 3 (deload, cut short) → no change.
 * The finisher (swings, plank) is logged for history only. Sets from the
 * earlier A/B plan replay under the same rules.
 */

export type LoggedSet = Pick<SetInput, 'date' | 'exercise' | 'variant' | 'setNumber' | 'reps' | 'seconds' | 'rir' | 'band'>
  & { workout?: WorkoutId };

export type Outcome = 'progress' | 'easy' | 'hold' | 'stall' | 'incomplete';

export type Change =
  | 'start'
  | 'rest-'
  | 'band+'
  | 'variant+'
  | 'top'
  | 'reps+'
  | 'repeat'
  | 'band-'
  | 'variant-'
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
  /** Suggested reps/seconds per round for the next session. */
  target: number;
  /** Rest after this exercise in the circuit, in seconds. */
  rest: number;
  lastOutcome: Outcome | null;
  change: Change;
  stallStrikes: number;
  dropStreak: number;
  lastTotal: number | null;
  lastDate: string | null;
  history: SessionSummary[];
};

export type ReplayOptions = {
  /** Last day of the most recent deload; stall counters restart after it. */
  resetAfter?: string | null;
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
    workout: first?.workout ?? 'Q',
    variant: first?.variant ?? ex.start,
    band: bands.length > 0 ? Math.max(...bands) : null,
    sets: sets.length,
    total: values.reduce((sum, value) => sum + value, 0),
    best: values.length > 0 ? Math.max(...values) : 0,
    minRir: rirs.length > 0 ? Math.min(...rirs) : null
  };
}

/** How one session went against the 3 prescribed rounds. */
export function evaluate(ex: Exercise, sets: readonly LoggedSet[], rounds = ROUNDS): Outcome {
  if (sets.length === 0 || sets.length < rounds) {
    return 'incomplete';
  }
  const values = sets.map((set) => valueOf(ex, set));
  if (values.every((value) => value >= ex.max)) {
    // Unknown effort counts as a normal working set (2 RIR).
    const minRir = Math.min(...sets.map((set) => set.rir ?? 2));
    return minRir >= 3 ? 'easy' : 'progress';
  }
  // Missing the bottom of the range means the load is too heavy, whatever the RIR.
  if (values.some((value) => value < ex.min)) {
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
    target: ex.min,
    rest: REST_STEPS[0]!,
    lastOutcome: null,
    change: 'start',
    stallStrikes: 0,
    dropStreak: 0,
    lastTotal: null,
    lastDate: null,
    history: []
  };
}

function loadUp(ex: Exercise, state: ExerciseState): void {
  const variant = findVariant(ex, state.variant);
  if (variant.banded && state.band !== null && state.band < BAND_LEVELS) {
    state.band += 1;
    state.rest = REST_STEPS[0]!;
    state.target = ex.min;
    state.change = 'band+';
    return;
  }
  const next = ex.ladder[variantIndex(ex, state.variant) + 1];
  if (next) {
    // A new banded step starts a bit lighter so the band can climb again.
    state.band = next.banded ? (variant.banded && state.band !== null ? Math.max(1, state.band - 2) : 1) : null;
    state.variant = next.id;
    state.rest = REST_STEPS[0]!;
    state.target = ex.min;
    state.change = 'variant+';
    return;
  }
  state.target = ex.max;
  state.change = 'top';
}

function stepBack(ex: Exercise, state: ExerciseState): void {
  const variant = findVariant(ex, state.variant);
  state.rest = REST_STEPS[0]!;
  if (variant.banded && state.band !== null && state.band > 1) {
    state.band -= 1;
    state.change = 'band-';
  } else if (variantIndex(ex, state.variant) > 0) {
    const previous = ex.ladder[variantIndex(ex, state.variant) - 1]!;
    state.variant = previous.id;
    state.band = previous.banded ? Math.max(1, state.band ?? 2) : null;
    state.change = 'variant-';
  } else {
    state.change = 'repeat';
  }
  state.target = ex.min;
}

function apply(ex: Exercise, state: ExerciseState, sets: readonly LoggedSet[]): void {
  const summary = summarize(ex, sets);
  state.lastDate = summary.date;
  if (ex.finisher) {
    state.history.push(summary);
    return;
  }
  // What was actually logged wins (e.g. sets from an older version of the plan).
  if (variantIndex(ex, summary.variant) >= 0 && summary.variant !== state.variant) {
    state.variant = summary.variant;
  }
  if (findVariant(ex, state.variant).banded && summary.band !== null) {
    state.band = summary.band;
  }

  let outcome = evaluate(ex, sets);
  const previous = state.history.at(-1);
  const sameLoad = previous !== undefined && previous.variant === summary.variant && previous.band === summary.band;
  if (outcome === 'hold') {
    state.dropStreak = sameLoad && state.lastTotal !== null && summary.total < state.lastTotal ? state.dropStreak + 1 : 0;
    if (state.dropStreak >= 2) {
      outcome = 'stall';
    }
  }

  switch (outcome) {
    case 'progress':
      state.stallStrikes = 0;
      state.dropStreak = 0;
      if (state.rest > REST_STEPS.at(-1)!) {
        state.rest = nextRest(state.rest);
        state.target = ex.max;
        state.change = 'rest-';
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
      state.stallStrikes += 1;
      if (state.stallStrikes >= 2) {
        state.stallStrikes = 0;
        state.dropStreak = 0;
        stepBack(ex, state);
      } else {
        state.change = 'repeat';
        state.target = Math.max(ex.min, Math.min(ex.max, summary.best));
      }
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
  state.history.push(summary);
}

/** Groups sets by day, workout and exercise, oldest first. */
export function groupSessions(sets: readonly LoggedSet[]): { date: string; exercise: string; sets: LoggedSet[] }[] {
  const groups = new Map<string, { date: string; exercise: string; sets: LoggedSet[] }>();
  for (const set of sets) {
    const key = `${set.date}|${set.workout ?? 'Q'}|${set.exercise}`;
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
    if (!ex.warmup) {
      states[ex.id] = initialState(ex);
    }
  }
  const resetAfter = options.resetAfter ?? null;

  for (const session of groupSessions(sets)) {
    // Exercises of the retired A/B plan (split squat, KB press, …) are skipped.
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
    apply(ex, state, session.sets);
  }

  return states;
}

export type Prescription = {
  rounds: number;
  min: number;
  max: number;
  target: number;
  rest: number;
  rir: string;
};

export function prescribe(ex: Exercise, state: ExerciseState, deload: boolean): Prescription {
  if (deload) {
    return { rounds: DELOAD_ROUNDS, min: ex.min, max: ex.max, target: ex.min, rest: REST_STEPS[0]!, rir: '3–4 RIR (deload: easy)' };
  }
  return {
    rounds: ROUNDS,
    min: ex.min,
    max: ex.max,
    target: state.target,
    rest: state.rest,
    rir: ex.rirFloor >= 1 ? '1–3 RIR, never to failure' : '1–3 RIR (last round may go to 0)'
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
  'rest-': 'Progress: shorter rest',
  'band+': 'Progress: next band level',
  'variant+': 'Progress: next variation',
  top: 'Top of the ladder: slow the tempo',
  'reps+': 'Beat last time by a rep',
  repeat: 'Stalled: repeat this load',
  'band-': 'Stalled twice: one band lighter',
  'variant-': 'Stalled twice: one step back',
  none: 'Same as last time'
};

export function isProgression(change: Change): boolean {
  return change === 'band+' || change === 'variant+' || change === 'top' || change === 'rest-';
}
