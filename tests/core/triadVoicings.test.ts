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
