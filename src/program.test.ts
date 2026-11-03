import { describe, expect, it } from 'vitest';
import demoNames from './demos.json';
import {
  CIRCUIT_POOL,
  EASIER_ADVICE,
  EXERCISES,
  WARMUP,
  circuitFor,
  findVariant,
  nextRest,
  variantIndex
} from './program';

describe('program', () => {
  it('has valid ladders: unique ids, a known start and a demo for every step', () => {
    for (const ex of Object.values(EXERCISES)) {
      const ids = ex.ladder.map((variant) => variant.id);
      expect(new Set(ids).size, ex.id).toBe(ids.length);
      expect(variantIndex(ex, ex.start), ex.id).toBeGreaterThanOrEqual(0);
      expect(ex.min, ex.id).toBeLessThanOrEqual(ex.max);
      expect(ex.cues.length, ex.id).toBeGreaterThan(0);
      for (const variant of ex.ladder) {
        expect(Object.keys(demoNames), variant.id).toContain(variant.demo);
      }
    }
  });

  it('uses every demo image', () => {
    const used = new Set(Object.values(EXERCISES).flatMap((ex) => ex.ladder.map((variant) => variant.demo)));
    expect([...used].sort()).toEqual(Object.keys(demoNames).sort());
  });

  it('has no kettlebell overhead or floor press and no A/B-only exercises', () => {
    for (const id of ['press', 'floor-press', 'band-press', 'split-squat', 'row', 'dead-bug', 'scap-pushup']) {
      expect(EXERCISES[id], id).toBeUndefined();
    }
  });

  it('alternates push-up and pike push-up in a 4-exercise circuit', () => {
    expect(circuitFor(0)).toEqual(['squat', 'rdl', 'pushup', 'one-arm-row']);
    expect(circuitFor(1)).toEqual(['squat', 'rdl', 'pike-pushup', 'one-arm-row']);
    for (const id of [...circuitFor(0), ...circuitFor(1)]) {
      expect(CIRCUIT_POOL).toContain(id);
    }
  });

  it('starts the pike push-up and the row at their easiest steps', () => {
    expect(EXERCISES['pike-pushup']?.ladder.map((variant) => variant.id)).toEqual([
      'incline-pike-pushup', 'pike-pushup', 'feet-elevated-pike-pushup', 'pause-pike-pushup'
    ]);
    expect(EXERCISES['pike-pushup']?.start).toBe('incline-pike-pushup');
    expect(EXERCISES['one-arm-row']?.start).toBe('door-band-row');
    // Ids logged before the door-anchored steps existed still resolve.
    expect(variantIndex(EXERCISES['one-arm-row']!, 'one-arm-band-row')).toBe(2);
  });

  it('gives advice for the easiest step of every circuit exercise', () => {
    for (const id of CIRCUIT_POOL) {
      expect(EASIER_ADVICE[id], id).toBeTruthy();
    }
  });

  it('has a known exercise for every warm-up item', () => {
    for (const item of WARMUP) {
      expect(EXERCISES[item.exercise]?.warmup, item.exercise).toBe(true);
    }
  });

  it('falls back to the first step for an unknown variant', () => {
    expect(findVariant(EXERCISES.squat!, 'nope').id).toBe('goblet-squat');
  });

  it('steps the rest down to 45 s', () => {
    expect([90, 75, 60, 45].map(nextRest)).toEqual([75, 60, 45, 45]);
  });
});
