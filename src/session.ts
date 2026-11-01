import { prescribe, prescribeQuick, type Change, type ExerciseState, type LoggedSet, type Prescription } from './engine';
import type { SetInput } from './model';
import {
  BAND_LEVELS,
  QUICK_FINISHER,
  QUICK_WARMUP,
  WARMUP,
  WORKOUTS,
  exercise,
  findVariant,
  quickCircuit,
  type WorkoutId
} from './program';

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
  /** Rest after a set; the Quick circuit's comes from the engine. */
  rest?: number;
  logged: DraftSet[];
};

/**
 * Quick circuit position. Exercises 0…size-1 are the circuit, done round by
 * round; the rest of `exercises` is the finisher. `step === size` is the
 * finisher, which alternates swings and plank for its rounds.
 */
export type Circuit = {
  size: number;
  rounds: number;
  round: number;
  finisherRounds: number;
  finisherStartedAt: number | null;
};

export type Draft = {
  version: 1;
  date: string;
  workout: WorkoutId;
  deload: boolean;
  startedAt: number;
  /** -1 = warm-up, 0…n-1 = exercise, n = finished. */
  step: number;
  circuit?: Circuit;
  warmup: boolean[];
  exercises: DraftExercise[];
  restEndsAt: number | null;
  restTotal: number;
};

/**
 * Values (reps or seconds) of the most recent session of an exercise, by set.
 * Prefers sessions of the same kind (Quick vs A/B) when there are any.
 */
export function previousValues(sets: readonly LoggedSet[], exerciseId: string, before: string, quick = false): number[] {
  const all = sets.filter((set) => set.exercise === exerciseId && set.date < before);
  const sameKind = all.filter((set) => (set.workout === 'Q') === quick);
  const own = sameKind.length > 0 ? sameKind : all;
  const lastDate = own.reduce<string | null>((latest, set) => (latest === null || set.date > latest ? set.date : latest), null);
  if (lastDate === null) {
    return [];
  }
  const kind = exercise(exerciseId).kind;
  const lastWorkout = own.filter((set) => set.date === lastDate).at(-1)?.workout;
  return own
    .filter((set) => set.date === lastDate && set.workout === lastWorkout)
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
  /** Quick sessions before this one; picks the push-up or press slot. */
  quickCount?: number;
}): Draft {
  if (options.workout === 'Q') {
    return createQuickDraft({ ...options, quickCount: options.quickCount ?? 0 });
  }
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

function createQuickDraft(options: {
  date: string;
  deload: boolean;
  states: Record<string, ExerciseState>;
  sets: readonly LoggedSet[];
  now: number;
  quickCount: number;
}): Draft {
  const stateOf = (exerciseId: string): ExerciseState => {
    const state = options.states[exerciseId];
    if (!state) {
      throw new Error(`No state for ${exerciseId}`);
    }
    return state;
  };
  const circuit = quickCircuit(options.quickCount).map((exerciseId): DraftExercise => {
    const ex = exercise(exerciseId);
    const state = stateOf(exerciseId);
    const { rest, ...prescription } = prescribeQuick(ex, state, options.deload);
    return {
      exercise: exerciseId,
      variant: state.variant,
      band: state.band,
      prescription,
      // A/B adds sets; the circuit has fixed rounds, so do not announce it here.
      change: state.change === 'set+' ? 'none' : state.change,
      previous: previousValues(options.sets, exerciseId, options.date, true),
      rest,
      logged: []
    };
  });
  const finisher = [QUICK_FINISHER.swing, QUICK_FINISHER.plank].map((exerciseId): DraftExercise => {
    const ex = exercise(exerciseId);
    const state = stateOf(exerciseId);
    const isPlank = exerciseId === QUICK_FINISHER.plank;
    return {
      exercise: exerciseId,
      variant: state.variant,
      band: null,
      prescription: {
        sets: QUICK_FINISHER.rounds,
        min: isPlank ? QUICK_FINISHER.plankMin : QUICK_FINISHER.swings,
        max: isPlank ? QUICK_FINISHER.plankMax : QUICK_FINISHER.swings,
        target: isPlank ? QUICK_FINISHER.plankMin : QUICK_FINISHER.swings,
        rir: 'continuous, no rest'
      },
      change: 'none',
      previous: previousValues(options.sets, exerciseId, options.date, true),
      rest: 0,
      logged: []
    };
  });
  return {
    version: 1,
    date: options.date,
    workout: 'Q',
    deload: options.deload,
    startedAt: options.now,
    step: -1,
    circuit: {
      size: circuit.length,
      rounds: circuit[0]?.prescription.sets ?? 3,
      round: 1,
      finisherRounds: QUICK_FINISHER.rounds,
      finisherStartedAt: null
    },
    warmup: QUICK_WARMUP.map(() => false),
    exercises: [...circuit, ...finisher],
    restEndsAt: null,
    restTotal: 0
  };
}

/** Index in `exercises` of the exercise being worked on, or -1 (warm-up, done). */
export function activeIndex(draft: Draft): number {
  const circuit = draft.circuit;
  if (!circuit || draft.step < circuit.size) {
    return draft.step >= 0 && draft.step < draft.exercises.length ? draft.step : -1;
  }
  if (draft.step > circuit.size) {
    return -1;
  }
  const swings = draft.exercises[circuit.size]?.logged.length ?? 0;
  const planks = draft.exercises[circuit.size + 1]?.logged.length ?? 0;
  return swings > planks ? circuit.size + 1 : circuit.size;
}

/** Finisher round in progress, 1-based. */
export function finisherRound(draft: Draft): number {
  const circuit = draft.circuit;
  const planks = circuit ? draft.exercises[circuit.size + 1]?.logged.length ?? 0 : 0;
  return planks + 1;
}

export function finisherDone(draft: Draft): boolean {
  const circuit = draft.circuit;
  return circuit !== undefined && finisherRound(draft) > circuit.finisherRounds;
}

/** Next position in the circuit: next exercise, next round, then the finisher. */
export function circuitAdvance(draft: Draft): void {
  const circuit = draft.circuit;
  if (!circuit) {
    draft.step += 1;
    return;
  }
  if (draft.step < 0) {
    draft.step = 0;
    circuit.round = 1;
  } else if (draft.step < circuit.size - 1) {
    draft.step += 1;
  } else if (draft.step === circuit.size - 1 && circuit.round < circuit.rounds) {
    circuit.round += 1;
    draft.step = 0;
  } else if (draft.step < circuit.size) {
    draft.step = circuit.size;
  }
}

export function circuitBack(draft: Draft): void {
  const circuit = draft.circuit;
  if (!circuit) {
    draft.step = Math.max(-1, draft.step - 1);
    return;
  }
  if (draft.step >= circuit.size) {
    draft.step = circuit.size - 1;
    circuit.round = circuit.rounds;
  } else if (draft.step > 0) {
    draft.step -= 1;
  } else if (circuit.round > 1) {
    circuit.round -= 1;
    draft.step = circuit.size - 1;
  } else {
    draft.step = -1;
  }
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
  if (item.change === 'rest-' && fromLastTime !== undefined) {
    // Same reps as last time, now with less rest.
    return Math.min(ex.max, Math.max(ex.min, fromLastTime));
  }
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
