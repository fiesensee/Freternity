import { IntervalDegree, MidiNote, PitchClass, ScaleDefinition } from './models';
import { SCALE_MAP } from './constants';

// ============================================================================
// BASIC PITCH & FREQUENCY MATH
// ============================================================================

export function midiToPitchClass(midi: MidiNote): PitchClass {
  const pc = ((midi % 12) + 12) % 12;
  return pc as PitchClass;
}

export function midiToOctave(midi: MidiNote): number {
  return Math.floor(midi / 12) - 1;
}

export function midiToFrequencyHz(midi: MidiNote): number {
  // A4 = MIDI 69 = 440 Hz
  return Number((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2));
}

export function semitoneDistance(from: PitchClass, to: PitchClass): number {
  return ((to - from) % 12 + 12) % 12;
}

// ============================================================================
// ENHARMONIC SPELLING & KEY SIGNATURE LOGIC
// ============================================================================

export const CHROMATIC_FLATS: readonly string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export const CHROMATIC_SHARPS: readonly string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

const NATURAL_NOTE_PITCH_CLASSES: Readonly<Record<string, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

const ORDERED_NATURAL_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/**
 * Determines whether a given parent major key uses flats or sharps.
 * Sharp parent keys: G (7), D (2), A (9), E (4), B (11)
 * Flat parent keys: F (5), Bb (10), Eb (3), Ab (8), Db (1)
 * C (0): uses preferFlats (default true for user requirement)
 * F#/Gb (6): uses preferFlats (true = Gb flats, false = F# sharps)
 */
export function isFlatKeySignature(
  parentMajorRoot: PitchClass,
  preferFlats: boolean = true
): boolean {
  switch (parentMajorRoot) {
    case 7: // G
    case 2: // D
    case 9: // A
    case 4: // E
    case 11: // B
      return false;
    case 5: // F
    case 10: // Bb
    case 3: // Eb
    case 8: // Ab
    case 1: // Db
      return true;
    case 6: // F# vs Gb
    case 0: // C
    default:
      return preferFlats;
  }
}

/**
 * Resolves the parent major scale root pitch class for any diatonic mode.
 */
export function getParentMajorRoot(
  modeRoot: PitchClass,
  scaleDefinition: ScaleDefinition
): PitchClass {
  const offset = scaleDefinition.parentMajorOffset ?? 0;
  return (((modeRoot + offset) % 12) + 12) % 12 as PitchClass;
}

/**
 * Resolves the root note name (e.g. "F#" vs "Gb", "Bb" vs "A#").
 */
export function resolveRootNoteName(
  root: PitchClass,
  isFlat: boolean
): string {
  return isFlat ? CHROMATIC_FLATS[root] : CHROMATIC_SHARPS[root];
}

/**
 * Spells the 7 notes of a diatonic scale such that each letter name (A..G) appears exactly once.
 */
export function getDiatonicScaleSpelling(
  rootPitchClass: PitchClass,
  scale: ScaleDefinition,
  preferFlats: boolean = true
): Record<PitchClass, string> {
  const parentMajorRoot = getParentMajorRoot(rootPitchClass, scale);
  const isFlat = isFlatKeySignature(parentMajorRoot, preferFlats);
  const rootName = resolveRootNoteName(rootPitchClass, isFlat);

  // Extract base letter (first character, e.g., 'F' from 'F#')
  const baseLetter = rootName.charAt(0);
  const startLetterIdx = ORDERED_NATURAL_LETTERS.indexOf(baseLetter as any);

  const spelling: Partial<Record<PitchClass, string>> = {};

  for (let degreeIdx = 0; degreeIdx < scale.semitones.length; degreeIdx++) {
    const semitonesFromRoot = scale.semitones[degreeIdx];
    const pitchClass = ((rootPitchClass + semitonesFromRoot) % 12) as PitchClass;

    const letter = ORDERED_NATURAL_LETTERS[(startLetterIdx + degreeIdx) % 7];
    const naturalPitch = NATURAL_NOTE_PITCH_CLASSES[letter];

    // Compute accidental difference between actual pitch class and natural note pitch
    let diff = (pitchClass - naturalPitch + 12) % 12;
    if (diff > 6) diff -= 12; // E.g., -1 for flat, +1 for sharp

    let accidental = '';
    if (diff === 1) accidental = '#';
    else if (diff === 2) accidental = '##';
    else if (diff === -1) accidental = 'b';
    else if (diff === -2) accidental = 'bb';

    spelling[pitchClass] = `${letter}${accidental}`;
  }

  return spelling as Record<PitchClass, string>;
}

/**
 * Gets the note name for any pitch class in the context of an active scale.
 * If in the scale, returns exact diatonic spelling; otherwise falls back to chromatic spelling.
 */
export function getNoteNameInContext(
  pitchClass: PitchClass,
  scaleRoot: PitchClass,
  scale: ScaleDefinition,
  preferFlats: boolean = true
): string {
  const diatonicSpelling = getDiatonicScaleSpelling(scaleRoot, scale, preferFlats);
  if (diatonicSpelling[pitchClass]) {
    return diatonicSpelling[pitchClass];
  }
  const parentMajor = getParentMajorRoot(scaleRoot, scale);
  const isFlat = isFlatKeySignature(parentMajor, preferFlats);
  return isFlat ? CHROMATIC_FLATS[pitchClass] : CHROMATIC_SHARPS[pitchClass];
}

// ============================================================================
// INTERVAL CALCULATIONS
// ============================================================================

const SEMITONE_TO_INTERVAL_DEFAULT: Readonly<Record<number, IntervalDegree>> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: 'b5',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7',
};

export function getIntervalDegree(
  root: PitchClass,
  pitchClass: PitchClass,
  customScale?: ScaleDefinition
): IntervalDegree {
  const distance = semitoneDistance(root, pitchClass);

  if (customScale) {
    const idx = customScale.semitones.indexOf(distance);
    if (idx !== -1 && customScale.degrees[idx]) {
      return customScale.degrees[idx];
    }
  }

  return SEMITONE_TO_INTERVAL_DEFAULT[distance] ?? '1';
}

/**
 * Calculate the relative mode shift.
 * Given a parent scale and degree index, returns the new mode root and mode definition.
 */
export function getRelativeMode(
  parentMajorRoot: PitchClass,
  targetModeId: string
): { root: PitchClass; scale: ScaleDefinition } {
  const scale = SCALE_MAP[targetModeId];
  if (!scale) {
    throw new Error(`Unknown scale id: ${targetModeId}`);
  }
  const offset = scale.parentMajorOffset ?? 0;
  const root = (((parentMajorRoot - offset) % 12 + 12) % 12) as PitchClass;
  return { root, scale };
}

export interface DiatonicTriadInfo {
  degreeIdx: number;
  rootPitch: PitchClass;
  chordId: 'maj' | 'min' | 'dim';
  romanNumeral: string;
}

/**
 * Computes the 7 diatonic triads for a given scale root and scale definition.
 */
export function getDiatonicTriads(
  scaleRoot: PitchClass,
  scaleDef: ScaleDefinition
): DiatonicTriadInfo[] {
  return scaleDef.semitones.map((semi, degreeIdx) => {
    const rootPitch = ((scaleRoot + semi) % 12) as PitchClass;
    const thirdSemi = scaleDef.semitones[(degreeIdx + 2) % 7];
    const thirdDist = (thirdSemi - semi + 12) % 12;
    const fifthSemi = scaleDef.semitones[(degreeIdx + 4) % 7];
    const fifthDist = (fifthSemi - semi + 12) % 12;

    let chordId: 'maj' | 'min' | 'dim' = 'min';
    if (thirdDist === 4 && fifthDist === 7) {
      chordId = 'maj';
    } else if (thirdDist === 3 && fifthDist === 7) {
      chordId = 'min';
    } else if (thirdDist === 3 && fifthDist === 6) {
      chordId = 'dim';
    }

    const romanUpper = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const romanLower = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
    const romanDim = ['i°', 'ii°', 'iii°', 'iv°', 'v°', 'vi°', 'vii°'];

    const roman =
      chordId === 'maj'
        ? romanUpper[degreeIdx]
        : chordId === 'dim'
        ? romanDim[degreeIdx]
        : romanLower[degreeIdx];

    return {
      degreeIdx,
      rootPitch,
      chordId,
      romanNumeral: roman,
    };
  });
}
