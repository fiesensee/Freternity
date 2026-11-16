import { describe, expect, it } from 'vitest';
import { formatStringSet, toDisplayStringNumber } from '../../src/core/stringNumbering';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

describe('string numbering shown to the user (1 = low E)', () => {
  it('maps internal tuning-order indices to display numbers', () => {
    // internal 6 is the low E string (MIDI 40), internal 1 the high E (MIDI 64)
    expect(GUITAR_6_STANDARD.tuningMidi[6 - 1]).toBe(40);
    expect(toDisplayStringNumber(6)).toBe(1);
    expect(toDisplayStringNumber(1)).toBe(6);
  });

  it('formats string sets in ascending display order', () => {
    expect(formatStringSet([1, 2, 3])).toBe('4-5-6'); // G-B-E
    expect(formatStringSet([4, 5, 6])).toBe('1-2-3'); // E-A-D
    expect(formatStringSet([2, 3, 4])).toBe('3-4-5');
  });
});
