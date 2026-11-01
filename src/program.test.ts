import { describe, expect, it } from 'vitest';
import demoNames from './demos.json';
import {
  EXERCISES,
  QUICK_POOL,
  QUICK_WARMUP,
  WORKOUTS,
  findVariant,
  nextQuickRest,
  otherWorkout,
  quickCircuit,
  variantIndex
} from './program';

describe('program', () => {
  it('uses only known exercises in both workouts', () => {
    for (const id of [...WORKOUTS.A, ...WORKOUTS.B]) {
      expect(EXERCISES[id], id).toBeDefined();
    }
  });

  it('has valid ladders: unique ids, a known start and a demo for every step', () => {
    for (const ex of Object.values(EXERCISES)) {
      const ids = ex.ladder.map((variant) => variant.id);
      expect(new Set(ids).size, ex.id).toBe(ids.length);
      expect(variantIndex(ex, ex.start), ex.id).toBeGreaterThanOrEqual(0);
      expect(ex.min, ex.id).toBeLessThanOrEqual(ex.max);
      expect(ex.sets, ex.id).toBeLessThanOrEqual(ex.maxSets);
      expect(ex.cues.length, ex.id).toBeGreaterThan(0);
      for (const variant of ex.ladder) {
        expect(Object.keys(demoNames), variant.id).toContain(variant.demo);
      }
    }
  });

  it('follows the squat, hinge and push ladders in order', () => {
    expect(EXERCISES.rdl?.ladder.map((variant) => variant.id)).toEqual([
      'kb-rdl', 'kb-rdl-tempo', 'supported-sl-rdl', 'sl-rdl', 'sl-rdl-band'
    ]);
    expect(EXERCISES.pushup?.ladder.map((variant) => variant.id)).toEqual([
      'incline-pushup', 'pushup', 'band-pushup', 'deficit-pushup', 'feet-elevated-pushup', 'archer-pushup'
    ]);
  });

  it('falls back to the first step for an unknown variant', () => {
    const squat = EXERCISES.squat!;
    expect(findVariant(squat, 'nope').id).toBe('goblet-squat');
  });

  it('builds the Quick circuit from shared exercises', () => {
    for (const count of [0, 1, 2, 3]) {
      for (const id of quickCircuit(count)) {
        expect(EXERCISES[id], id).toBeDefined();
        expect(QUICK_POOL).toContain(id);
      }
    }
    for (const item of QUICK_WARMUP) {
      expect(EXERCISES[item.exercise], item.exercise).toBeDefined();
    }
  });

  it('steps the Quick rest down to 45 s', () => {
    expect([90, 75, 60, 45].map(nextQuickRest)).toEqual([75, 60, 45, 45]);
  });

  it('alternates A and B', () => {
    expect(otherWorkout('A')).toBe('B');
    expect(otherWorkout('B')).toBe('A');
  });
});
