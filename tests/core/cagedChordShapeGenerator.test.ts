import { describe, expect, it } from 'vitest';
import { generateCagedChordShapeChallenge } from '../../src/core/drills/cagedChordShapeGenerator';
import { generateChallenge } from '../../src/core/drills/generateChallenge';
import { findCagedChordVoicings } from '../../src/core/cagedChordShapes';
import { GUITAR_6_STANDARD } from '../../src/core/constants';
import { DrillConfig } from '../../src/core/models';
import { DEFAULT_DRILL_CONFIG, evaluateVoicingSelection } from '../../src/store/usePracticeStore';

const gMajor: DrillConfig = {
  ...DEFAULT_DRILL_CONFIG,
  exerciseType: 'CAGED_CHORD_SHAPE',
  scaleContext: { enabled: true, rootPitchClass: 7, preferFlats: false, scaleId: 'ionian' },
};

describe('cagedChordShapeGenerator', () => {
  it('asks for a diatonic major/minor chord in one of the allowed shapes', () => {
    for (let i = 0; i < 40; i++) {
      const c = generateCagedChordShapeChallenge({ ...gMajor, cagedShapes: ['G', 'D'] });
      expect(['G', 'D']).toContain(c.cagedShape);
      expect(c.headlinePrompt).toMatch(/^[A-G][#b]? (Major|Minor) \(\w+\) — [GD] Shape$/);
      // F# diminished (vii°) has no CAGED shape
      expect(c.headlinePrompt).not.toContain('F#');
      expect(c.validVoicings.length).toBeGreaterThan(0);
    }
  });

  it('accepts only the asked shape, not the same chord in a neighbouring shape', () => {
    let c = generateCagedChordShapeChallenge({ ...gMajor, cagedShapes: ['G'] });
    while (!c.headlinePrompt.startsWith('A Minor')) {
      c = generateCagedChordShapeChallenge({ ...gMajor, cagedShapes: ['G'] });
    }
    expect(c.subPrompt).toContain('Root on string 1 (low E)');
    expect(c.solutionNotes.map((n) => `${n.noteName}:${n.interval}:${n.scaleDegree}`)).toEqual([
      'A:1:2',
      'C:b3:4',
      'E:5:6',
    ]);

    const gShape = c.validVoicings[0];
    expect(evaluateVoicingSelection(gShape, c.validVoicings, c.exerciseType)?.isMatch).toBe(true);

    const eShape = findCagedChordVoicings(9, 'min', 'E', GUITAR_6_STANDARD)[0].tones.map(
      ({ stringIndex, fret }) => ({ stringIndex, fret })
    );
    expect(evaluateVoicingSelection(eShape, c.validVoicings, c.exerciseType)?.isMatch).toBe(false);
  });

  it('reveals the shape box on the chord root', () => {
    const c = generateCagedChordShapeChallenge(gMajor);
    expect(c.promptBoardState.targetLayer.enabled).toBe(false);
    expect(c.promptBoardState.filterMask.cagedOverlay).toBeUndefined();
    expect(c.revealBoardState.filterMask.cagedOverlay).toEqual({
      enabled: true,
      shape: c.cagedShape,
      referenceRoot: 'TARGET_ROOT',
    });
  });

  it('is what generateChallenge picks for this drill', () => {
    expect(generateChallenge(gMajor).exerciseType).toBe('CAGED_CHORD_SHAPE');
    expect(generateChallenge(DEFAULT_DRILL_CONFIG).exerciseType).toBe('TRIAD_INVERSION_HUNTER');
  });
});

describe('generateChallenge: no back-to-back repeats', () => {
  const narrowTriads: DrillConfig = {
    ...DEFAULT_DRILL_CONFIG,
    exerciseType: 'TRIAD_INVERSION_HUNTER',
    stringSets: [[1, 2, 3]],
    inversions: ['ROOT'],
  };
  // 6 chords (no dim) × 1 shape: few options, so repeats would be frequent without the guard
  const narrowCaged: DrillConfig = { ...gMajor, cagedShapes: ['E'] };

  for (const [name, config] of [
    ['triad inversion', narrowTriads],
    ['all inversions', { ...narrowTriads, exerciseType: 'TRIAD_ALL_INVERSIONS' as const }],
    ['CAGED chord shape', narrowCaged],
  ] as const) {
    it(`never asks the same ${name} question twice in a row`, () => {
      let previous = generateChallenge(config);
      for (let i = 0; i < 200; i++) {
        const next = generateChallenge(config, GUITAR_6_STANDARD, previous);
        expect(next.questionKey).not.toBe(previous.questionKey);
        previous = next;
      }
    });
  }

  it('the key tells shapes apart for the same chord', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateChallenge({ ...gMajor, cagedShapes: ['G', 'E'] });
      if (c.headlinePrompt.startsWith('A Minor')) keys.add(c.questionKey);
    }
    expect(keys.size).toBe(2);
  });

  it('still returns a question when only one is possible', () => {
    // Frets 3–5 fit exactly one E-shape chord in G major: G at the 3rd fret (3-5-5-4-3-3)
    const single: DrillConfig = { ...gMajor, cagedShapes: ['E'], fretZone: { min: 3, max: 5 } };
    const first = generateChallenge(single);
    const second = generateChallenge(single, GUITAR_6_STANDARD, first);
    expect(first.headlinePrompt).toBe('G Major (I) — E Shape');
    expect(second.questionKey).toBe(first.questionKey);
  });
});
