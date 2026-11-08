import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateVoicingSelection,
  usePracticeStore,
} from '../../src/store/usePracticeStore';
import { FretPosition } from '../../src/core/models';
import { audioSynthAdapter } from '../../src/adapters/audioSynth';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

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

describe('usePracticeStore guitar (pitch) input', () => {
  beforeEach(() => {
    usePracticeStore.getState().stopPractice();
  });

  const voicingMidis = (voicing: readonly FretPosition[]) =>
    voicing.map((p) => GUITAR_6_STANDARD.tuningMidi[p.stringIndex - 1] + p.fret);

  it('auto-reveals as a match once the correct voicing is played note by note', () => {
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_INVERSION_HUNTER' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;

    const [a, b, c] = voicingMidis(challenge.validVoicings[0]);
    usePracticeStore.getState().registerPlayedNote(a);
    usePracticeStore.getState().registerPlayedNote(b);
    expect(usePracticeStore.getState().engine.phase).toBe('PROMPTING');
    expect(usePracticeStore.getState().userSelections).toHaveLength(2);

    usePracticeStore.getState().registerPlayedNote(c);
    expect(usePracticeStore.getState().engine.phase).toBe('REVEALING');
    expect(usePracticeStore.getState().evaluation?.isMatch).toBe(true);
  });

  it('recovers from a wrong note when the triad is replayed', () => {
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_INVERSION_HUNTER' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    const notes = voicingMidis(challenge.validVoicings[0]);

    usePracticeStore.getState().registerPlayedNote(notes[0] + 1); // wrong
    for (const m of notes) usePracticeStore.getState().registerPlayedNote(m);
    expect(usePracticeStore.getState().evaluation?.isMatch).toBe(true);
  });

  it('marks wrong notes when time runs out', () => {
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_INVERSION_HUNTER' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    const [a, b] = voicingMidis(challenge.validVoicings[0]);

    usePracticeStore.getState().registerPlayedNote(a);
    usePracticeStore.getState().registerPlayedNote(b);
    usePracticeStore.getState().revealNow();

    const evaluation = usePracticeStore.getState().evaluation!;
    expect(evaluation.isMatch).toBe(false);
    expect(evaluation.missedPositions).toHaveLength(1);
  });

  it('ignores notes outside the prompting phase and clears heard notes on advance', () => {
    usePracticeStore.getState().startPractice();
    usePracticeStore.getState().registerPlayedNote(60);
    expect(usePracticeStore.getState().heardNotes).toEqual([60]);
    usePracticeStore.getState().revealNow();
    usePracticeStore.getState().registerPlayedNote(62);
    expect(usePracticeStore.getState().heardNotes).toEqual([60]);
    usePracticeStore.getState().advanceToNextChallenge();
    expect(usePracticeStore.getState().heardNotes).toEqual([]);
  });
});

describe('usePracticeStore live per-note feedback', () => {
  beforeEach(() => {
    usePracticeStore.getState().stopPractice();
  });

  it('marks each played note correct or wrong immediately, without revealing missed notes', () => {
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_INVERSION_HUNTER' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    const voicing = challenge.validVoicings[0];
    const midiOf = (p: FretPosition) => GUITAR_6_STANDARD.tuningMidi[p.stringIndex - 1] + p.fret;

    usePracticeStore.getState().registerPlayedNote(midiOf(voicing[0]));
    let live = usePracticeStore.getState().liveEvaluation!;
    expect(live.correctPositions).toEqual([voicing[0]]);
    expect(live.wrongPositions).toEqual([]);
    expect(usePracticeStore.getState().engine.phase).toBe('PROMPTING');

    // A note a semitone above the 2nd voicing note is not in any shape → wrong right away
    usePracticeStore.getState().registerPlayedNote(midiOf(voicing[1]) + 1);
    live = usePracticeStore.getState().liveEvaluation!;
    expect(live.wrongPositions).toHaveLength(1);

    usePracticeStore.getState().clearUserSelection();
    expect(usePracticeStore.getState().liveEvaluation).toBeNull();
  });
});

describe('usePracticeStore all inversions with guitar input (sequential, nut → 12th fret)', () => {
  beforeEach(() => {
    usePracticeStore.getState().stopPractice();
  });

  const midiOf = (p: FretPosition) => GUITAR_6_STANDARD.tuningMidi[p.stringIndex - 1] + p.fret;

  it('accepts the shapes only in ascending order and gives live feedback per note', async () => {
    const { getAscendingInversionSequence } = await import('../../src/core/triadVoicings');
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_ALL_INVERSIONS' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    const seq = getAscendingInversionSequence(challenge.inversionVoicings!);
    const play = (m: number) => usePracticeStore.getState().registerPlayedNote(m);

    // Playing the 2nd shape first: its notes aren't all in shape 1, so step does not advance
    const onlyInSecond = seq[1].positions.map(midiOf).filter((m) => !seq[0].positions.map(midiOf).includes(m));
    play(onlyInSecond[0]);
    expect(usePracticeStore.getState().inversionStep).toBe(0);
    expect(usePracticeStore.getState().liveEvaluation!.wrongPositions).toHaveLength(1);

    // First note of shape 1 is marked correct right away, at shape 1's position
    play(midiOf(seq[0].positions[0]));
    expect(usePracticeStore.getState().liveEvaluation!.correctPositions).toEqual([seq[0].positions[0]]);

    // Finishing shape 1 locks it in and clears the mistake
    seq[0].positions.slice(1).forEach((p) => play(midiOf(p)));
    let state = usePracticeStore.getState();
    expect(state.inversionStep).toBe(1);
    expect(state.liveEvaluation!.wrongPositions).toEqual([]);
    expect(state.liveEvaluation!.foundInversions).toEqual([seq[0].inversion]);

    seq[1].positions.forEach((p) => play(midiOf(p)));
    seq[2].positions.forEach((p) => play(midiOf(p)));
    state = usePracticeStore.getState();
    expect(state.engine.phase).toBe('REVEALING');
    expect(state.evaluation?.isMatch).toBe(true);
  });

  it('reports the unfinished shapes as missed when time runs out', async () => {
    const { getAscendingInversionSequence } = await import('../../src/core/triadVoicings');
    usePracticeStore.getState().startPractice({ exerciseType: 'TRIAD_ALL_INVERSIONS' });
    const challenge = usePracticeStore.getState().engine.currentChallenge!;
    const seq = getAscendingInversionSequence(challenge.inversionVoicings!);

    seq[0].positions.forEach((p) => usePracticeStore.getState().registerPlayedNote(midiOf(p)));
    usePracticeStore.getState().revealNow();

    const evaluation = usePracticeStore.getState().evaluation!;
    expect(evaluation.isMatch).toBe(false);
    expect(evaluation.foundInversions).toEqual([seq[0].inversion]);
    expect(evaluation.missedPositions).toEqual(
      expect.arrayContaining([...seq[1].positions, ...seq[2].positions])
    );
  });
});
