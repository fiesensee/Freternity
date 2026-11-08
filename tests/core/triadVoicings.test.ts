import { describe, expect, it } from 'vitest';
import { findClosedTriadVoicings } from '../../src/core/triadVoicings';
import { CHORD_MAP, GUITAR_6_STANDARD } from '../../src/core/constants';

describe('triadVoicings', () => {
  it('solves F Major 1st inversion on strings 1-2-3 correctly', () => {
    // F Major (root = 5, F, A, C)
    // 1st Inversion: Third (A = 9) on lowest string (3), Fifth (C = 0) on mid string (2), Root (F = 5) on high string (1)
    const voicings = findClosedTriadVoicings(
      5, // F
      CHORD_MAP['maj'],
      'FIRST',
      [1, 2, 3],
      GUITAR_6_STANDARD
    );

    // Expect lower octave voicing at frets (G string: 2, B string: 1, E string: 1)
    const lowVoicing = voicings.find((v) =>
      v.positions.some((p) => p.stringIndex === 3 && p.fret === 2)
    );
    expect(lowVoicing).toBeDefined();
    expect(lowVoicing?.inversion).toBe('FIRST');
    expect(lowVoicing?.positions).toEqual([
      { stringIndex: 3, fret: 2 }, // A
      { stringIndex: 2, fret: 1 }, // C
      { stringIndex: 1, fret: 1 }, // F
    ]);

    // Expect higher octave voicing at frets (G string: 14, B string: 13, E string: 13)
    const highVoicing = voicings.find((v) =>
      v.positions.some((p) => p.stringIndex === 3 && p.fret === 14)
    );
    expect(highVoicing).toBeDefined();
    expect(highVoicing?.positions).toEqual([
      { stringIndex: 3, fret: 14 },
      { stringIndex: 2, fret: 13 },
      { stringIndex: 1, fret: 13 },
    ]);
  });

  it('solves F Major root position and second inversion on strings 1-2-3', () => {
    // Root position: Root (F) on string 3, Third (A) on string 2, Fifth (C) on string 1
    // String 3: fret 10 (F), String 2: fret 10 (A), String 1: fret 8 (C)
    const rootVoicings = findClosedTriadVoicings(
      5,
      CHORD_MAP['maj'],
      'ROOT',
      [1, 2, 3],
      GUITAR_6_STANDARD
    );
    expect(rootVoicings.length).toBeGreaterThan(0);
    const standardRootPos = rootVoicings.find((v) =>
      v.positions.some((p) => p.stringIndex === 3 && p.fret === 10)
    );
    expect(standardRootPos).toBeDefined();
    expect(standardRootPos?.positions).toEqual([
      { stringIndex: 3, fret: 10 },
      { stringIndex: 2, fret: 10 },
      { stringIndex: 1, fret: 8 },
    ]);

    // 2nd Inversion: Fifth (C) on string 3, Root (F) on string 2, Third (A) on string 1
    // String 3: fret 5 (C), String 2: fret 6 (F), String 1: fret 5 (A)
    const secondVoicings = findClosedTriadVoicings(
      5,
      CHORD_MAP['maj'],
      'SECOND',
      [1, 2, 3],
      GUITAR_6_STANDARD
    );
    const standardSecondPos = secondVoicings.find((v) =>
      v.positions.some((p) => p.stringIndex === 3 && p.fret === 5)
    );
    expect(standardSecondPos).toBeDefined();
    expect(standardSecondPos?.positions).toEqual([
      { stringIndex: 3, fret: 5 },
      { stringIndex: 2, fret: 6 },
      { stringIndex: 1, fret: 5 },
    ]);
  });

  it('includes open strings in triad voicings when span <= 4', () => {
    // E minor triad: E (4), G (7), B (11)
    // On strings 1-2-3:
    // Root position: String 3 (G = 7) is Third? No, root position lowest string has Root (E = 4).
    // Let's check G Major: G (7), B (11), D (2).
    // Root position: String 3 (G = 7, fret 0), String 2 (B = 11, fret 0), String 1 (D = 2, fret 10 or fret -2 no open high E is 4).
    // What about E minor root position on strings 4, 3, 2?
    // String 4 = D (2) -> fret 2 is E (4 = Root)
    // String 3 = G (7) -> fret 0 is G (7 = Third)
    // String 2 = B (11) -> fret 0 is B (11 = Fifth)
    // Span = 2 - 0 = 2 <= 4!
    const emVoicings = findClosedTriadVoicings(
      4, // E
      CHORD_MAP['min'],
      'ROOT',
      [2, 3, 4],
      GUITAR_6_STANDARD
    );
    const openEm = emVoicings.find((v) =>
      v.positions.some((p) => p.stringIndex === 4 && p.fret === 2)
    );
    expect(openEm).toBeDefined();
    expect(openEm?.positions).toEqual([
      { stringIndex: 4, fret: 2 }, // E
      { stringIndex: 3, fret: 0 }, // G
      { stringIndex: 2, fret: 0 }, // B
    ]);
  });

  it('respects fretZone constraints if provided', () => {
    const voicings = findClosedTriadVoicings(
      5, // F
      CHORD_MAP['maj'],
      'FIRST',
      [1, 2, 3],
      GUITAR_6_STANDARD,
      { min: 10, max: 20 }
    );
    // Lower voicing at frets (2, 1, 1) should be excluded
    expect(voicings.some((v) => v.positions.some((p) => p.fret < 10))).toBe(false);
    // Upper voicing at frets (14, 13, 13) should be included
    expect(voicings.some((v) => v.positions.some((p) => p.fret === 14))).toBe(true);
  });
});

describe('getAscendingInversionSequence', () => {
  it('returns the three inversions nearest the nut, ordered up the neck', async () => {
    const { getAscendingInversionSequence, findClosedTriadVoicings } = await import('../../src/core/triadVoicings');
    const { CHORD_MAP, GUITAR_6_STANDARD } = await import('../../src/core/constants');
    // C major on strings 1-2-3
    const voicings = findClosedTriadVoicings(0, CHORD_MAP['maj'], 'ANY', [1, 2, 3], GUITAR_6_STANDARD);
    const byInv = (inv: string) => voicings.filter((v) => v.inversion === inv).map((v) => v.positions);
    const seq = getAscendingInversionSequence({ ROOT: byInv('ROOT'), FIRST: byInv('FIRST'), SECOND: byInv('SECOND') });

    expect(seq).toHaveLength(3);
    // C major on G-B-E: 2nd inv G-C-E (frets 0-1) → root C-E-G (3-5) → 1st inv E-G-C (8-9)
    expect(seq.map((s) => s.inversion)).toEqual(['SECOND', 'ROOT', 'FIRST']);
    const lowest = seq.map((s) => Math.min(...s.positions.map((p) => p.fret)));
    expect(lowest[0]).toBeLessThan(lowest[1]);
    expect(lowest[1]).toBeLessThan(lowest[2]);
    expect(lowest[2]).toBeLessThanOrEqual(12);
  });
});
