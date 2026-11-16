import { describe, expect, it } from 'vitest';
import { readTuning, smoothFrequency } from '../../../src/core/pitch/tuner';

const hz = (midi: number, cents = 0) => 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);

describe('tuner', () => {
  it('reads the nearest note, the cents off, and the open string it matches', () => {
    expect(readTuning(hz(40, -12))).toEqual({ midiNote: 40, cents: -12, openStringIndex: 6 });
    expect(readTuning(hz(59, 3.4))).toEqual({ midiNote: 59, cents: 3.4, openStringIndex: 2 });
    // F2 isn't an open string
    expect(readTuning(hz(41)).openStringIndex).toBeNull();
    // 30 cents sharp of E2 is still "E2, sharp" — 60 cents sharp is a flat F2
    expect(readTuning(hz(40, 30)).midiNote).toBe(40);
    expect(readTuning(hz(40, 60))).toMatchObject({ midiNote: 41, cents: -40 });
  });

  it('smooths with the median and ignores frames on another semitone', () => {
    expect(smoothFrequency([])).toBeNull();
    const steady = [hz(45, -4), hz(45, -2), hz(57), hz(45, -3), hz(45, 9)];
    // the octave slip (57) is dropped; median of -4, -2, -3, +9 → -2
    expect(readTuning(smoothFrequency(steady)!).cents).toBeCloseTo(-2, 0);
  });
});
