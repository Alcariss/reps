import type { RequestParams } from '@alcariss/pwa-kit';
import type { WorkoutId } from './program';

/** Mirrors the `reps` entry (tables `sets` and `body`) in the pwa-kit worker's `apps.ts`. */

export type SetRecord = {
  id: string;
  date: string;
  workout: WorkoutId;
  exercise: string;
  variant: string;
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  rir: number | null;
  band: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type SetInput = Omit<SetRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type BodyRecord = {
  id: string;
  date: string;
  weight: number | null;
  waist: number | null;
  steps: number | null;
  protein: number | null;
  note: string;
};

export type BodyInput = Omit<BodyRecord, 'id'>;

function asRecord(row: unknown, what: string): Record<string, unknown> {
  if (typeof row !== 'object' || row === null) {
    throw new Error(`${what} row is not an object`);
  }
  return row as Record<string, unknown>;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function numberOrNull(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  // Grist text cells or hand edits may hold numbers as strings.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function requireId(record: Record<string, unknown>, what: string): string {
  const id = record.id;
  if (typeof id === 'string' && id !== '') {
    return id;
  }
  if (typeof id === 'number') {
    return String(id);
  }
  throw new Error(`${what} row has no id`);
}

export function toSet(row: unknown): SetRecord {
  const record = asRecord(row, 'Set');
  const workout = text(record, 'workout');
  return {
    id: requireId(record, 'Set'),
    date: text(record, 'date'),
    workout: workout === 'B' || workout === 'Q' ? workout : 'A',
    exercise: text(record, 'exercise'),
    variant: text(record, 'variant'),
    setNumber: numberOrNull(record, 'setNumber') ?? 1,
    reps: numberOrNull(record, 'reps'),
    seconds: numberOrNull(record, 'seconds'),
    rir: numberOrNull(record, 'rir'),
    band: numberOrNull(record, 'band'),
    note: text(record, 'note'),
    createdAt: text(record, 'createdAt'),
    updatedAt: text(record, 'updatedAt')
  };
}

/** Empty optional fields are sent as '' so the worker stores a blank cell. */
export function toSetParams(input: SetInput): RequestParams {
  return {
    date: input.date,
    workout: input.workout,
    exercise: input.exercise,
    variant: input.variant,
    setNumber: Math.max(1, Math.round(input.setNumber)),
    reps: input.reps ?? '',
    seconds: input.seconds ?? '',
    rir: input.rir ?? '',
    band: input.band ?? '',
    note: input.note.trim()
  };
}

export function toBody(row: unknown): BodyRecord {
  const record = asRecord(row, 'Body');
  return {
    id: requireId(record, 'Body'),
    date: text(record, 'date'),
    weight: numberOrNull(record, 'weight'),
    waist: numberOrNull(record, 'waist'),
    steps: numberOrNull(record, 'steps'),
    protein: numberOrNull(record, 'protein'),
    note: text(record, 'note')
  };
}

export function toBodyParams(input: BodyInput): RequestParams {
  return {
    date: input.date,
    weight: input.weight ?? '',
    waist: input.waist ?? '',
    steps: input.steps ?? '',
    protein: input.protein ?? '',
    note: input.note.trim()
  };
}

/** A logged set is identified by its day, workout, exercise and set number. */
export function setKey(input: Pick<SetInput, 'date' | 'workout' | 'exercise' | 'setNumber'>): string {
  return `${input.date}|${input.workout}|${input.exercise}|${input.setNumber}`;
}
