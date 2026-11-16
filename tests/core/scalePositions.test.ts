import { describe, expect, it } from 'vitest';
import { getCagedScalePosition } from '../../src/core/scalePositions';
import { DIATONIC_MODES, GUITAR_6_STANDARD, SCALE_MAP } from '../../src/core/constants';
import { CagedShapeId, PitchClass } from '../../src/core/models';
import { toDisplayStringNumber } from '../../src/core/stringNumbering';

const SHAPES: CagedShapeId[] = ['C', 'A', 'G', 'E', 'D'];
const show = (root: PitchClass, shape: CagedShapeId) =>
  getCagedScalePosition(root, SCALE_MAP['ionian'], shape, GUITAR_6_STANDARD)!.notes.map(
    (n) => `${toDisplayStringNumber(n.stringIndex)}:${n.fret}`
  );

describe('getCagedScalePosition', () => {
  it('G major in the E shape: frets 2–6, three notes per string except the B string', () => {
    const pos = getCagedScalePosition(7, SCALE_MAP['ionian'], 'E', GUITAR_6_STANDARD)!;
    expect(pos.window).toEqual({ min: 2, max: 6 });
    expect(show(7, 'E')).toEqual([
      '1:2', '1:3', '1:5',
      '2:2', '2:3', '2:5',
      '3:2', '3:4', '3:5',
      '4:2', '4:4', '4:5',
      '5:3', '5:5',
      '6:2', '6:3', '6:5',
    ]);
    expect(pos.notes[1].degree).toBe('1');
  });

  it('skips boxes cut off by the nut', () => {
    // E major, G shape: root on open low E → box would be frets -3..1, so the octave up is used
    expect(getCagedScalePosition(4, SCALE_MAP['ionian'], 'G', GUITAR_6_STANDARD)!.window).toEqual({
      min: 9,
      max: 13,
    });
  });

  it('never repeats a pitch and always ascends, in every key, mode and shape', () => {
    for (const mode of DIATONIC_MODES) {
      for (let root = 0; root < 12; root++) {
        for (const shape of SHAPES) {
          const pos = getCagedScalePosition(root as PitchClass, mode, shape, GUITAR_6_STANDARD);
          expect(pos).not.toBeNull();
          const midis = pos!.notes.map((n) => n.midi);
          midis.forEach((m, i) => i > 0 && expect(m).toBeGreaterThan(midis[i - 1]));
          expect(midis.length).toBeGreaterThanOrEqual(14);
          // every note sits inside the box
          pos!.notes.forEach((n) => {
            expect(n.fret).toBeGreaterThanOrEqual(pos!.window.min);
            expect(n.fret).toBeLessThanOrEqual(pos!.window.max);
          });
        }
      }
    }
  });

  it('A minor, D shape: F once, on the G string, so the position is frets 7–10', () => {
    const pos = getCagedScalePosition(9, SCALE_MAP['aeolian'], 'D', GUITAR_6_STANDARD)!;
    expect(pos.window).toEqual({ min: 6, max: 10 }); // the CAGED box itself
    expect(pos.span).toEqual({ min: 7, max: 10 }); // what the hand actually covers
    const fs = pos.notes.filter((n) => n.degree === 'b6' && n.midi === 65);
    expect(fs).toEqual([{ stringIndex: 3, fret: 10, midi: 65, degree: 'b6' }]);
  });

  it('keeps the higher string when G and B strings share a pitch and the span is the same', () => {
    // In a 5-fret box the top fret of the G string equals the bottom fret of the B string
    let checked = 0;
    for (let root = 0; root < 12; root++) {
      for (const shape of SHAPES) {
        const pos = getCagedScalePosition(root as PitchClass, SCALE_MAP['ionian'], shape, GUITAR_6_STANDARD)!;
        const gTop = GUITAR_6_STANDARD.tuningMidi[2] + pos.window.max;
        const shared = pos.notes.find((n) => n.midi === gTop);
        // A tie: the position uses both edge frets anyway
        const usesBothEdges =
          pos.notes.some((n) => n !== shared && n.fret === pos.window.min) &&
          pos.notes.some((n) => n !== shared && n.fret === pos.window.max);
        if (shared && usesBothEdges) {
          expect(shared.stringIndex).toBe(2); // B string, not G
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
