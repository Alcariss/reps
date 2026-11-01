import { describe, expect, it } from 'vitest';
import {
  adjust,
  deloadStatus,
  evaluate,
  initialState,
  prescribe,
  replay,
  weeklySets,
  type LoggedSet
} from './engine';
import { EXERCISES } from './program';

const squat = EXERCISES.squat!;
const row = EXERCISES.row!;

function session(
  date: string,
  exercise: string,
  variant: string,
  values: number[],
  rir: number | null = 2,
  band: number | null = null
): LoggedSet[] {
  return values.map((reps, index) => ({
    date, exercise, variant, setNumber: index + 1, reps, seconds: null, rir, band
  }));
}

describe('evaluate', () => {
  it('progresses when every set hits the top of the range at ≤2 RIR', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15, 15], 2), 3)).toBe('progress');
  });

  it('calls it easy at ≥3 RIR on top reps', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15, 15], 3), 3)).toBe('easy');
  });

  it('holds while reps are inside the range', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 13, 12]), 3)).toBe('hold');
  });

  it('stalls on failure below the range', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [9, 8, 6], 0), 3)).toBe('stall');
  });

  it('ignores sessions with fewer sets than prescribed (deload, cut short)', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15]), 3)).toBe('incomplete');
  });
});

describe('replay', () => {
  it('starts every exercise at its first variant', () => {
    const states = replay([]);
    expect(states.squat).toMatchObject({ variant: 'goblet-squat', sets: 3, band: null, change: 'start' });
    expect(states.pushup).toMatchObject({ variant: 'band-pushup', band: 2 });
  });

  it('adds a set first, then moves to the next variant at max sets', () => {
    let sets = session('2026-01-01', 'squat', 'goblet-squat', [15, 15, 15]);
    let state = replay(sets).squat!;
    expect(state).toMatchObject({ sets: 4, change: 'set+', variant: 'goblet-squat' });

    sets = [...sets, ...session('2026-01-03', 'squat', 'goblet-squat', [15, 15, 15, 15])];
    state = replay(sets).squat!;
    expect(state).toMatchObject({ sets: 3, change: 'variant+', variant: 'goblet-squat-tempo', target: 8 });
  });

  it('double progression: aims one rep above the best set', () => {
    const state = replay(session('2026-01-01', 'squat', 'goblet-squat', [12, 11, 10])).squat!;
    expect(state).toMatchObject({ change: 'reps+', target: 13, sets: 3 });
  });

  it('easy band work goes straight to the next band level', () => {
    const state = replay(session('2026-01-01', 'row', 'band-row', [20, 20, 20], 4, 2)).row!;
    expect(state).toMatchObject({ band: 3, change: 'band+', sets: row.sets, target: row.min });
  });

  it('respects the weekly set cap before adding sets', () => {
    // Push-ups (A and B) + press already add up to 13.5 sets/week; one more push-up set would pass 15.
    expect(weeklySets('push', replay([]))).toBe(13.5);
    const state = replay(session('2026-01-01', 'pushup', 'band-pushup', [15, 15, 15], 2, 2)).pushup!;
    expect(state).toMatchObject({ change: 'band+', band: 3, sets: 3 });
  });

  it('moves to a new banded step a little lighter', () => {
    const state = replay(session('2026-01-01', 'row', 'band-row', [20, 20, 20], 4, 6)).row!;
    expect(state).toMatchObject({ variant: 'band-row-short', band: 4, change: 'variant+' });
  });

  it('repeats once after a stall, then steps back', () => {
    const sets = [
      ...session('2026-01-01', 'rdl', 'kb-rdl-tempo', [12, 12, 12]),
      ...session('2026-01-03', 'rdl', 'kb-rdl-tempo', [11, 11, 11]),
      ...session('2026-01-05', 'rdl', 'kb-rdl-tempo', [10, 10, 10])
    ];
    let state = replay(sets).rdl!;
    expect(state).toMatchObject({ lastOutcome: 'stall', change: 'repeat', variant: 'kb-rdl-tempo' });

    state = replay([...sets, ...session('2026-01-07', 'rdl', 'kb-rdl-tempo', [9, 9, 9])]).rdl!;
    expect(state).toMatchObject({ change: 'variant-', variant: 'kb-rdl' });
  });

  it('treats failing below the range as a stall', () => {
    const state = replay(session('2026-01-01', 'squat', 'goblet-squat', [10, 8, 6], 0)).squat!;
    expect(state).toMatchObject({ lastOutcome: 'stall', change: 'repeat', stallStrikes: 1 });
  });

  it('does not change anything after a deload session', () => {
    const before = session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12]);
    const deload = session('2026-01-08', 'squat', 'goblet-squat', [8, 8]);
    const state = replay([...before, ...deload]).squat!;
    expect(state).toMatchObject({ lastOutcome: 'incomplete', change: 'none', sets: 3, lastTotal: 36 });
  });

  it('forgets stall streaks after a deload', () => {
    const sets = [
      ...session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12]),
      ...session('2026-01-03', 'squat', 'goblet-squat', [11, 11, 11]),
      ...session('2026-01-20', 'squat', 'goblet-squat', [10, 10, 10])
    ];
    expect(replay(sets).squat!.lastOutcome).toBe('stall');
    expect(replay(sets, { resetAfter: '2026-01-10' }).squat!.lastOutcome).toBe('hold');
  });

  it('adopts the variant that was actually logged', () => {
    const state = replay(session('2026-01-01', 'pushup', 'pushup', [8, 8, 7])).pushup!;
    expect(state).toMatchObject({ variant: 'pushup', change: 'reps+' });
  });

  it('applies a manual override only when it is newer than the log', () => {
    const sets = session('2026-01-05', 'squat', 'goblet-squat', [12, 12, 12]);
    const newer = replay(sets, { overrides: { squat: { variant: 'goblet-squat-tempo', band: null, date: '2026-01-06' } } });
    expect(newer.squat).toMatchObject({ variant: 'goblet-squat-tempo', change: 'manual' });
    const older = replay(sets, { overrides: { squat: { variant: 'goblet-squat-tempo', band: null, date: '2026-01-04' } } });
    expect(older.squat).toMatchObject({ variant: 'goblet-squat', change: 'reps+' });
  });

  it('counts EMOM minutes as sets and adds a minute on success', () => {
    const swings = Array.from({ length: 6 }, (_, index) => ({
      date: '2026-01-01', exercise: 'swing', variant: 'two-arm-swing', setNumber: index + 1, reps: 15, seconds: null, rir: null, band: null
    }));
    expect(replay(swings).swing).toMatchObject({ sets: 7, change: 'set+' });
  });
});

describe('adjust', () => {
  it('moves the band before the variant', () => {
    expect(adjust('row', { variant: 'band-row', band: 3 }, 1)).toEqual({ variant: 'band-row', band: 4 });
    expect(adjust('row', { variant: 'band-row', band: 1 }, -1)).toEqual({ variant: 'band-row', band: 1 });
    expect(adjust('pushup', { variant: 'band-pushup', band: 1 }, -1)).toEqual({ variant: 'pushup', band: null });
    expect(adjust('pushup', { variant: 'pushup', band: null }, 1)).toEqual({ variant: 'band-pushup', band: 1 });
  });
});

describe('prescribe', () => {
  it('halves the sets and raises RIR in a deload', () => {
    const state = { ...initialState(squat), sets: 4 };
    expect(prescribe(squat, state, true)).toMatchObject({ sets: 2, rir: expect.stringContaining('3–4') });
    expect(prescribe(squat, state, false)).toMatchObject({ sets: 4 });
  });
});

describe('deloadStatus', () => {
  const fresh = replay([]);

  it('is due every 6 weeks', () => {
    expect(deloadStatus(fresh, '2026-01-01', '2026-02-05', null).due).toBe(false);
    expect(deloadStatus(fresh, '2026-01-01', '2026-02-12', null)).toMatchObject({ due: true, reason: 'scheduled', weeks: 6 });
  });

  it('counts from the end of the last deload', () => {
    expect(deloadStatus(fresh, '2026-01-01', '2026-03-01', '2026-02-12')).toMatchObject({ due: false, active: false });
  });

  it('is active during the deload week', () => {
    expect(deloadStatus(fresh, '2026-01-01', '2026-02-14', '2026-02-12')).toMatchObject({ active: true, due: false });
  });

  it('comes early when two exercises stall', () => {
    const states = replay([
      ...session('2026-01-01', 'squat', 'goblet-squat', [10, 8, 6], 0),
      ...session('2026-01-01', 'rdl', 'kb-rdl', [10, 8, 6], 0)
    ]);
    expect(deloadStatus(states, '2026-01-01', '2026-01-03', null)).toMatchObject({ due: true, reason: 'stalls' });
  });
});

describe('Quick sessions', () => {
  function quick(date: string, exercise: string, variant: string, values: number[], rir = 2, band: number | null = null): LoggedSet[] {
    return session(date, exercise, variant, values, rir, band).map((set) => ({ ...set, workout: 'Q' as const }));
  }

  it('shortens the circuit rest 90 → 75 → 60 → 45 before adding load', () => {
    let sets: LoggedSet[] = [];
    const rests: number[] = [];
    for (const date of ['2026-01-01', '2026-01-03', '2026-01-05']) {
      sets = [...sets, ...quick(date, 'squat', 'goblet-squat', [15, 15, 15])];
      const state = replay(sets).squat!;
      rests.push(state.quickRest);
      expect(state).toMatchObject({ change: 'rest-', variant: 'goblet-squat', sets: 3 });
    }
    expect(rests).toEqual([75, 60, 45]);

    sets = [...sets, ...quick('2026-01-07', 'squat', 'goblet-squat', [15, 15, 15])];
    expect(replay(sets).squat).toMatchObject({ change: 'variant+', variant: 'goblet-squat-tempo', quickRest: 90 });
  });

  it('moves a band up at 45 s rest and starts the rest again', () => {
    const sets = ['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']
      .flatMap((date) => quick(date, 'one-arm-row', 'one-arm-band-row', [20, 20, 20], 2, 2));
    expect(replay(sets)['one-arm-row']).toMatchObject({ band: 3, change: 'band+', quickRest: 90 });
  });

  it('never adds A/B sets and is shared with A/B history', () => {
    const sets = [
      ...session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12]),
      ...quick('2026-01-02', 'squat', 'goblet-squat', [15, 15, 15])
    ];
    const state = replay(sets).squat!;
    expect(state).toMatchObject({ sets: 3, quickRest: 75 });
    expect(state.history.map((summary) => summary.workout)).toEqual(['A', 'Q']);
  });

  it('keeps A and Q on the same day as separate sessions', () => {
    const sets = [
      ...session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12]),
      ...quick('2026-01-01', 'squat', 'goblet-squat', [10, 10, 10])
    ];
    expect(replay(sets).squat!.history).toHaveLength(2);
  });

  it('logs the finisher for history only', () => {
    const before = replay(session('2026-01-01', 'plank', 'plank', [45, 45], null).map((set) => ({ ...set, reps: null, seconds: 45 })));
    const after = replay([
      ...session('2026-01-01', 'plank', 'plank', [45, 45], null).map((set) => ({ ...set, reps: null, seconds: 45 })),
      ...quick('2026-01-03', 'plank', 'plank', [0, 0, 0]).map((set) => ({ ...set, reps: null, seconds: 45 }))
    ]);
    expect(after.plank).toMatchObject({ change: before.plank!.change, variant: before.plank!.variant });
    expect(after.plank!.history).toHaveLength(2);
  });

  it('a lighter A/B step resets the Quick rest', () => {
    const sets = [
      ...quick('2026-01-01', 'rdl', 'kb-rdl-tempo', [15, 15, 15]),
      ...session('2026-01-03', 'rdl', 'kb-rdl-tempo', [9, 8, 6], 0),
      ...session('2026-01-05', 'rdl', 'kb-rdl-tempo', [9, 8, 6], 0)
    ];
    expect(replay(sets).rdl).toMatchObject({ variant: 'kb-rdl', quickRest: 90 });
  });
});
