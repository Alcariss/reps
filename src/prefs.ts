import type { Override } from './engine';
import { BAND_LEVELS } from './program';

/** Device-local preferences. Training data lives on the server; these do not need to. */
export type Prefs = {
  bandNames: string[];
  sound: boolean;
  vibrate: boolean;
  /** First day of the current or last deload week. */
  deloadFrom: string | null;
  overrides: Record<string, Override>;
};

export const DEFAULT_BAND_NAMES = ['Yellow (light)', 'Green', 'Red', 'Blue', 'Black (heavy)', 'Two bands'];

export const DEFAULT_PREFS: Prefs = {
  bandNames: DEFAULT_BAND_NAMES,
  sound: true,
  vibrate: true,
  deloadFrom: null,
  overrides: {}
};

export function normalizePrefs(value: unknown): Prefs {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PREFS, overrides: {} };
  }
  const record = value as Partial<Prefs>;
  const names = Array.isArray(record.bandNames) ? record.bandNames : [];
  return {
    bandNames: Array.from({ length: BAND_LEVELS }, (_, index) => {
      const name = names[index];
      return typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 40) : DEFAULT_BAND_NAMES[index] ?? `Level ${index + 1}`;
    }),
    sound: record.sound !== false,
    vibrate: record.vibrate !== false,
    deloadFrom: typeof record.deloadFrom === 'string' ? record.deloadFrom : null,
    overrides: typeof record.overrides === 'object' && record.overrides !== null ? record.overrides : {}
  };
}

export function bandLabel(prefs: Prefs, band: number | null): string {
  if (band === null) {
    return '';
  }
  return `L${band} · ${prefs.bandNames[band - 1] ?? ''}`.trim();
}
