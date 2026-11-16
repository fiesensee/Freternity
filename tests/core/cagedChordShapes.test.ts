import { describe, expect, it } from 'vitest';
import {
  CAGED_CHORD_SHAPES,
  CagedChordQuality,
  findCagedChordVoicings,
} from '../../src/core/cagedChordShapes';
import { CAGED_DEFINITIONS } from '../../src/core/cagedGeometry';
import { GUITAR_6_STANDARD } from '../../src/core/constants';
import { CagedShapeId, PitchClass } from '../../src/core/models';
import { getIntervalDegree, midiToPitchClass } from '../../src/core/musicTheory';

const SHAPES: CagedShapeId[] = ['C', 'A', 'G', 'E', 'D'];
const QUALITIES: CagedChordQuality[] = ['maj', 'min'];
const fretsOf = (root: PitchClass, q: CagedChordQuality, shape: CagedShapeId) =>
  findCagedChordVoicings(root, q, shape, GUITAR_6_STANDARD).map((v) =>
    // low E → high E, 'x' for unused strings
    [6, 5, 4, 3, 2, 1]
      .map((s) => v.tones.find((t) => t.stringIndex === s)?.fret ?? 'x')
      .join('-')
  );

describe('CAGED chord shapes', () => {
  it('reproduces the open chords the shapes are named after', () => {
    expect(fretsOf(0, 'maj', 'C')[0]).toBe('x-3-2-0-1-0');
    expect(fretsOf(9, 'maj', 'A')[0]).toBe('x-0-2-2-2-0');
    expect(fretsOf(7, 'maj', 'G')[0]).toBe('3-2-0-0-0-3');
    expect(fretsOf(4, 'maj', 'E')[0]).toBe('0-2-2-1-0-0');
    expect(fretsOf(2, 'maj', 'D')[0]).toBe('x-x-0-2-3-2');
    expect(fretsOf(9, 'min', 'A')[0]).toBe('x-0-2-2-1-0');
    expect(fretsOf(4, 'min', 'E')[0]).toBe('0-2-2-0-0-0');
    expect(fretsOf(2, 'min', 'D')[0]).toBe('x-x-0-2-3-1');
  });

  it('moves the shapes up the neck: A minor in the G shape', () => {
    expect(fretsOf(9, 'min', 'G')).toEqual(['5-3-2-2-5-5', '17-15-14-14-17-17']);
  });

  it('skips placements that would need frets below the nut', () => {
    // C in the G shape: root on low E fret 8 (fret -4 would be needed below it)
    expect(fretsOf(0, 'maj', 'G')).toEqual(['8-7-5-5-5-8', '20-19-17-17-17-20']);
  });

  it('respects a fret zone', () => {
    const v = findCagedChordVoicings(9, 'min', 'G', GUITAR_6_STANDARD, { min: 0, max: 12 });
    expect(v).toHaveLength(1);
    expect(v[0].rootFret).toBe(5);
  });

  it('every tone is the chord tone it claims to be, for every root', () => {
    for (const q of QUALITIES) {
      for (const shape of SHAPES) {
        for (let root = 0; root < 12; root++) {
          for (const v of findCagedChordVoicings(root as PitchClass, q, shape, GUITAR_6_STANDARD)) {
            for (const t of v.tones) {
              const pc = midiToPitchClass(GUITAR_6_STANDARD.tuningMidi[t.stringIndex - 1] + t.fret);
              expect(getIntervalDegree(root as PitchClass, pc)).toBe(t.interval);
            }
          }
        }
      }
    }
  });

  it('stays inside the CAGED box of the same shape', () => {
    for (const q of QUALITIES) {
      for (const shape of SHAPES) {
        const { deltaMin, deltaMax } = CAGED_DEFINITIONS[shape];
        for (const t of CAGED_CHORD_SHAPES[q][shape]) {
          expect(t.fretOffset).toBeGreaterThanOrEqual(deltaMin);
          expect(t.fretOffset).toBeLessThanOrEqual(deltaMax);
        }
      }
    }
  });

  it('each shape sounds a different set of pitches, so audio can tell them apart', () => {
    for (const q of QUALITIES) {
      for (let root = 0; root < 12; root++) {
        const seen = new Map<string, CagedShapeId>();
        for (const shape of SHAPES) {
          for (const v of findCagedChordVoicings(root as PitchClass, q, shape, GUITAR_6_STANDARD)) {
            const key = v.tones
              .map((t) => GUITAR_6_STANDARD.tuningMidi[t.stringIndex - 1] + t.fret)
              .sort((a, b) => a - b)
              .join(',');
            expect(seen.get(key), `${root} ${q}: ${shape} vs ${seen.get(key)}`).toBeUndefined();
            seen.set(key, shape);
          }
        }
      }
    }
  });
});
