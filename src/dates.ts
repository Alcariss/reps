/** Calendar arithmetic on `YYYY-MM-DD` strings, done in UTC so DST never shifts a day. */

function toUtc(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const weekday = new Date(toUtc(iso)).getUTCDay();
  return addDays(iso, -((weekday + 6) % 7));
}
