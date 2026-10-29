import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateVoicingSelection,
  usePracticeStore,
} from '../../src/store/usePracticeStore';
import { FretPosition } from '../../src/core/models';
import { audioSynthAdapter } from '../../src/adapters/audioSynth';

describe('usePracticeStore interactive selections & evaluation', () => {
  beforeEach(() => {
    usePracticeStore.getState().stopPractice();
  });

  it('evaluates exact match voicing selection accurately', () => {
    const validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>> = [
      [
        { stringIndex: 3, fret: 2 },
        { stringIndex: 2, fret: 1 },
        { stringIndex: 1, fret: 1 },
      ],
    ];

    const userPicks: FretPosition[] = [
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 1 },
      { stringIndex: 1, fret: 1 },
    ];

    const result = evaluateVoicingSelection(userPicks, validVoicings);
    expect(result).not.toBeNull();
    expect(result?.isMatch).toBe(true);
    expect(result?.correctPositions.length).toBe(3);
    expect(result?.wrongPositions.length).toBe(0);
    expect(result?.missedPositions.length).toBe(0);
  });

  it('evaluates partial and wrong picks accurately', () => {
    const validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>> = [
      [
        { stringIndex: 3, fret: 2 },
        { stringIndex: 2, fret: 1 },
        { stringIndex: 1, fret: 1 },
      ],
    ];

    const userPicks: FretPosition[] = [
      { stringIndex: 3, fret: 2 }, // correct
      { stringIndex: 2, fret: 1 }, // correct
      { stringIndex: 1, fret: 3 }, // wrong (should be 1)
    ];

    const result = evaluateVoicingSelection(userPicks, validVoicings);
    expect(result).not.toBeNull();
    expect(result?.isMatch).toBe(false);
    expect(result?.correctPositions.length).toBe(2);
    expect(result?.wrongPositions.length).toBe(1);
    expect(result?.missedPositions.length).toBe(1);
  });

  it('manages interactive user note placement and string replacement', () => {
    usePracticeStore.getState().startPractice();

    // Place note on String 1, fret 1
    usePracticeStore.getState().toggleUserSelection({ stringIndex: 1, fret: 1 });
    expect(usePracticeStore.getState().userSelections).toEqual([
      { stringIndex: 1, fret: 1 },
    ]);

    // Place note on String 1, fret 3 (should replace fret 1 on string 1)
    usePracticeStore.getState().toggleUserSelection({ stringIndex: 1, fret: 3 });
    expect(usePracticeStore.getState().userSelections).toEqual([
      { stringIndex: 1, fret: 3 },
    ]);

    // Place note on String 2, fret 1 (adds second string note)
    usePracticeStore.getState().toggleUserSelection({ stringIndex: 2, fret: 1 });
    expect(usePracticeStore.getState().userSelections.length).toBe(2);

    // Clicking exact same note toggles it off
    usePracticeStore.getState().toggleUserSelection({ stringIndex: 2, fret: 1 });
    expect(usePracticeStore.getState().userSelections).toEqual([
      { stringIndex: 1, fret: 3 },
    ]);
  });

  it('evaluates selections upon revealNow', () => {
    usePracticeStore.getState().startPractice();
    const challenge = usePracticeStore.getState().engine.currentChallenge;
    expect(challenge).not.toBeNull();

    // Pick the exact first voicing
    const correctVoicing = challenge!.validVoicings[0];
    for (const pos of correctVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }

    usePracticeStore.getState().revealNow();

    const evaluation = usePracticeStore.getState().evaluation;
    expect(evaluation).not.toBeNull();
    expect(evaluation?.isMatch).toBe(true);
  });

  it('automatically stops the drone once reveal is triggered and resumes on next challenge', () => {
    const stopDroneSpy = vi.spyOn(audioSynthAdapter, 'stopDrone');
    const startDroneSpy = vi.spyOn(audioSynthAdapter, 'startDrone');

    // Start practice with drone active
    usePracticeStore.getState().startPractice({ playDrone: true });
    expect(startDroneSpy).toHaveBeenCalled();

    stopDroneSpy.mockClear();

    // Trigger reveal
    usePracticeStore.getState().revealNow();

    // Drone must have been automatically stopped
    expect(stopDroneSpy).toHaveBeenCalled();

    startDroneSpy.mockClear();

    // Advance to next challenge
    usePracticeStore.getState().advanceToNextChallenge();

    // Drone should resume for the new prompt
    expect(startDroneSpy).toHaveBeenCalled();

    stopDroneSpy.mockRestore();
    startDroneSpy.mockRestore();
  });

  it('updates Right/Wrong stats in auto loop mode based on full match vs partial', () => {
    // Test 1: Full match (all notes correct) counts as Right
    usePracticeStore.getState().startPractice({ autoAdvance: true });
    const challenge1 = usePracticeStore.getState().engine.currentChallenge!;
    const correctVoicing = challenge1.validVoicings[0];
    for (const pos of correctVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }
    usePracticeStore.getState().revealNow();
    expect(usePracticeStore.getState().evaluation?.isMatch).toBe(true);

    usePracticeStore.getState().advanceToNextChallenge();
    expect(usePracticeStore.getState().engine.stats).toEqual({
      total: 1,
      passed: 1, // Right
      missed: 0,
    });

    // Test 2: Partial match (only 2/3 notes guessed) counts as Wrong
    const challenge2 = usePracticeStore.getState().engine.currentChallenge!;
    const partialVoicing = challenge2.validVoicings[0].slice(0, 2); // 2 of 3 notes
    for (const pos of partialVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }
    usePracticeStore.getState().revealNow();
    expect(usePracticeStore.getState().evaluation?.isMatch).toBe(false);

    usePracticeStore.getState().advanceToNextChallenge();
    expect(usePracticeStore.getState().engine.stats).toEqual({
      total: 2,
      passed: 1, // Still 1
      missed: 1, // Wrong incremented
    });
  });

  it('handles TRIAD_ALL_INVERSIONS multi-note placement and evaluation', () => {
    usePracticeStore.getState().startPractice({
      exerciseType: 'TRIAD_ALL_INVERSIONS',
      stringSets: [[1, 2, 3]],
    });

    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    expect(challenge.inversionVoicings).toBeDefined();

    const rootVoicing = challenge.inversionVoicings!.ROOT[0];
    const firstVoicing = challenge.inversionVoicings!.FIRST[0];
    const secondVoicing = challenge.inversionVoicings!.SECOND[0];

    // Verify multi-note placement: can place notes from multiple inversions even on the same string
    for (const pos of rootVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }
    for (const pos of firstVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }

    // Should have placed 6 notes across the 3 strings
    expect(usePracticeStore.getState().userSelections.length).toBe(6);

    // Place the 3rd inversion notes (all 3 inversions now found)
    for (const pos of secondVoicing) {
      usePracticeStore.getState().toggleUserSelection(pos);
    }
    expect(usePracticeStore.getState().userSelections.length).toBe(9);

    usePracticeStore.getState().revealNow();
    const evaluation = usePracticeStore.getState().evaluation!;
    expect(evaluation).not.toBeNull();
    expect(evaluation.isMatch).toBe(true);
    expect(evaluation.foundInversions?.length).toBe(3);
    expect(evaluation.missingInversions?.length).toBe(0);
    expect(evaluation.wrongPositions.length).toBe(0);

    // Advance to next challenge updates Right stats
    usePracticeStore.getState().advanceToNextChallenge();
    expect(usePracticeStore.getState().engine.stats.passed).toBe(1);
    expect(usePracticeStore.getState().engine.stats.missed).toBe(0);
  });
});
