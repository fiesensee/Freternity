import { describe, expect, it } from 'vitest';
import {
  appendHeardNote,
  mapHeardNotesToPositions,
  positionToMidi,
} from '../../src/core/drills/heardNoteMapper';
import { GUITAR_6_STANDARD } from '../../src/core/constants';
import { evaluateVoicingSelection } from '../../src/store/usePracticeStore';
import { FretPosition } from '../../src/core/models';

// C major root position on strings 3-2-1 at fret 5: C4 (3:5), E4 (2:5), G4 (1:3)
const C_ROOT: FretPosition[] = [
  { stringIndex: 3, fret: 5 },
  { stringIndex: 2, fret: 5 },
  { stringIndex: 1, fret: 3 },
];
// Same shape an octave up
const C_ROOT_HIGH: FretPosition[] = C_ROOT.map((p) => ({ ...p, fret: p.fret + 12 }));
const zone = { min: 0, max: 22 };
const midis = (v: FretPosition[]) => v.map((p) => positionToMidi(p, GUITAR_6_STANDARD));

describe('appendHeardNote', () => {
  it('keeps the last 3 distinct notes for the single voicing drill', () => {
    let heard: number[] = [];
    for (const m of [50, 60, 64, 60, 67]) heard = appendHeardNote(heard, m, 'TRIAD_INVERSION_HUNTER');
    expect(heard).toEqual([64, 60, 67]);
  });

  it('keeps more notes for the all inversions drill', () => {
    let heard: number[] = [];
    for (let m = 50; m < 59; m++) heard = appendHeardNote(heard, m, 'TRIAD_ALL_INVERSIONS');
    expect(heard).toHaveLength(9);
  });
});

describe('mapHeardNotesToPositions', () => {
  it('maps the exact pitches of a voicing onto its positions → match', () => {
    const positions = mapHeardNotesToPositions(
      midis(C_ROOT), [C_ROOT, C_ROOT_HIGH], 'TRIAD_INVERSION_HUNTER', [1, 2, 3], zone, GUITAR_6_STANDARD
    );
    expect(evaluateVoicingSelection(positions, [C_ROOT, C_ROOT_HIGH])?.isMatch).toBe(true);
  });

  it('picks the octave-up voicing when that was played', () => {
    const positions = mapHeardNotesToPositions(
      midis(C_ROOT_HIGH), [C_ROOT, C_ROOT_HIGH], 'TRIAD_INVERSION_HUNTER', [1, 2, 3], zone, GUITAR_6_STANDARD
    );
    expect(positions).toEqual(expect.arrayContaining(C_ROOT_HIGH));
  });

  it('places a wrong note near the attempted shape on the active strings', () => {
    const heard = [...midis(C_ROOT).slice(0, 2), 68]; // G#4 instead of G4
    const positions = mapHeardNotesToPositions(
      heard, [C_ROOT], 'TRIAD_INVERSION_HUNTER', [1, 2, 3], zone, GUITAR_6_STANDARD
    );
    const result = evaluateVoicingSelection(positions, [C_ROOT]);
    expect(result?.isMatch).toBe(false);
    expect(result?.wrongPositions).toEqual([{ stringIndex: 1, fret: 4 }]);
    expect(result?.missedPositions).toEqual([{ stringIndex: 1, fret: 3 }]);
  });

  it('treats the right notes in the wrong octave as wrong', () => {
    const heard = midis(C_ROOT).map((m) => m - 12);
    const positions = mapHeardNotesToPositions(
      heard, [C_ROOT], 'TRIAD_INVERSION_HUNTER', [1, 2, 3], zone, GUITAR_6_STANDARD
    );
    expect(evaluateVoicingSelection(positions, [C_ROOT])?.isMatch).toBe(false);
  });
});
