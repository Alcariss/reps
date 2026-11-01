import { describe, expect, it } from 'vitest';
import type { BodyRecord } from './model';
import {
  averageWeight,
  nextWorkout,
  proteinTarget,
  quickSessionCount,
  rollingAverage,
  sessionsThisWeek,
  trainingDays,
  weeklyRatePct,
  weightTrend
} from './stats';
import { addDays } from './dates';

function weighIns(from: string, values: number[]): BodyRecord[] {
  return values.map((weight, index) => ({
    id: String(index), date: addDays(from, index), weight, waist: null, steps: null, protein: null, note: ''
  }));
}

describe('training days', () => {
  const sets = [
    { date: '2026-11-02', workout: 'A' as const },
    { date: '2026-11-02', workout: 'A' as const },
    { date: '2026-11-04', workout: 'B' as const }
  ];

  it('collapses sets into one entry per day', () => {
    expect(trainingDays(sets)).toEqual([{ date: '2026-11-02', workout: 'A' }, { date: '2026-11-04', workout: 'B' }]);
  });

  it('suggests the other workout and a rest day after training yesterday', () => {
    const days = trainingDays(sets);
    expect(nextWorkout(days, '2026-11-05')).toEqual({ workout: 'A', daysSince: 1, restSuggested: true, trainedToday: false });
    expect(nextWorkout(days, '2026-11-06')).toMatchObject({ workout: 'A', daysSince: 2, restSuggested: false });
    expect(nextWorkout([], '2026-11-06')).toMatchObject({ workout: 'A', daysSince: null });
  });

  it('keeps A/B alternating around Quick sessions', () => {
    const days = trainingDays([...sets, { date: '2026-11-06', workout: 'Q' }]);
    expect(nextWorkout(days, '2026-11-07')).toMatchObject({ workout: 'A', daysSince: 1 });
    expect(quickSessionCount(days, '2026-11-06')).toBe(1);
    expect(quickSessionCount(days, '2026-11-05')).toBe(0);
  });

  it('keeps two workouts on one day as two sessions but one training day', () => {
    const days = trainingDays([...sets, { date: '2026-11-04', workout: 'Q' }]);
    expect(days).toHaveLength(3);
    expect(sessionsThisWeek(days, '2026-11-08')).toBe(2);
  });

  it('counts sessions from Monday', () => {
    expect(sessionsThisWeek(trainingDays(sets), '2026-11-08')).toBe(2);
    expect(sessionsThisWeek(trainingDays(sets), '2026-11-09')).toBe(0);
  });
});

describe('weight', () => {
  it('averages the last 7 days', () => {
    const points = [
      { date: '2026-11-01', value: 100 },
      { date: '2026-11-07', value: 98 },
      { date: '2026-11-08', value: 96 }
    ];
    expect(rollingAverage(points, '2026-11-07')).toBe(99);
    expect(rollingAverage(points, '2026-11-08')).toBe(97);
    expect(rollingAverage(points, '2026-10-01')).toBeNull();
  });

  it('computes the weekly rate of change in %', () => {
    const body = weighIns('2026-11-01', [100, 100, 100, 100, 100, 100, 100, 99, 99, 99, 99, 99, 99, 99]);
    expect(averageWeight(body, '2026-11-14')).toBe(99);
    expect(weeklyRatePct(body, '2026-11-14')).toBeCloseTo(-1, 5);
    expect(weightTrend(body, '2026-11-14')).toMatchObject({ onTarget: true, tooFast: false, plateau: false });
  });

  it('flags a plateau after 3 weeks below 0.25 %/week', () => {
    const body = weighIns('2026-10-01', Array.from({ length: 35 }, () => 90));
    expect(weightTrend(body, '2026-11-04').plateau).toBe(true);
  });

  it('does not flag a plateau without enough data', () => {
    const body = weighIns('2026-10-25', Array.from({ length: 10 }, () => 90));
    expect(weightTrend(body, '2026-11-03').plateau).toBe(false);
  });

  it('flags losing faster than 1 %/week', () => {
    const body = weighIns('2026-11-01', [100, 100, 100, 100, 100, 100, 100, 98, 98, 98, 98, 98, 98, 98]);
    expect(weightTrend(body, '2026-11-14').tooFast).toBe(true);
  });

  it('sets protein at 1.6–2.2 g/kg', () => {
    expect(proteinTarget(90)).toEqual({ min: 144, max: 198 });
    expect(proteinTarget(null)).toBeNull();
  });
});
