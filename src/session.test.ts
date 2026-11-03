import { describe, expect, it } from 'vitest';
import { replay, type LoggedSet } from './engine';
import {
  activeIndex,
  circuitAdvance,
  circuitBack,
  createDraft,
  finisherDone,
  finisherRound,
  isDraft,
  logSet,
  previousValues,
  setInput,
  suggestedValue
} from './session';

const history: LoggedSet[] = [12, 11, 10].map((reps, index) => ({
  date: '2026-11-02', workout: 'A', exercise: 'squat', variant: 'goblet-squat', setNumber: index + 1, reps, seconds: null, rir: 2, band: null
}));

function draftFor(sessionCount = 0, deload = false, sets: readonly LoggedSet[] = []) {
  return createDraft({ date: '2026-11-04', deload, states: replay(sets), sets, now: 0, sessionCount });
}

describe('draft', () => {
  it('builds a 4-exercise circuit plus the finisher', () => {
    const draft = draftFor();
    expect(draft.exercises.map((item) => item.exercise)).toEqual(['squat', 'rdl', 'pushup', 'one-arm-row', 'swing', 'plank']);
    expect(draft.circuit).toMatchObject({ size: 4, rounds: 3, round: 1 });
    expect(draft.exercises[0]).toMatchObject({ prescription: { rounds: 3, rest: 90 } });
    expect(draft.warmup).toHaveLength(3);
    expect(draft.step).toBe(-1);
  });

  it('swaps the push-up for the pike push-up every second session', () => {
    expect(draftFor(1).exercises[2]).toMatchObject({ exercise: 'pike-pushup', variant: 'incline-pike-pushup' });
    expect(draftFor(2).exercises[2]?.exercise).toBe('pushup');
  });

  it('starts the row at the door-anchored step', () => {
    expect(draftFor().exercises[3]).toMatchObject({ exercise: 'one-arm-row', variant: 'door-band-row', band: 2 });
  });

  it('runs 2 rounds at 90 s rest in a deload', () => {
    const draft = draftFor(0, true);
    expect(draft.circuit.rounds).toBe(2);
    expect(draft.exercises[0]?.prescription.rest).toBe(90);
  });

  it('prefills one rep above last time, round by round, including old A/B sessions', () => {
    const draft = draftFor(0, false, history);
    const squat = draft.exercises[0]!;
    expect(squat).toMatchObject({ previous: [12, 11, 10], change: 'reps+' });
    expect(suggestedValue(squat)).toBe(13);
    logSet(draft, 0, { reps: 13, seconds: null, rir: 2, band: null });
    expect(suggestedValue(squat)).toBe(12);
  });

  it('runs round by round, then the finisher', () => {
    const draft = draftFor();
    const positions: string[] = [];
    circuitAdvance(draft);
    while (draft.step < draft.circuit.size) {
      positions.push(`${draft.circuit.round}:${draft.step}`);
      circuitAdvance(draft);
    }
    expect(positions).toEqual(['1:0', '1:1', '1:2', '1:3', '2:0', '2:1', '2:2', '2:3', '3:0', '3:1', '3:2', '3:3']);
    expect(draft.step).toBe(4);
    circuitBack(draft);
    expect([draft.circuit.round, draft.step]).toEqual([3, 3]);
  });

  it('alternates swings and plank in the finisher', () => {
    const draft = draftFor();
    draft.step = draft.circuit.size;
    expect(activeIndex(draft)).toBe(4);
    logSet(draft, 4, { reps: 15, seconds: null, rir: null, band: null });
    expect([activeIndex(draft), finisherRound(draft)]).toEqual([5, 1]);
    logSet(draft, 5, { reps: null, seconds: 35, rir: null, band: null });
    expect([activeIndex(draft), finisherRound(draft)]).toEqual([4, 2]);
    for (let round = 2; round <= 3; round += 1) {
      logSet(draft, 4, { reps: 15, seconds: null, rir: null, band: null });
      logSet(draft, 5, { reps: null, seconds: 40, rir: null, band: null });
    }
    expect(finisherDone(draft)).toBe(true);
  });

  it('logs sets with workout Q', () => {
    const draft = draftFor();
    const set = logSet(draft, 3, { reps: 15, seconds: null, rir: 1, band: 3 });
    expect(setInput(draft, draft.exercises[3]!, set)).toEqual({
      date: '2026-11-04', workout: 'Q', exercise: 'one-arm-row', variant: 'door-band-row', setNumber: 1,
      reps: 15, seconds: null, rir: 1, band: 3, note: ''
    });
  });

  it('drops drafts saved by older versions (e.g. an A/B workout in progress)', () => {
    expect(isDraft(draftFor())).toBe(true);
    expect(isDraft({ version: 1, exercises: [], workout: 'A' })).toBe(false);
  });

  it('only looks at sessions before the workout day', () => {
    expect(previousValues(history, 'squat', '2026-11-02')).toEqual([]);
    expect(previousValues(history, 'squat', '2026-11-03')).toEqual([12, 11, 10]);
  });
});
