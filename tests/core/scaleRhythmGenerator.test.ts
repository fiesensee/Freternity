import { describe, expect, it } from 'vitest';
import { generateScaleRhythmChallenge } from '../../src/core/drills/scaleRhythmGenerator';
import { generateChallenge } from '../../src/core/drills/generateChallenge';
import { GUITAR_6_STANDARD } from '../../src/core/constants';
import { DrillConfig } from '../../src/core/models';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';
import { projectFretboard } from '../../src/core/fretboardProjector';
import { DIATONIC_MODES } from '../../src/core/constants';
import { PitchClass } from '../../src/core/models';

const gMajorE: DrillConfig = {
  ...DEFAULT_DRILL_CONFIG,
  exerciseType: 'SCALE_RHYTHM',
  scaleContext: { enabled: true, rootPitchClass: 7, preferFlats: false, scaleId: 'ionian' },
  cagedShapes: ['E'],
  rhythm: { bpm: 80, subdivision: 2, pattern: 'STRAIGHT' },
};

describe('scaleRhythmGenerator', () => {
  it('plans the position up and back down, one note per slot', () => {
    const c = generateScaleRhythmChallenge(gMajorE);
    const { expected } = c.rhythm!;
    expect(expected).toHaveLength(17 * 2 - 1);
    expect(expected.map((e) => e.slot)).toEqual(expected.map((_, i) => i));
    expect(expected[16].midi).toBe(Math.max(...expected.map((e) => e.midi))); // turnaround
    expect(expected[0].midi).toBe(expected[32].midi); // back where it started
    expect(c.headlinePrompt).toBe('G Major — E Shape');
    expect(c.subPrompt).toContain('eighths at 80 bpm');
    expect(c.subPrompt).toContain('Start on F# (string 1, fret 2)');
  });

  it('plays the position in diatonic thirds and mirrors them back down', () => {
    const straight = generateScaleRhythmChallenge(gMajorE);
    const up = straight.rhythm!.expected.slice(0, 17);
    const thirds = generateScaleRhythmChallenge({
      ...gMajorE,
      rhythm: { ...gMajorE.rhythm, pattern: 'THIRDS' },
    });
    const { expected } = thirds.rhythm!;

    // 1-3-2-4-3-5... up, then the mirrored thirds back down (top note shared)
    expect(expected).toHaveLength(2 * (17 - 2) * 2 - 1);
    expect(expected.slice(0, 6).map((e) => e.midi)).toEqual(
      [up[0], up[2], up[1], up[3], up[2], up[4]].map((e) => e.midi)
    );
    // Turn-around is the top note
    expect(expected[29].midi).toBe(up[16].midi);
    // n-2, n-1, n-3, n-2... back down to the lowest note
    expect(expected.slice(30, 34).map((e) => e.midi)).toEqual(
      [up[14], up[15], up[13], up[14]].map((e) => e.midi)
    );
    expect(expected[expected.length - 1].midi).toBe(up[0].midi);
    expect(thirds.subPrompt).toContain('In thirds in eighths at 80 bpm');
  });

  it('shows the position the whole time: box on the scale root, scale degrees, outside ghosted', () => {
    const c = generateScaleRhythmChallenge(gMajorE);
    expect(c.promptBoardState).toEqual(c.revealBoardState);
    expect(c.promptBoardState.labelMode).toBe('SCALE_DEGREE');
    // The E-shape box is frets 2–6, but G major uses nothing on fret 6
    expect(c.promptBoardState.filterMask.fretRange).toEqual({ min: 2, max: 5 });
    expect(c.promptBoardState.filterMask.cagedOverlay).toEqual({
      enabled: true,
      shape: 'E',
      referenceRoot: 'SCALE_ROOT',
    });
  });

  it('cycles positions without repeating one twice in a row', () => {
    const config = { ...gMajorE, cagedShapes: ['C', 'A', 'G', 'E', 'D'] as const };
    let prev = generateChallenge({ ...config, cagedShapes: [...config.cagedShapes] });
    for (let i = 0; i < 50; i++) {
      const next = generateChallenge({ ...config, cagedShapes: [...config.cagedShapes] }, GUITAR_6_STANDARD, prev);
      expect(next.exerciseType).toBe('SCALE_RHYTHM');
      expect(next.cagedShape).not.toBe(prev.cagedShape);
      prev = next;
    }
  });

  it('shows exactly the planned notes, one per pitch, in every key, mode and shape', () => {
    for (const mode of DIATONIC_MODES) {
      for (let root = 0; root < 12; root++) {
        for (const shape of ['C', 'A', 'G', 'E', 'D'] as const) {
          const c = generateScaleRhythmChallenge({
            ...gMajorE,
            scaleContext: { enabled: true, rootPitchClass: root as PitchClass, preferFlats: false, scaleId: mode.id },
            cagedShapes: [shape],
          });
          const lit = projectFretboard(c.promptBoardState, GUITAR_6_STANDARD)
            .flat()
            .filter((n) => n.inScaleLayer && !n.isMaskedOut);
          const up = c.rhythm!.expected.slice(0, (c.rhythm!.expected.length + 1) / 2);
          expect(lit.map((n) => `${n.position.stringIndex}-${n.position.fret}`).sort()).toEqual(
            up.map((e) => `${e.stringIndex}-${e.fret}`).sort()
          );
          expect(new Set(lit.map((n) => n.midiNote)).size).toBe(lit.length);
        }
      }
    }
  });
});
