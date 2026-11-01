import { prescribe, type Change, type ExerciseState, type LoggedSet, type Prescription } from './engine';
import type { SetInput } from './model';
import { BAND_LEVELS, WARMUP, WORKOUTS, exercise, findVariant, type WorkoutId } from './program';

/** The workout in progress, kept in localStorage so a reload or app kill loses nothing. */

export type DraftSet = {
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  rir: number | null;
  band: number | null;
};

export type DraftExercise = {
  exercise: string;
  variant: string;
  band: number | null;
  prescription: Prescription;
  change: Change;
  /** Last session's values per set, to prefill the steppers. */
  previous: number[];
  logged: DraftSet[];
};

export type Draft = {
  version: 1;
  date: string;
  workout: WorkoutId;
  deload: boolean;
  startedAt: number;
  /** -1 = warm-up, 0…n-1 = exercise, n = finished. */
  step: number;
  warmup: boolean[];
  exercises: DraftExercise[];
  restEndsAt: number | null;
  restTotal: number;
};

/** Values (reps or seconds) of the most recent session of an exercise, by set. */
export function previousValues(sets: readonly LoggedSet[], exerciseId: string, before: string): number[] {
  const own = sets.filter((set) => set.exercise === exerciseId && set.date < before);
  const lastDate = own.reduce<string | null>((latest, set) => (latest === null || set.date > latest ? set.date : latest), null);
  if (lastDate === null) {
    return [];
  }
  const kind = exercise(exerciseId).kind;
  return own
    .filter((set) => set.date === lastDate)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((set) => (kind === 'hold' ? set.seconds : set.reps) ?? 0);
}

export function createDraft(options: {
  workout: WorkoutId;
  date: string;
  deload: boolean;
  states: Record<string, ExerciseState>;
  sets: readonly LoggedSet[];
  now: number;
}): Draft {
  return {
    version: 1,
    date: options.date,
    workout: options.workout,
    deload: options.deload,
    startedAt: options.now,
    step: -1,
    warmup: WARMUP.map(() => false),
    exercises: WORKOUTS[options.workout].map((exerciseId) => {
      const ex = exercise(exerciseId);
      const state = options.states[exerciseId];
      if (!state) {
        throw new Error(`No state for ${exerciseId}`);
      }
      return {
        exercise: exerciseId,
        variant: state.variant,
        band: state.band,
        prescription: prescribe(ex, state, options.deload),
        change: state.change,
        previous: previousValues(options.sets, exerciseId, options.date),
        logged: []
      };
    }),
    restEndsAt: null,
    restTotal: 0
  };
}

export function isDraft(value: unknown): value is Draft {
  return typeof value === 'object'
    && value !== null
    && (value as Draft).version === 1
    && Array.isArray((value as Draft).exercises);
}

/** Suggested value for the next set: last session's same set, else the engine's target. */
export function suggestedValue(item: DraftExercise): number {
  const setIndex = item.logged.length;
  const lastThisSession = item.logged.at(-1);
  const ex = exercise(item.exercise);
  const fromLastTime = item.previous[setIndex];
  if (item.change !== 'reps+' && item.change !== 'repeat' && item.change !== 'none') {
    // Load or sets changed: start from the bottom of the range again.
    return lastThisSession ? valueOf(item, lastThisSession) : item.prescription.target;
  }
  if (fromLastTime !== undefined) {
    // Double progression: aim one rep above last time, within the range.
    return Math.min(ex.max, Math.max(ex.min, fromLastTime + (ex.kind === 'hold' ? 5 : 1)));
  }
  return lastThisSession ? valueOf(item, lastThisSession) : item.prescription.target;
}

function valueOf(item: DraftExercise, set: DraftSet): number {
  return (exercise(item.exercise).kind === 'hold' ? set.seconds : set.reps) ?? 0;
}

export function setInput(draft: Draft, item: DraftExercise, set: DraftSet): SetInput {
  return {
    date: draft.date,
    workout: draft.workout,
    exercise: item.exercise,
    variant: item.variant,
    setNumber: set.setNumber,
    reps: set.reps,
    seconds: set.seconds,
    rir: set.rir,
    band: set.band,
    note: draft.deload ? 'deload' : ''
  };
}

/** Logs a set and returns the set that was added. */
export function logSet(draft: Draft, index: number, values: Omit<DraftSet, 'setNumber'>): DraftSet {
  const item = draft.exercises[index];
  if (!item) {
    throw new Error(`No exercise at ${index}`);
  }
  const set: DraftSet = { ...values, setNumber: item.logged.length + 1 };
  item.logged.push(set);
  return set;
}

export function clampBand(band: number): number {
  return Math.min(BAND_LEVELS, Math.max(1, Math.round(band)));
}

export function variantName(item: DraftExercise): string {
  return findVariant(exercise(item.exercise), item.variant).name;
}

export function isComplete(item: DraftExercise): boolean {
  return item.logged.length >= item.prescription.sets;
}

export function totalSets(draft: Draft): number {
  return draft.exercises.reduce((sum, item) => sum + item.logged.length, 0);
}
