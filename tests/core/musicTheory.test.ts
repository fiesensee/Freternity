import { describe, expect, it } from 'vitest';
import {
  findMatchingScales,
  getChromaticNoteName,
  getDiatonicScaleSpelling,
  getIntervalDegree,
  getNoteNameInContext,
  getParentMajorRoot,
  getRelativeMode,
  isFlatKeySignature,
  midiToFrequencyHz,
  midiToOctave,
  midiToPitchClass,
  semitoneDistance,
} from '../../src/core/musicTheory';
import { ALL_SCALES, SCALE_MAP } from '../../src/core/constants';
import { PitchClass } from '../../src/core/models';

describe('musicTheory', () => {
  describe('MIDI conversions', () => {
    it('converts MIDI note numbers to pitch class', () => {
      expect(midiToPitchClass(40)).toBe(4); // E2 -> E (4)
      expect(midiToPitchClass(60)).toBe(0); // C4 -> C (0)
      expect(midiToPitchClass(69)).toBe(9); // A4 -> A (9)
    });

    it('converts MIDI note numbers to scientific octave', () => {
      expect(midiToOctave(40)).toBe(2); // E2
      expect(midiToOctave(60)).toBe(4); // C4
      expect(midiToOctave(69)).toBe(4); // A4
    });

    it('calculates frequency accurately (A4 = 440 Hz)', () => {
      expect(midiToFrequencyHz(69)).toBe(440);
      expect(midiToFrequencyHz(57)).toBe(220); // A3
    });

    it('computes positive semitone distance modulo 12', () => {
      expect(semitoneDistance(0, 4)).toBe(4); // C to E
      expect(semitoneDistance(9, 0)).toBe(3); // A to C
      expect(semitoneDistance(11, 2)).toBe(3); // B to D
    });
  });

  describe('Diatonic key signatures and enharmonic spelling', () => {
    it('resolves parent major root from relative mode', () => {
      // A Aeolian -> parent is C (0)
      expect(getParentMajorRoot(9, SCALE_MAP['aeolian'])).toBe(0);
      // D Dorian -> parent is C (0)
      expect(getParentMajorRoot(2, SCALE_MAP['dorian'])).toBe(0);
      // D Aeolian -> parent is F (5)
      expect(getParentMajorRoot(2, SCALE_MAP['aeolian'])).toBe(5);
      // B Ionian -> parent is B (11)
      expect(getParentMajorRoot(11, SCALE_MAP['ionian'])).toBe(11);
    });

    it('identifies flat vs sharp key signatures correctly', () => {
      expect(isFlatKeySignature(5)).toBe(true); // F Major (1 flat: Bb)
      expect(isFlatKeySignature(10)).toBe(true); // Bb Major
      expect(isFlatKeySignature(7)).toBe(false); // G Major (1 sharp: F#)
      expect(isFlatKeySignature(2)).toBe(false); // D Major (2 sharps)
      expect(isFlatKeySignature(11)).toBe(false); // B Major (5 sharps)
    });

    it('spells D Aeolian with Bb rather than A# (1 flat key)', () => {
      const spelling = getDiatonicScaleSpelling(2, SCALE_MAP['aeolian']);
      expect(spelling[10 as PitchClass]).toBe('Bb');
      expect(spelling[2 as PitchClass]).toBe('D');
      expect(spelling[4 as PitchClass]).toBe('E');
      expect(spelling[5 as PitchClass]).toBe('F');
      expect(spelling[7 as PitchClass]).toBe('G');
      expect(spelling[9 as PitchClass]).toBe('A');
      expect(spelling[0 as PitchClass]).toBe('C');
    });

    it('spells B Major with A# rather than Bb (5 sharps key)', () => {
      const spelling = getDiatonicScaleSpelling(11, SCALE_MAP['ionian'], false);
      expect(spelling[10 as PitchClass]).toBe('A#');
      expect(spelling[6 as PitchClass]).toBe('F#');
      expect(spelling[1 as PitchClass]).toBe('C#');
      expect(spelling[3 as PitchClass]).toBe('D#');
      expect(spelling[8 as PitchClass]).toBe('G#');
    });

    it('returns context-aware note name for diatonic and chromatic notes', () => {
      // In F Major (root = 5), pitch 10 is Bb
      expect(getNoteNameInContext(10, 5, SCALE_MAP['ionian'])).toBe('Bb');
      // In B Major (root = 11), pitch 10 is A#
      expect(getNoteNameInContext(10, 11, SCALE_MAP['ionian'], false)).toBe('A#');
    });

    it('spells chromatic notes with flats or sharps independently of the key signature', () => {
      // C Major has no black keys in its key signature, so all five follow the display preference
      const blackKeys: PitchClass[] = [1, 3, 6, 8, 10];
      expect(blackKeys.map((pc) => getChromaticNoteName(pc, true))).toEqual([
        'Db',
        'Eb',
        'Gb',
        'Ab',
        'Bb',
      ]);
      expect(blackKeys.map((pc) => getChromaticNoteName(pc, false))).toEqual([
        'C#',
        'D#',
        'F#',
        'G#',
        'A#',
      ]);

      // Chromatic notes in G Major follow the preference …
      expect(getNoteNameInContext(8, 7, SCALE_MAP['ionian'], true)).toBe('Ab');
      expect(getNoteNameInContext(8, 7, SCALE_MAP['ionian'], false)).toBe('G#');
      // … but its diatonic F# stays F# even when flats are preferred
      expect(getNoteNameInContext(6, 7, SCALE_MAP['ionian'], true)).toBe('F#');

      // F Major keeps its diatonic Bb, while its chromatic notes follow the preference
      expect(getNoteNameInContext(10, 5, SCALE_MAP['ionian'], false)).toBe('Bb');
      expect(getNoteNameInContext(1, 5, SCALE_MAP['ionian'], false)).toBe('C#');
      expect(getNoteNameInContext(1, 5, SCALE_MAP['ionian'], true)).toBe('Db');
    });
  });

  describe('Relative mode switching and intervals', () => {
    it('retrieves relative mode root and definition', () => {
      // Parent C (0) -> Aeolian root should be A (9)
      const mode = getRelativeMode(0, 'aeolian');
      expect(mode.root).toBe(9);
      expect(mode.scale.id).toBe('aeolian');
    });

    it('calculates interval degrees accurately', () => {
      expect(getIntervalDegree(9, 9)).toBe('1'); // A to A
      expect(getIntervalDegree(9, 0)).toBe('b3'); // A to C
      expect(getIntervalDegree(9, 4)).toBe('5'); // A to E
      expect(getIntervalDegree(9, 5)).toBe('b6'); // A to F
    });
  });

  describe('Scale catalog and findMatchingScales', () => {
    it('includes diatonic modes, pentatonics, blues, harmonic minor and melodic minor in SCALE_MAP', () => {
      expect(SCALE_MAP['major_pentatonic']).toBeDefined();
      expect(SCALE_MAP['minor_pentatonic']).toBeDefined();
      expect(SCALE_MAP['blues']).toBeDefined();
      expect(SCALE_MAP['harmonic_minor']).toBeDefined();
      expect(SCALE_MAP['melodic_minor']).toBeDefined();
      expect(ALL_SCALES.length).toBe(12);
    });

    it('returns empty array when no notes are selected', () => {
      expect(findMatchingScales([])).toEqual([]);
    });

    it('finds exact matches first and orders partial matches by fewest missing notes', () => {
      // A Minor Pentatonic: A (9), C (0), D (2), E (4), G (7)
      const matches = findMatchingScales([9, 0, 2, 4, 7]);
      const exact = matches.filter((m) => m.isExact);

      expect(exact).toHaveLength(2);
      // C Major Pentatonic and A Minor Pentatonic share the exact 5 pitch classes
      expect(exact.map((m) => `${m.rootPitchClass}:${m.scale.id}`)).toEqual(
        expect.arrayContaining(['0:major_pentatonic', '9:minor_pentatonic'])
      );

      // Exact matches must appear before partial/containing scales
      const firstNonExactIdx = matches.findIndex((m) => !m.isExact);
      expect(firstNonExactIdx).toBe(exact.length);

      // Next best match should be 6-note blues scales missing only 1 note (Eb/D# = 3 for A blues)
      expect(matches[firstNonExactIdx].scale.id).toBe('blues');
      expect(matches[firstNonExactIdx].missingCount).toBe(1);

      // C Ionian / A Aeolian / D Dorian etc. contain these 5 notes with 2 missing notes
      expect(
        matches.some((m) => m.rootPitchClass === 0 && m.scale.id === 'ionian' && !m.isExact)
      ).toBe(true);
      expect(
        matches.some((m) => m.rootPitchClass === 9 && m.scale.id === 'aeolian' && !m.isExact)
      ).toBe(true);
    });

    it('matches harmonic minor, melodic minor, and blues scales specifically', () => {
      // A Harmonic Minor: A(9), B(11), C(0), D(2), E(4), F(5), G#(8)
      const harmonicMatches = findMatchingScales([9, 11, 0, 2, 4, 5, 8]);
      expect(harmonicMatches.filter((m) => m.isExact).map((m) => [m.rootPitchClass, m.scale.id])).toEqual([
        [9, 'harmonic_minor'],
      ]);

      // A Melodic Minor: A(9), B(11), C(0), D(2), E(4), F#(6), G#(8)
      const melodicMatches = findMatchingScales([9, 11, 0, 2, 4, 6, 8]);
      expect(melodicMatches.filter((m) => m.isExact).map((m) => [m.rootPitchClass, m.scale.id])).toEqual([
        [9, 'melodic_minor'],
      ]);

      // A Minor Blues: A(9), C(0), D(2), Eb(3), E(4), G(7)
      const bluesMatches = findMatchingScales([9, 0, 2, 3, 4, 7]);
      expect(bluesMatches.filter((m) => m.isExact).map((m) => [m.rootPitchClass, m.scale.id])).toEqual([
        [9, 'blues'],
      ]);
    });

    it('deduplicates and normalizes pitch classes and returns empty when chromatic notes exceed all scales', () => {
      // Duplicate A (9) and C (0) -> same as [9, 0]
      const dup = findMatchingScales([9, 0, 9, 0]);
      const single = findMatchingScales([9, 0]);
      expect(dup).toEqual(single);

      // 8 distinct pitch classes cannot fit inside any 7-note scale
      expect(findMatchingScales([0, 1, 2, 3, 4, 5, 6, 7])).toEqual([]);
    });

    it('spells pentatonic and minor-variant scales properly in getDiatonicScaleSpelling', () => {
      const aBlues = getDiatonicScaleSpelling(9, SCALE_MAP['blues'], true);
      expect(aBlues[9]).toBe('A');
      expect(aBlues[0]).toBe('C');
      expect(aBlues[2]).toBe('D');
      expect(aBlues[3]).toBe('Eb');
      expect(aBlues[4]).toBe('E');
      expect(aBlues[7]).toBe('G');
    });
  });
});
