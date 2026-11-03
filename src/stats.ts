import { addDays, daysBetween, startOfWeek } from './dates';
import type { BodyRecord } from './model';
import type { WorkoutId } from './program';

export type SessionInfo = { date: string; workout: WorkoutId };

/** One entry per session (day and workout), oldest first. */
export function trainingDays(sets: readonly SessionInfo[]): SessionInfo[] {
  const sessions = new Map<string, SessionInfo>();
  for (const set of sets) {
    sessions.set(`${set.date}|${set.workout}`, { date: set.date, workout: set.workout });
  }
  return [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date) || a.workout.localeCompare(b.workout));
}

/** Quick sessions logged up to and including `date`; sets the push-up / press rotation. */
export function quickSessionCount(days: readonly SessionInfo[], date: string): number {
  return days.filter((day) => day.workout === 'Q' && day.date <= date).length;
}

export type LastSession = {
  daysSince: number | null;
  /** Trained yesterday or today: 3×/week works best on non-consecutive days. */
  restSuggested: boolean;
  trainedToday: boolean;
};

export function lastSession(days: readonly SessionInfo[], today: string): LastSession {
  const last = days.at(-1);
  if (!last) {
    return { daysSince: null, restSuggested: false, trainedToday: false };
  }
  const daysSince = daysBetween(last.date, today);
  return { daysSince, restSuggested: daysSince <= 1, trainedToday: daysSince === 0 };
}

/** Sessions this week; a day counts once even with two workouts. */
export function sessionsThisWeek(days: readonly SessionInfo[], today: string): number {
  const monday = startOfWeek(today);
  return new Set(days.filter((day) => day.date >= monday && day.date <= today).map((day) => day.date)).size;
}

type Point = { date: string; value: number };

function weights(body: readonly BodyRecord[]): Point[] {
  return body
    .filter((entry): entry is BodyRecord & { weight: number } => entry.weight !== null && entry.weight > 0)
    .map((entry) => ({ date: entry.date, value: entry.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Mean of the values in the 7 days ending on `date`, or null without data. */
export function rollingAverage(points: readonly Point[], date: string, days = 7): number | null {
  const from = addDays(date, -(days - 1));
  const window = points.filter((point) => point.date >= from && point.date <= date);
  if (window.length === 0) {
    return null;
  }
  return window.reduce((sum, point) => sum + point.value, 0) / window.length;
}

export function averageWeight(body: readonly BodyRecord[], date: string): number | null {
  return rollingAverage(weights(body), date);
}

/** % change of the 7-day average weight over the last week; negative = losing. */
export function weeklyRatePct(body: readonly BodyRecord[], date: string): number | null {
  const points = weights(body);
  const now = rollingAverage(points, date);
  const before = rollingAverage(points, addDays(date, -7));
  if (now === null || before === null || before === 0) {
    return null;
  }
  return ((now - before) / before) * 100;
}

export function latestWeight(body: readonly BodyRecord[]): number | null {
  return weights(body).at(-1)?.value ?? null;
}

/** 1.6–2.2 g of protein per kg of bodyweight (Morton 2018). */
export function proteinTarget(weightKg: number | null): { min: number; max: number } | null {
  if (weightKg === null || weightKg <= 0) {
    return null;
  }
  return { min: Math.round(weightKg * 1.6), max: Math.round(weightKg * 2.2) };
}

export type WeightTrend = {
  average: number | null;
  ratePct: number | null;
  /** Losing less than 0.25 %/week for three weeks in a row. */
  plateau: boolean;
  /** Losing faster than 1 %/week risks muscle. */
  tooFast: boolean;
  /** Within the 0.5–1 %/week target. */
  onTarget: boolean;
};

export const PLATEAU_RATE_PCT = -0.25;

export function weightTrend(body: readonly BodyRecord[], today: string): WeightTrend {
  const ratePct = weeklyRatePct(body, today);
  const rates = [0, 7, 14].map((offset) => weeklyRatePct(body, addDays(today, -offset)));
  const plateau = rates.every((rate) => rate !== null && rate > PLATEAU_RATE_PCT);
  return {
    average: averageWeight(body, today),
    ratePct,
    plateau,
    tooFast: ratePct !== null && ratePct < -1,
    onTarget: ratePct !== null && ratePct <= -0.5 && ratePct >= -1
  };
}

/** Daily 7-day averages for the chart, one point per day with data in range. */
export function averageSeries(body: readonly BodyRecord[], today: string, days: number): Point[] {
  const points = weights(body);
  const series: Point[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const value = rollingAverage(points, date);
    if (value !== null) {
      series.push({ date, value });
    }
  }
  return series;
}

export function rawWeights(body: readonly BodyRecord[], from: string): Point[] {
  return weights(body).filter((point) => point.date >= from);
}

/** Latest non-empty value of a body field. */
export function latest(body: readonly BodyRecord[], field: 'waist' | 'steps' | 'protein'): { date: string; value: number } | null {
  const entries = body
    .filter((entry) => entry[field] !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = entries.at(-1);
  const value = last?.[field];
  return last && typeof value === 'number' ? { date: last.date, value } : null;
}

export function averageSteps(body: readonly BodyRecord[], today: string): number | null {
  const points = body
    .filter((entry): entry is BodyRecord & { steps: number } => entry.steps !== null)
    .map((entry) => ({ date: entry.date, value: entry.steps }));
  const average = rollingAverage(points, today);
  return average === null ? null : Math.round(average);
}
