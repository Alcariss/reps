import { describe, expect, it } from 'vitest';
import { replay, type LoggedSet } from './engine';
import { WORKOUTS } from './program';
import { createDraft, logSet, previousValues, setInput, suggestedValue } from './session';

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
