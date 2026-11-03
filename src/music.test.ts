import { describe, expect, it } from 'vitest';
import { barSeconds, melodyNotes, midiToHz, random, stepOffset } from './music';

describe('music', () => {
  it('converts MIDI notes to frequencies', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('swings the off-beat eighths late and keeps the beats straight', () => {
    const sixteenth = 60 / 80 / 4;
    expect(stepOffset(0)).toBe(0);
    expect(stepOffset(4)).toBeCloseTo(4 * sixteenth);
    expect(stepOffset(2)).toBeGreaterThan(2 * sixteenth);
    expect(stepOffset(2)).toBeLessThan(3 * sixteenth);
    expect(barSeconds()).toBe(3);
  });

  it('repeats the same random sequence for the same seed', () => {
    const a = random(42);
    const b = random(42);
    const values = Array.from({ length: 5 }, () => a());
    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('builds a minor-pentatonic melody two octaves above the chord root', () => {
    expect(melodyNotes([48, 52, 55, 59])).toEqual([72, 75, 77, 79, 82, 84]);
  });
});
