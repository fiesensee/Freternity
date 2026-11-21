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

  it('keeps one full pass of a larger voicing, e.g. a 6-note chord shape', () => {
    let heard: number[] = [];
    for (let m = 40; m < 48; m++) heard = appendHeardNote(heard, m, 'CAGED_CHORD_SHAPE', 6);
    expect(heard).toEqual([42, 43, 44, 45, 46, 47]);
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

  // --- CAGED chord shape: octave tolerance on low E string ---
  //
  // The CAGED G and E shapes use the low E string (index 6). The pitch detector sometimes
  // reports the fundamental an octave off; the mapper should accept the low-E position via
  // ±12 semitone tolerance.

  // G-shape A minor at rootFret=5: 6:5(A2), 5:3(C3), 4:2(E3), 3:2(A3), 2:5(E4), 1:5(A4)
  const A_MINOR_G_SHAPE: FretPosition[] = [
    { stringIndex: 6, fret: 5 },
    { stringIndex: 5, fret: 3 },
    { stringIndex: 4, fret: 2 },
    { stringIndex: 3, fret: 2 },
    { stringIndex: 2, fret: 5 },
    { stringIndex: 1, fret: 5 },
  ];

  it('CAGED: accepts a low-E chord tone detected an octave up (+12)', () => {
    // User plays string 6 fret 5 (A2, MIDI 45) but detector reports A3 (MIDI 57).
    // MIDI 57 also matches string 3 fret 2 in the same voicing; octave tolerance
    // should ensure string 6 fret 5 also counts.
    const heard = [57, 48, 52, 64, 69]; // root octave-up, others exact
    const positions = mapHeardNotesToPositions(
      heard, [A_MINOR_G_SHAPE], 'CAGED_CHORD_SHAPE',
      [1, 2, 3, 4, 5, 6], zone, GUITAR_6_STANDARD
    );
    // String-6 position must be present
    expect(positions).toEqual(
      expect.arrayContaining([{ stringIndex: 6, fret: 5 }])
    );
    // String-3 position (same MIDI 57) also present because exact match still runs
    expect(positions).toEqual(
      expect.arrayContaining([{ stringIndex: 3, fret: 2 }])
    );
  });

  it('CAGED: accepts a low-E chord tone detected an octave down (-12)', () => {
    // User plays string 6 fret 17 (A3, MIDI 57) but detector reports A2 (MIDI 45).
    // MIDI 45 matches string 6 fret 5 directly; octave tolerance should let
    // string 6 fret 17 also match (45 + 12 = 57 → expected MIDI for fret 17).
    //
    // Build a voicing with low E at fret 17.
    const gShapeHigh: FretPosition[] = A_MINOR_G_SHAPE.map((p) => ({ ...p, fret: p.fret + 12 }));
    const heard = [45, 60, 64, 69, 76]; // root octave-down, others exact
    const positions = mapHeardNotesToPositions(
      heard, [gShapeHigh], 'CAGED_CHORD_SHAPE',
      [1, 2, 3, 4, 5, 6], zone, GUITAR_6_STANDARD
    );
    expect(positions).toEqual(
      expect.arrayContaining([{ stringIndex: 6, fret: 17 }])
    );
  });

  it('CAGED: rejects a wrong note on the low E string', () => {
    // User plays F on string 6 fret 1 (F2, MIDI 41) which is NOT a chord tone of A minor.
    const heard = [41, 48, 52, 57, 64, 69];
    const positions = mapHeardNotesToPositions(
      heard, [A_MINOR_G_SHAPE], 'CAGED_CHORD_SHAPE',
      [1, 2, 3, 4, 5, 6], zone, GUITAR_6_STANDARD
    );
    const result = evaluateVoicingSelection(positions, [A_MINOR_G_SHAPE]);
    expect(result?.isMatch).toBe(false);
    expect(result?.correctPositions).not.toEqual(
      expect.arrayContaining([{ stringIndex: 6, fret: 1 }])
    );
  });

  it('CAGED: shape rejection still works (neighbouring shape is not accepted)', () => {
    // User plays E-shape A-minor notes (with low E an octave-up) against a
    // G-shape voicing — must be rejected.
    const heard = [57, 52, 57, 60, 64, 69];
    const positions = mapHeardNotesToPositions(
      heard, [A_MINOR_G_SHAPE], 'CAGED_CHORD_SHAPE',
      [1, 2, 3, 4, 5, 6], zone, GUITAR_6_STANDARD
    );
    const result = evaluateVoicingSelection(positions, [A_MINOR_G_SHAPE]);
    expect(result?.isMatch).toBe(false);
  });

  it('TRIAD_INVERSION_HUNTER: octave tolerance does NOT apply (non-CAGED drill unaffected)', () => {
    // A note on the low E string detected an octave off should NOT get special
    // treatment in the triad inversion drill — only CAGED_CHORD_SHAPE gets that.
    // Use a voicing that includes string 6 so the octave-up midi would only match
    // via tolerance if it were enabled.
    const voicingWithLowE: FretPosition[] = [
      ...C_ROOT,
      // Also add the low-E string position at a different fret so the octave-up
      // MIDI doesn't match it exactly either.
      { stringIndex: 6, fret: 5 }, // A2 = MIDI 45
    ];
    // Play the root on string 6 (MIDI 45) but detector reports 57 (+12).
    // In CAGED mode this would match via octave tolerance; in triad mode it shouldn't.
    const heard = [57, 60, 64, 67];
    const positions = mapHeardNotesToPositions(
      heard, [voicingWithLowE], 'TRIAD_INVERSION_HUNTER',
      [1, 2, 3, 4, 5, 6], zone, GUITAR_6_STANDARD
    );
    // String 6 fret 5 should NOT be in the result (no octave tolerance for non-CAGED)
    expect(positions).not.toEqual(
      expect.arrayContaining([{ stringIndex: 6, fret: 5 }])
    );
  });
});
