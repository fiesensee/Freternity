import { describe, expect, it } from 'vitest';
import { projectFretboard } from '../../src/core/fretboardProjector';
import { FretboardViewState } from '../../src/core/models';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

describe('fretboardProjector', () => {
  it('accurately computes A Aeolian with F Major triad overlay (1st Inversion on strings 1-2-3)', () => {
    const state: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'NOTE_NAME',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 9, // A
        preferFlats: true,
        scaleId: 'aeolian',
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 5, // F
        chordId: 'maj',
        activeInversion: 'FIRST',
      },
      filterMask: {
        activeStrings: [1, 2, 3],
        fretRange: { min: 0, max: 22 },
      },
    };

    const matrix = projectFretboard(state, GUITAR_6_STANDARD);

    // 6 strings, frets 0 through 22 (23 frets per string)
    expect(matrix.length).toBe(6);
    expect(matrix[0].length).toBe(23);

    // 1st Inversion on Strings 1-2-3:
    // String 1 (High E), Fret 1 -> Note F (Root of F Major, b6 of A Aeolian)
    const string1Fret1 = matrix[0][1];
    expect(string1Fret1.noteName).toBe('F');
    expect(string1Fret1.pitchClass).toBe(5);
    expect(string1Fret1.inScaleLayer).toBe(true);
    expect(string1Fret1.scaleDegree).toBe('b6');
    expect(string1Fret1.inTargetLayer).toBe(true);
    expect(string1Fret1.isTargetRoot).toBe(true);
    expect(string1Fret1.targetInterval).toBe('1');
    expect(string1Fret1.isActiveTriadVoicing).toBe(true);
    expect(string1Fret1.visualPriority).toBe('TARGET_ROOT');
    expect(string1Fret1.isMaskedOut).toBe(false);

    // String 2 (B string), Fret 1 -> Note C (Fifth of F Major, b3 of A Aeolian)
    const string2Fret1 = matrix[1][1];
    expect(string2Fret1.noteName).toBe('C');
    expect(string2Fret1.pitchClass).toBe(0);
    expect(string2Fret1.inScaleLayer).toBe(true);
    expect(string2Fret1.scaleDegree).toBe('b3');
    expect(string2Fret1.inTargetLayer).toBe(true);
    expect(string2Fret1.isTargetRoot).toBe(false);
    expect(string2Fret1.targetInterval).toBe('5');
    expect(string2Fret1.isActiveTriadVoicing).toBe(true);
    expect(string2Fret1.visualPriority).toBe('TARGET_TONE');
    expect(string2Fret1.isMaskedOut).toBe(false);

    // String 3 (G string), Fret 2 -> Note A (Third of F Major, 1 of A Aeolian)
    const string3Fret2 = matrix[2][2];
    expect(string3Fret2.noteName).toBe('A');
    expect(string3Fret2.pitchClass).toBe(9);
    expect(string3Fret2.inScaleLayer).toBe(true);
    expect(string3Fret2.scaleDegree).toBe('1');
    expect(string3Fret2.isScaleRoot).toBe(true);
    expect(string3Fret2.inTargetLayer).toBe(true);
    expect(string3Fret2.isTargetRoot).toBe(false);
    expect(string3Fret2.targetInterval).toBe('3');
    expect(string3Fret2.isActiveTriadVoicing).toBe(true);
    expect(string3Fret2.visualPriority).toBe('TARGET_TONE');
    expect(string3Fret2.isMaskedOut).toBe(false);

    // Masked string check: String 6 (Low E)
    const string6Open = matrix[5][0]; // E2
    expect(string6Open.inScaleLayer).toBe(true);
    expect(string6Open.isMaskedOut).toBe(true);
    expect(string6Open.visualPriority).toBe('GHOST');
  });

  it('preserves physical fret coordinates while rotating interval degrees on relative mode shift', () => {
    const cIonianState: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'SCALE_DEGREE',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 0, // C
        preferFlats: true,
        scaleId: 'ionian',
      },
      targetLayer: {
        enabled: false,
        rootPitchClass: 0,
        chordId: 'maj',
      },
      filterMask: {
        activeStrings: [1, 2, 3, 4, 5, 6],
        fretRange: { min: 0, max: 22 },
      },
    };

    const aAeolianState: FretboardViewState = {
      ...cIonianState,
      scaleLayer: {
        ...cIonianState.scaleLayer,
        rootPitchClass: 9, // A
        scaleId: 'aeolian',
      },
    };

    const ionianMatrix = projectFretboard(cIonianState, GUITAR_6_STANDARD);
    const aeolianMatrix = projectFretboard(aAeolianState, GUITAR_6_STANDARD);

    // Verify all notes are identical in pitch and physical fret position
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= 22; f++) {
        const ionianNode = ionianMatrix[s][f];
        const aeolianNode = aeolianMatrix[s][f];

        expect(ionianNode.midiNote).toBe(aeolianNode.midiNote);
        expect(ionianNode.pitchClass).toBe(aeolianNode.pitchClass);
        expect(ionianNode.noteName).toBe(aeolianNode.noteName);
        expect(ionianNode.inScaleLayer).toBe(aeolianNode.inScaleLayer);
      }
    }

    // Check specific interval rotations:
    // 1) Note C (String 2, Fret 1)
    const cNodeIonian = ionianMatrix[1][1];
    const cNodeAeolian = aeolianMatrix[1][1];
    expect(cNodeIonian.scaleDegree).toBe('1');
    expect(cNodeIonian.isScaleRoot).toBe(true);
    expect(cNodeAeolian.scaleDegree).toBe('b3');
    expect(cNodeAeolian.isScaleRoot).toBe(false);

    // 2) Note A (String 3, Fret 2)
    const aNodeIonian = ionianMatrix[2][2];
    const aNodeAeolian = aeolianMatrix[2][2];
    expect(aNodeIonian.scaleDegree).toBe('6');
    expect(aNodeIonian.isScaleRoot).toBe(false);
    expect(aNodeAeolian.scaleDegree).toBe('1');
    expect(aNodeAeolian.isScaleRoot).toBe(true);
  });

  it('renders correct display labels for different label modes', () => {
    const baseState: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'NOTE_NAME',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 9, // A
        preferFlats: true,
        scaleId: 'aeolian',
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 5, // F
        chordId: 'maj',
      },
      filterMask: {
        activeStrings: [1, 2, 3, 4, 5, 6],
        fretRange: { min: 0, max: 22 },
      },
    };

    // NOTE_NAME
    const noteMatrix = projectFretboard({ ...baseState, labelMode: 'NOTE_NAME' });
    expect(noteMatrix[0][1].displayLabel).toBe('F');

    // SCALE_DEGREE
    const scaleMatrix = projectFretboard({ ...baseState, labelMode: 'SCALE_DEGREE' });
    expect(scaleMatrix[0][1].displayLabel).toBe('b6');

    // CHORD_INTERVAL
    const chordMatrix = projectFretboard({ ...baseState, labelMode: 'CHORD_INTERVAL' });
    expect(chordMatrix[0][1].displayLabel).toBe('R'); // Target root gets 'R'
    expect(chordMatrix[1][1].displayLabel).toBe('5'); // Target 5th gets '5'
    expect(chordMatrix[0][0].displayLabel).toBe(''); // Non-target context note (E) must NOT show scale degree '5'

    // G Major in A Natural Minor specifically (bug regression test)
    const gMajorInAMinorState: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'CHORD_INTERVAL',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 9, // A
        scaleId: 'aeolian',
        preferFlats: true,
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 7, // G
        chordId: 'maj', // G - B - D
      },
      filterMask: {
        activeStrings: [1, 2, 3],
        fretRange: { min: 0, max: 22 },
      },
    };

    const gMatrix = projectFretboard(gMajorInAMinorState);
    // String 1 (High E):
    // Fret 0 is E -> NOT in G major -> must be '' (was incorrectly showing '5' from A scale)
    expect(gMatrix[0][0].displayLabel).toBe('');
    // Fret 12 is E -> NOT in G major -> must be '' (was incorrectly showing '5')
    expect(gMatrix[0][12].displayLabel).toBe('');
    // Fret 10 is D -> 5th of G major -> must be '5'
    expect(gMatrix[0][10].displayLabel).toBe('5');
    // String 3 Fret 0 is G -> root of G major -> 'R'
    expect(gMatrix[2][0].displayLabel).toBe('R');
    // String 2 Fret 0 is B -> 3rd of G major -> '3'
    expect(gMatrix[1][0].displayLabel).toBe('3');

    // BLIND_COLOR
    const blindMatrix = projectFretboard({ ...baseState, labelMode: 'BLIND_COLOR' });
    expect(blindMatrix[0][1].displayLabel).toBe('');
  });
});
