import { describe, expect, it } from 'vitest';
import { computeScaleFinderResults } from '../../src/components/controls/ScaleFinderPanel';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

describe('ScaleFinderPanel computeScaleFinderResults', () => {
  it('maps fretboard positions to unique pitch classes and groups exact vs containing matches', () => {
    // Low E (string 6) fret 5 = A (9), fret 8 = C (0)
    // A string (string 5) fret 5 = D (2), fret 7 = E (4)
    // D string (string 4) fret 5 = G (7)
    // High E (string 1) fret 5 = A (9) - octave duplicate of A
    const result = computeScaleFinderResults(
      [
        { stringIndex: 6, fret: 5 },
        { stringIndex: 6, fret: 8 },
        { stringIndex: 5, fret: 5 },
        { stringIndex: 5, fret: 7 },
        { stringIndex: 4, fret: 5 },
        { stringIndex: 1, fret: 5 },
      ],
      GUITAR_6_STANDARD.tuningMidi
    );

    // A (9), C (0), D (2), E (4), G (7) -> deduplicated to 5 pitch classes
    expect(result.pitchClasses).toEqual([9, 0, 2, 4, 7]);

    // Exact matches: A Minor Pentatonic & C Major Pentatonic
    expect(result.exact.map((m) => `${m.rootPitchClass}:${m.scale.id}`)).toEqual([
      '0:major_pentatonic',
      '9:minor_pentatonic',
    ]);

    // Containing scales include A Minor Blues, C Ionian, A Aeolian, etc.
    expect(result.containing.some((m) => m.rootPitchClass === 9 && m.scale.id === 'blues')).toBe(true);
    expect(result.containing.some((m) => m.rootPitchClass === 9 && m.scale.id === 'aeolian')).toBe(true);
    expect(result.containing.some((m) => m.rootPitchClass === 0 && m.scale.id === 'ionian')).toBe(true);
  });

  it('returns empty groups when no positions are selected', () => {
    const result = computeScaleFinderResults([], GUITAR_6_STANDARD.tuningMidi);
    expect(result.pitchClasses).toEqual([]);
    expect(result.exact).toEqual([]);
    expect(result.containing).toEqual([]);
  });
});
