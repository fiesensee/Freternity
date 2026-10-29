import { describe, expect, it } from 'vitest';
import { generateTriadInversionChallenge } from '../../src/core/drills/triadInversionGenerator';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

describe('triadInversionGenerator', () => {
  it('generates a valid diatonic triad challenge in A Aeolian', () => {
    const challenge = generateTriadInversionChallenge(DEFAULT_DRILL_CONFIG, GUITAR_6_STANDARD);

    expect(challenge.id).toBeDefined();
    expect(challenge.headlinePrompt).toContain('Triad');
    expect(challenge.subPrompt).toContain('Strings 1-2-3');
    expect(challenge.targetPitchClasses.length).toBe(3);
    expect(challenge.validVoicings.length).toBeGreaterThan(0);

    // Solution notes by name with interval degree & role
    expect(challenge.solutionNotes).toBeDefined();
    expect(challenge.solutionNotes.length).toBe(3);
    expect(challenge.solutionNotes.map((n) => n.role)).toEqual(['Root', '3rd', '5th']);
    for (const note of challenge.solutionNotes) {
      expect(note.noteName).toBeTruthy();
      expect(note.interval).toBeTruthy();
    }

    // Voicing breakdown by string
    expect(challenge.voicingNotes).toBeDefined();
    expect(challenge.voicingNotes?.length).toBe(3);
    for (const vn of challenge.voicingNotes!) {
      expect(vn.noteName).toBeTruthy();
      expect([1, 2, 3]).toContain(vn.stringIndex);
    }

    // Prompt state should hide the target layer
    expect(challenge.promptBoardState.targetLayer.enabled).toBe(false);

    // Reveal state should enable target layer with the chord
    expect(challenge.revealBoardState.targetLayer.enabled).toBe(true);
    expect(challenge.revealBoardState.targetLayer.activeInversion).toBeDefined();
  });

  it('respects custom string sets in generated challenge', () => {
    const customConfig = {
      ...DEFAULT_DRILL_CONFIG,
      stringSets: [[2, 3, 4]],
      inversions: ['ROOT'] as const,
    };

    const challenge = generateTriadInversionChallenge(customConfig, GUITAR_6_STANDARD);
    expect(challenge.subPrompt).toContain('Strings 2-3-4');
    expect(challenge.headlinePrompt).toContain('Root Position');

    // All valid voicings must be on strings 2, 3, 4
    for (const voicing of challenge.validVoicings) {
      const strings = voicing.map((p) => p.stringIndex).sort((a, b) => a - b);
      expect(strings).toEqual([2, 3, 4]);
    }
  });

  it('ensures all triads in A Natural Minor are strictly diatonic with correct Roman numerals', () => {
    const aAeolianNotes = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    for (let i = 0; i < 40; i++) {
      const challenge = generateTriadInversionChallenge(DEFAULT_DRILL_CONFIG, GUITAR_6_STANDARD);
      // Every note in solutionNotes must be in A Aeolian
      for (const note of challenge.solutionNotes) {
        expect(aAeolianNotes.has(note.noteName)).toBe(true);
      }

      // If B is the root, it must be B Diminished (ii°) with notes B, D, F (never Bm or Gb)
      if (challenge.targetPitchClasses[0] === 11) {
        expect(challenge.headlinePrompt).toContain('Diminished');
        expect(challenge.headlinePrompt).toContain('ii°');
        expect(challenge.solutionNotes.map((n) => n.noteName)).toEqual(['B', 'D', 'F']);
      }
    }
  });

  it('generates a valid TRIAD_ALL_INVERSIONS challenge with all 3 inversions', () => {
    const config = {
      ...DEFAULT_DRILL_CONFIG,
      exerciseType: 'TRIAD_ALL_INVERSIONS' as const,
      stringSets: [[1, 2, 3]],
    };

    const challenge = generateTriadInversionChallenge(config, GUITAR_6_STANDARD);
    expect(challenge.headlinePrompt).toContain('All Inversions');
    expect(challenge.subPrompt).toContain('Mark Root Pos, 1st Inv & 2nd Inv');
    expect(challenge.inversionVoicings).toBeDefined();
    expect(challenge.inversionVoicings?.ROOT.length).toBeGreaterThan(0);
    expect(challenge.inversionVoicings?.FIRST.length).toBeGreaterThan(0);
    expect(challenge.inversionVoicings?.SECOND.length).toBeGreaterThan(0);
  });
});
