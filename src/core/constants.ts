import {
  ChordDefinition,
  InstrumentConfig,
  ScaleDefinition,
} from './models';

// ============================================================================
// DIATONIC MODES
// ============================================================================

export const DIATONIC_MODES: readonly ScaleDefinition[] = [
  {
    id: 'ionian',
    name: 'Major (Ionian)',
    semitones: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    parentMajorOffset: 0,
  },
  {
    id: 'dorian',
    name: 'Dorian',
    semitones: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    parentMajorOffset: 10,
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    semitones: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    parentMajorOffset: 8,
  },
  {
    id: 'lydian',
    name: 'Lydian',
    semitones: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['1', '2', '3', '#4', '5', '6', '7'],
    parentMajorOffset: 7,
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    semitones: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', 'b7'],
    parentMajorOffset: 5,
  },
  {
    id: 'aeolian',
    name: 'Natural Minor (Aeolian)',
    semitones: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    parentMajorOffset: 3,
  },
  {
    id: 'locrian',
    name: 'Locrian',
    semitones: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    parentMajorOffset: 1,
  },
] as const;

export const SCALE_MAP: Readonly<Record<string, ScaleDefinition>> = Object.freeze(
  DIATONIC_MODES.reduce((acc, scale) => {
    acc[scale.id] = scale;
    return acc;
  }, {} as Record<string, ScaleDefinition>)
);

// ============================================================================
// CHORDS (TRIADS)
// ============================================================================

export const CHORD_DEFINITIONS: readonly ChordDefinition[] = [
  {
    id: 'maj',
    name: 'Major Triad',
    symbolSuffix: '',
    semitones: [0, 4, 7],
    degrees: ['1', '3', '5'],
  },
  {
    id: 'min',
    name: 'Minor Triad',
    symbolSuffix: 'm',
    semitones: [0, 3, 7],
    degrees: ['1', 'b3', '5'],
  },
  {
    id: 'dim',
    name: 'Diminished Triad',
    symbolSuffix: '°',
    semitones: [0, 3, 6],
    degrees: ['1', 'b3', 'b5'],
  },
] as const;

export const CHORD_MAP: Readonly<Record<string, ChordDefinition>> = Object.freeze(
  CHORD_DEFINITIONS.reduce((acc, chord) => {
    acc[chord.id] = chord;
    return acc;
  }, {} as Record<string, ChordDefinition>)
);

// ============================================================================
// INSTRUMENT CONFIGURATIONS
// ============================================================================

export const GUITAR_6_STANDARD: InstrumentConfig = {
  id: 'guitar_6_standard',
  name: '6-String Guitar (Standard Tuning)',
  stringCount: 6,
  fretCount: 22,
  /** Tuning ordered from String 1 (High E4 = 64) to String 6 (Low E2 = 40) */
  tuningMidi: [64, 59, 55, 50, 45, 40],
  inlayFrets: [3, 5, 7, 9, 12, 15, 17, 19, 21],
};

export const INSTRUMENT_MAP: Readonly<Record<string, InstrumentConfig>> = Object.freeze({
  [GUITAR_6_STANDARD.id]: GUITAR_6_STANDARD,
});
