import { describe, expect, it } from 'vitest';
import {
  adjust,
  deloadStatus,
  evaluate,
  initialState,
  prescribe,
  replay,
  type LoggedSet
} from './engine';
import { EXERCISES, type WorkoutId } from './program';

const squat = EXERCISES.squat!;
const row = EXERCISES['one-arm-row']!;

function session(
  date: string,
  exercise: string,
  variant: string,
  values: number[],
  rir: number | null = 2,
  band: number | null = null,
  workout: WorkoutId = 'Q'
): LoggedSet[] {
  return values.map((reps, index) => ({
    date, workout, exercise, variant, setNumber: index + 1, reps, seconds: null, rir, band
  }));
}

/** Top of the range in every round, four sessions in a row: 90 → 75 → 60 → 45 s, then load. */
function topSessions(exercise: string, variant: string, top: number, band: number | null = null, count = 4): LoggedSet[] {
  return Array.from({ length: count }, (_, index) => session(`2026-01-${String(1 + index * 2).padStart(2, '0')}`, exercise, variant, [top, top, top], 2, band)).flat();
}

describe('evaluate', () => {
  it('progresses when every round hits the top of the range at ≤2 RIR', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15, 15], 2))).toBe('progress');
  });

  it('calls it easy at ≥3 RIR on top reps', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15, 15], 3))).toBe('easy');
  });

  it('holds while reps are inside the range', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 13, 12]))).toBe('hold');
  });

  it('stalls on failure below the range', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [9, 8, 6], 0))).toBe('stall');
  });

  it('ignores sessions with fewer than 3 rounds (deload, cut short)', () => {
    expect(evaluate(squat, session('2026-01-01', 'squat', 'goblet-squat', [15, 15]))).toBe('incomplete');
  });
});

describe('replay', () => {
  it('starts every exercise at its first variant with 90 s rest', () => {
    const states = replay([]);
    expect(states.squat).toMatchObject({ variant: 'goblet-squat', band: null, rest: 90, change: 'start' });
    expect(states['one-arm-row']).toMatchObject({ variant: 'door-band-row', band: 2 });
    expect(states['pike-pushup']).toMatchObject({ variant: 'incline-pike-pushup', band: null });
    expect(states['pull-apart']).toBeUndefined();
  });

  it('double progression: aims one rep above the best round', () => {
    expect(replay(session('2026-01-01', 'squat', 'goblet-squat', [12, 11, 10])).squat).toMatchObject({ change: 'reps+', target: 13 });
  });

  it('shortens the rest 90 → 75 → 60 → 45 before adding load', () => {
    const sets = topSessions('squat', 'goblet-squat', 15, null, 3);
    expect(replay(sets).squat).toMatchObject({ rest: 45, change: 'rest-', variant: 'goblet-squat' });
    const more = topSessions('squat', 'goblet-squat', 15, null, 4);
    expect(replay(more).squat).toMatchObject({ rest: 90, change: 'variant+', variant: 'goblet-squat-tempo', target: 8 });
  });

  it('moves a band up at 45 s rest', () => {
    expect(replay(topSessions('one-arm-row', 'door-band-row', 20, 2))['one-arm-row']).toMatchObject({ band: 3, change: 'band+', rest: 90 });
  });

  it('easy work skips the rest steps and adds load', () => {
    const state = replay(session('2026-01-01', 'one-arm-row', 'door-band-row', [20, 20, 20], 4, 2))['one-arm-row']!;
    expect(state).toMatchObject({ band: 3, change: 'band+', target: row.min });
  });

  it('moves to a new banded step a little lighter', () => {
    const state = replay(session('2026-01-01', 'one-arm-row', 'door-band-row', [20, 20, 20], 4, 6))['one-arm-row']!;
    expect(state).toMatchObject({ variant: 'door-one-arm-row', band: 4, change: 'variant+' });
  });

  it('repeats once after a stall, then steps back', () => {
    const sets = [
      ...session('2026-01-01', 'rdl', 'kb-rdl-tempo', [12, 12, 12]),
      ...session('2026-01-03', 'rdl', 'kb-rdl-tempo', [11, 11, 11]),
      ...session('2026-01-05', 'rdl', 'kb-rdl-tempo', [10, 10, 10])
    ];
    expect(replay(sets).rdl).toMatchObject({ lastOutcome: 'stall', change: 'repeat', variant: 'kb-rdl-tempo' });
    expect(replay([...sets, ...session('2026-01-07', 'rdl', 'kb-rdl-tempo', [9, 9, 9])]).rdl).toMatchObject({ change: 'variant-', variant: 'kb-rdl' });
  });

  it('does not change anything after a short (deload) session', () => {
    const sets = [...session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12]), ...session('2026-01-08', 'squat', 'goblet-squat', [8, 8])];
    expect(replay(sets).squat).toMatchObject({ lastOutcome: 'incomplete', change: 'none', lastTotal: 36 });
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

  it('keeps old A/B sets for shared exercises and skips retired ones', () => {
    const sets = [
      ...session('2026-01-01', 'squat', 'goblet-squat', [12, 12, 12, 12], 2, null, 'A'),
      ...session('2026-01-01', 'press', 'half-kneeling-press', [8, 8, 8], 2, null, 'B'),
      ...session('2026-01-03', 'squat', 'goblet-squat', [13, 13, 13])
    ];
    const states = replay(sets);
    expect(states.squat!.history.map((summary) => summary.workout)).toEqual(['A', 'Q']);
    expect(states.press).toBeUndefined();
  });

  it('keeps an old bent-over row variant that was logged before the door-anchored steps', () => {
    expect(replay(session('2026-01-01', 'one-arm-row', 'one-arm-band-row', [12, 12, 12], 2, 3))['one-arm-row']).toMatchObject({ variant: 'one-arm-band-row', band: 3 });
  });

  it('logs the finisher for history only', () => {
    const swings = session('2026-01-01', 'swing', 'two-arm-swing', [15, 15, 15]);
    const state = replay(swings).swing!;
    expect(state).toMatchObject({ change: 'start', lastOutcome: null });
    expect(state.history).toHaveLength(1);
  });

  it('applies a manual override only when it is newer than the log', () => {
    const sets = session('2026-01-05', 'squat', 'goblet-squat', [12, 12, 12]);
    expect(replay(sets, { overrides: { squat: { variant: 'goblet-squat-tempo', band: null, date: '2026-01-06' } } }).squat).toMatchObject({ variant: 'goblet-squat-tempo', change: 'manual' });
    expect(replay(sets, { overrides: { squat: { variant: 'goblet-squat-tempo', band: null, date: '2026-01-04' } } }).squat).toMatchObject({ variant: 'goblet-squat', change: 'reps+' });
  });
});

describe('adjust', () => {
  it('moves the band before the variant, and stops at the easiest step', () => {
    expect(adjust('one-arm-row', { variant: 'door-band-row', band: 3 }, 1)).toEqual({ variant: 'door-band-row', band: 4 });
    expect(adjust('one-arm-row', { variant: 'door-band-row', band: 1 }, -1)).toEqual({ variant: 'door-band-row', band: 1 });
    expect(adjust('pushup', { variant: 'band-pushup', band: 1 }, -1)).toEqual({ variant: 'pushup', band: null });
    expect(adjust('pike-pushup', { variant: 'incline-pike-pushup', band: null }, -1)).toEqual({ variant: 'incline-pike-pushup', band: null });
  });
});

describe('prescribe', () => {
  it('runs 3 rounds at the engine rest, or 2 easy rounds at 90 s in a deload', () => {
    const state = { ...initialState(squat), rest: 60, target: 12 };
    expect(prescribe(squat, state, false)).toMatchObject({ rounds: 3, rest: 60, target: 12 });
    expect(prescribe(squat, state, true)).toMatchObject({ rounds: 2, rest: 90, rir: expect.stringContaining('3–4') });
  });
});

describe('deloadStatus', () => {
  const fresh = replay([]);

  it('is due every 6 weeks', () => {
    expect(deloadStatus(fresh, '2026-01-01', '2026-02-05', null).due).toBe(false);
    expect(deloadStatus(fresh, '2026-01-01', '2026-02-12', null)).toMatchObject({ due: true, reason: 'scheduled', weeks: 6 });
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
