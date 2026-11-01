import { describe, expect, it } from 'vitest';
import { replay, type LoggedSet } from './engine';
import { WORKOUTS } from './program';
import {
  activeIndex,
  circuitAdvance,
  circuitBack,
  createDraft,
  finisherDone,
  finisherRound,
  logSet,
  previousValues,
  setInput,
  suggestedValue
} from './session';

const history: LoggedSet[] = [12, 11, 10].map((reps, index) => ({
  date: '2026-11-02', exercise: 'squat', variant: 'goblet-squat', setNumber: index + 1, reps, seconds: null, rir: 2, band: null
}));

describe('draft', () => {
  it('builds the workout from the engine state', () => {
    const draft = createDraft({ workout: 'A', date: '2026-11-04', deload: false, states: replay(history), sets: history, now: 0 });
    expect(draft.exercises.map((item) => item.exercise)).toEqual(WORKOUTS.A);
    expect(draft.step).toBe(-1);
    expect(draft.exercises[0]).toMatchObject({ variant: 'goblet-squat', previous: [12, 11, 10], change: 'reps+' });
  });

  it('halves the sets in a deload', () => {
    const draft = createDraft({ workout: 'B', date: '2026-11-04', deload: true, states: replay([]), sets: [], now: 0 });
    expect(draft.exercises[0]?.prescription.sets).toBe(2);
  });

  it('prefills one rep above last time, set by set', () => {
    const draft = createDraft({ workout: 'A', date: '2026-11-04', deload: false, states: replay(history), sets: history, now: 0 });
    const squat = draft.exercises[0]!;
    expect(suggestedValue(squat)).toBe(13);
    logSet(draft, 0, { reps: 13, seconds: null, rir: 2, band: null });
    expect(suggestedValue(squat)).toBe(12);
  });

  it('turns a logged set into a row for the server', () => {
    const draft = createDraft({ workout: 'A', date: '2026-11-04', deload: false, states: replay([]), sets: [], now: 0 });
    const set = logSet(draft, 2, { reps: 15, seconds: null, rir: 1, band: 3 });
    expect(setInput(draft, draft.exercises[2]!, set)).toEqual({
      date: '2026-11-04', workout: 'A', exercise: 'row', variant: 'band-row', setNumber: 1,
      reps: 15, seconds: null, rir: 1, band: 3, note: ''
    });
  });

  it('only looks at sessions before the workout day', () => {
    expect(previousValues(history, 'squat', '2026-11-02')).toEqual([]);
    expect(previousValues(history, 'squat', '2026-11-03')).toEqual([12, 11, 10]);
  });
});

describe('Quick draft', () => {
  function quickDraft(quickCount = 0, deload = false) {
    return createDraft({ workout: 'Q', date: '2026-11-04', deload, states: replay([]), sets: [], now: 0, quickCount });
  }

  it('builds a 4-exercise circuit plus the finisher', () => {
    const draft = quickDraft();
    expect(draft.exercises.map((item) => item.exercise)).toEqual(['squat', 'rdl', 'pushup', 'one-arm-row', 'swing', 'plank']);
    expect(draft.circuit).toMatchObject({ size: 4, rounds: 3, round: 1 });
    expect(draft.exercises[0]).toMatchObject({ rest: 90, prescription: { sets: 3 } });
    expect(draft.warmup).toHaveLength(3);
  });

  it('swaps the push-up for a press every second Quick session', () => {
    expect(quickDraft(1).exercises[2]?.exercise).toBe('floor-press');
    expect(quickDraft(2).exercises[2]?.exercise).toBe('pushup');
    expect(quickDraft(3).exercises[2]?.exercise).toBe('band-press');
  });

  it('runs round by round, then the finisher', () => {
    const draft = quickDraft();
    const positions: string[] = [];
    circuitAdvance(draft);
    while (draft.step < draft.circuit!.size) {
      positions.push(`${draft.circuit!.round}:${draft.step}`);
      circuitAdvance(draft);
    }
    expect(positions).toEqual(['1:0', '1:1', '1:2', '1:3', '2:0', '2:1', '2:2', '2:3', '3:0', '3:1', '3:2', '3:3']);
    expect(draft.step).toBe(4);
    circuitBack(draft);
    expect([draft.circuit!.round, draft.step]).toEqual([3, 3]);
  });

  it('alternates swings and plank in the finisher', () => {
    const draft = quickDraft();
    draft.step = draft.circuit!.size;
    expect(activeIndex(draft)).toBe(4);
    logSet(draft, 4, { reps: 15, seconds: null, rir: null, band: null });
    expect(activeIndex(draft)).toBe(5);
    expect(finisherRound(draft)).toBe(1);
    logSet(draft, 5, { reps: null, seconds: 35, rir: null, band: null });
    expect([activeIndex(draft), finisherRound(draft)]).toEqual([4, 2]);
    for (let round = 2; round <= 3; round += 1) {
      logSet(draft, 4, { reps: 15, seconds: null, rir: null, band: null });
      logSet(draft, 5, { reps: null, seconds: 40, rir: null, band: null });
    }
    expect(finisherDone(draft)).toBe(true);
  });

  it('logs Quick sets with workout Q', () => {
    const draft = quickDraft();
    const set = logSet(draft, 0, { reps: 12, seconds: null, rir: 2, band: null });
    expect(setInput(draft, draft.exercises[0]!, set)).toMatchObject({ workout: 'Q', exercise: 'squat', setNumber: 1 });
  });

  it('runs 2 rounds at 90 s rest in a deload', () => {
    const draft = quickDraft(0, true);
    expect(draft.circuit?.rounds).toBe(2);
    expect(draft.exercises[0]?.rest).toBe(90);
  });

  it('prefers last Quick session values for the prefill', () => {
    const sets: LoggedSet[] = [
      ...history,
      ...[14, 14, 14].map((reps, index) => ({
        date: '2026-11-01', workout: 'Q' as const, exercise: 'squat', variant: 'goblet-squat', setNumber: index + 1, reps, seconds: null, rir: 2, band: null
      }))
    ];
    expect(previousValues(sets, 'squat', '2026-11-04', true)).toEqual([14, 14, 14]);
    expect(previousValues(sets.map((set) => ({ ...set, workout: set.workout ?? 'A' })), 'squat', '2026-11-04', false)).toEqual([12, 11, 10]);
  });
});
