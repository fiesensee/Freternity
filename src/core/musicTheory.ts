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
 * For non-diatonic scales (without parentMajorOffset), returns the modeRoot itself.
 */
export function getParentMajorRoot(
  modeRoot: PitchClass,
  scaleDefinition: ScaleDefinition
): PitchClass {
  const offset = scaleDefinition.parentMajorOffset ?? 0;
  return (((modeRoot + offset) % 12) + 12) % 12 as PitchClass;
}

/**
 * Spells a pitch class with the requested accidental style ("Bb" vs "A#").
 * Used for notes that are not already spelled by a key signature.
 */
export function getChromaticNoteName(
  pitchClass: PitchClass,
  preferFlats: boolean = true
): string {
  return preferFlats ? CHROMATIC_FLATS[pitchClass] : CHROMATIC_SHARPS[pitchClass];
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

const DEGREE_LETTER_OFFSET: Readonly<Record<string, number>> = {
  '1': 0,
  b2: 1, '2': 1, '#2': 1,
  b3: 2, '3': 2,
  '4': 3, '#4': 3,
  b5: 4, '5': 4, '#5': 4,
  b6: 5, '6': 5,
  bb7: 6, b7: 6, '7': 6,
};

/**
 * Spells the notes of a scale using degree letter offsets (or sequential letters for 7-note diatonic scales)
 * so each scale degree maps to an appropriate enharmonic name.
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
    const degreeLabel = scale.degrees[degreeIdx];
    const letterOffset =
      scale.semitones.length === 7
        ? degreeIdx
        : (DEGREE_LETTER_OFFSET[degreeLabel] ?? degreeIdx);

    const letter = ORDERED_NATURAL_LETTERS[(startLetterIdx + letterOffset) % 7];
    const naturalPitch = NATURAL_NOTE_PITCH_CLASSES[letter];

    // Compute accidental difference between actual pitch class and natural note pitch
    let diff = (pitchClass - naturalPitch + 12) % 12;
    if (diff > 6) diff -= 12; // E.g., -1 for flat, +1 for sharp

    let accidental = '';
    if (diff === 1) accidental = '#';
    else if (diff === 2) accidental = '##';
    else if (diff === -1) accidental = 'b';
    else if (diff === -2) accidental = 'bb';

    // If two degrees map to the same pitchClass (shouldn't happen in valid scales, but guard), keep first
    if (!spelling[pitchClass]) {
      spelling[pitchClass] = `${letter}${accidental}`;
    }
  }

  return spelling as Record<PitchClass, string>;
}

/**
 * Gets the note name for any pitch class in the context of an active scale.
 * Notes in the scale keep their key-signature spelling; other notes follow the
 * display preference, so the user can read black keys as flats or sharps.
 */
export function getNoteNameInContext(
  pitchClass: PitchClass,
  scaleRoot: PitchClass,
  scale: ScaleDefinition,
  preferFlats: boolean = true
): string {
  const diatonicSpelling = getDiatonicScaleSpelling(scaleRoot, scale, preferFlats);
  return diatonicSpelling[pitchClass] ?? getChromaticNoteName(pitchClass, preferFlats);
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
 * Computes the diatonic triads for a given scale root and scale definition.
 * Only builds 7 triads on 7-note scales; for pentatonic/blues scales returns empty.
 */
export function getDiatonicTriads(
  scaleRoot: PitchClass,
  scaleDef: ScaleDefinition
): DiatonicTriadInfo[] {
  if (scaleDef.semitones.length !== 7) {
    return [];
  }
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

/** Short, readable scale name for labels: "Major", "Minor", "Dorian", … */
export function getScaleShortName(scale: ScaleDefinition): string {
  if (scale.id === 'ionian') return 'Major';
  if (scale.id === 'aeolian') return 'Minor';
  return scale.name;
}

export interface ScaleMatch {
  rootPitchClass: PitchClass;
  scale: ScaleDefinition;
  /** True when the selected pitch classes match the scale's pitch classes 1-to-1. */
  isExact: boolean;
  /** Fraction of the scale's notes covered by the selected notes (0..1). */
  coverage: number;
  /** Number of notes in the scale that were NOT selected. */
  missingCount: number;
}

/**
 * Finds all `(rootPitchClass, scale)` pairs from `scales` (defaulting to all entries
 * in `SCALE_MAP`) whose pitch-class set is a superset of `selectedPitchClasses`.
 *
 * Results are sorted by:
 * 1. Exact matches first (`isExact === true`)
 * 2. Higher coverage / fewer missing scale notes (e.g., 5-note pentatonic beats 7-note major for 5 matching notes)
 * 3. Canonical scale order in `scales`, then ascending root pitch class (0..11)
 */
export function findMatchingScales(
  selectedPitchClasses: readonly PitchClass[],
  scales: readonly ScaleDefinition[] = Object.values(SCALE_MAP)
): ScaleMatch[] {
  // Deduplicate and normalize selected pitch classes
  const uniqueSelected = Array.from(
    new Set(selectedPitchClasses.map((pc) => (((pc % 12) + 12) % 12) as PitchClass))
  );

  if (uniqueSelected.length === 0) {
    return [];
  }

  const scaleOrder = new Map<string, number>();
  scales.forEach((s, idx) => scaleOrder.set(s.id, idx));

  const matches: ScaleMatch[] = [];

  for (const scale of scales) {
    const scaleSize = scale.semitones.length;
    if (uniqueSelected.length > scaleSize) continue;

    for (let root = 0; root < 12; root++) {
      const rootPc = root as PitchClass;
      const scalePitchSet = new Set(
        scale.semitones.map((s) => ((rootPc + s) % 12) as PitchClass)
      );

      const allIncluded = uniqueSelected.every((pc) => scalePitchSet.has(pc));
      if (!allIncluded) continue;

      const missingCount = scalePitchSet.size - uniqueSelected.length;
      const isExact = missingCount === 0;
      const coverage = uniqueSelected.length / scalePitchSet.size;

      matches.push({
        rootPitchClass: rootPc,
        scale,
        isExact,
        coverage,
        missingCount,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    const orderA = scaleOrder.get(a.scale.id) ?? 0;
    const orderB = scaleOrder.get(b.scale.id) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.rootPitchClass - b.rootPitchClass;
  });

  return matches;
}
