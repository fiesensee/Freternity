import { describe, expect, it } from 'vitest';
import {
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
import { SCALE_MAP } from '../../src/core/constants';
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
});
