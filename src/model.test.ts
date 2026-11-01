import { describe, expect, it } from 'vitest';
import { setKey, toBody, toBodyParams, toSet, toSetParams } from './model';

describe('toSet', () => {
  it('reads a row from the worker', () => {
    const row = {
      id: '7', date: '2026-11-02', workout: 'B', exercise: 'rdl', variant: 'kb-rdl', setNumber: 2,
      reps: 12, seconds: null, rir: 2, band: null, note: '', createdAt: 'c', updatedAt: 'u', owner: 'x'
    };

    expect(toSet(row)).toEqual({
      id: '7', date: '2026-11-02', workout: 'B', exercise: 'rdl', variant: 'kb-rdl', setNumber: 2,
      reps: 12, seconds: null, rir: 2, band: null, note: '', createdAt: 'c', updatedAt: 'u'
    });
  });

  it('accepts numeric ids and numbers typed into Grist as text', () => {
    const set = toSet({ id: 3, date: '2026-11-02', workout: 'A', exercise: 'row', variant: 'band-row', setNumber: '1', reps: '15', band: '3' });
    expect(set).toMatchObject({ id: '3', setNumber: 1, reps: 15, band: 3, rir: null });
  });

  it('rejects a row without an id', () => {
    expect(() => toSet({ date: '2026-11-02' })).toThrow('no id');
  });
});

describe('toSetParams', () => {
  it('sends empty optional numbers as blanks', () => {
    expect(toSetParams({
      date: '2026-11-02', workout: 'A', exercise: 'plank', variant: 'plank', setNumber: 1,
      reps: null, seconds: 40, rir: null, band: null, note: ' '
    })).toEqual({
      date: '2026-11-02', workout: 'A', exercise: 'plank', variant: 'plank', setNumber: 1,
      reps: '', seconds: 40, rir: '', band: '', note: ''
    });
  });
});

describe('toBody', () => {
  it('reads a body row and round-trips params', () => {
    const body = toBody({ id: '1', date: '2026-11-01', weight: 92.4, waist: null, steps: 8000, protein: 160, note: 'ok' });
    expect(body).toEqual({ id: '1', date: '2026-11-01', weight: 92.4, waist: null, steps: 8000, protein: 160, note: 'ok' });
    const { id: _id, ...input } = body;
    expect(toBodyParams(input)).toEqual({ date: '2026-11-01', weight: 92.4, waist: '', steps: 8000, protein: 160, note: 'ok' });
  });
});

describe('setKey', () => {
  it('identifies a set by day, exercise and number', () => {
    expect(setKey({ date: '2026-11-02', exercise: 'rdl', setNumber: 3 })).toBe('2026-11-02|rdl|3');
  });
});
