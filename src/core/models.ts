// ============================================================================
// 1. PRIMITIVES & MUSIC THEORY TYPES
// ============================================================================

/** Semitone pitch class from 0 (C) to 11 (B) */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Standard MIDI note number (e.g., E2 = 40, A4 = 69) */
export type MidiNote = number;

/** Canonical interval labels relative to a root */
export type IntervalDegree =
  | '1' | 'b2' | '2' | '#2' | 'b3' | '3' | '4' | '#4' | 'b5'
  | '5' | '#5' | 'b6' | '6' | 'bb7' | 'b7' | '7';

export type CagedShapeId = 'C' | 'A' | 'G' | 'E' | 'D';

export type TriadInversion = 'ROOT' | 'FIRST' | 'SECOND';

export type NodeLabelMode = 'NOTE_NAME' | 'SCALE_DEGREE' | 'CHORD_INTERVAL' | 'BLIND_COLOR';

export interface ScaleDefinition {
  id: string;                      // e.g., "aeolian", "ionian", "dorian"
  name: string;                    // e.g., "Natural Minor (Aeolian)"
  semitones: readonly number[];    // e.g., [0, 2, 3, 5, 7, 8, 10]
  degrees: readonly IntervalDegree[]; // e.g., ['1', '2', 'b3', '4', '5', 'b6', 'b7']
  parentMajorOffset?: number;      // Semitone offset to relative Ionian (e.g., +3 for Aeolian)
}

export interface ChordDefinition {
  id: string;                      // e.g., "maj", "min"
  name: string;                    // e.g., "Minor Triad"
  symbolSuffix: string;            // e.g., "m", ""
  semitones: readonly number[];    // e.g., [0, 3, 7]
  degrees: readonly IntervalDegree[]; // e.g., ['1', 'b3', '5']
}

// ============================================================================
// 2. INSTRUMENT & FRETBOARD TOPOLOGY
// ============================================================================

export interface InstrumentConfig {
  id: string;                      // e.g., "guitar_6_standard"
  name: string;
  stringCount: number;             // 6
  fretCount: number;               // Typically 15, 22, or 24
  /** Tuning ordered from String 1 (highest pitch, e.g., E4=64) to String 6 (lowest, E2=40) */
  tuningMidi: readonly MidiNote[];
  inlayFrets: readonly number[];   // [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]
}

export interface FretPosition {
  stringIndex: number;             // 1-based index: 1 = High E, 6 = Low E
  fret: number;                    // 0 = Open nut, 1..N = Frets
}

// ============================================================================
// 3. LAYERED FRETBOARD STATE & COMPUTED RENDER MATRIX
// ============================================================================

export interface ScaleLayerConfig {
  enabled: boolean;
  rootPitchClass: PitchClass;
  preferFlats: boolean;            // Enharmonic spelling preference (e.g., Bb vs A#)
  scaleId: string;
}

export interface TargetLayerConfig {
  enabled: boolean;
  rootPitchClass: PitchClass;
  chordId: string;                 // e.g., "min", "maj"
  diatonicRomanNumeral?: string;   // Optional context badge, e.g., "iv", "V"
  activeInversion?: TriadInversion | 'ANY';
}

export interface FilterMaskConfig {
  /** Set of active string numbers (1..6). Strings omitted are visually dimmed. */
  activeStrings: readonly number[];
  fretRange: { min: number; max: number };
  cagedOverlay?: {
    enabled: boolean;
    shape: CagedShapeId;
    referenceRoot: 'SCALE_ROOT' | 'TARGET_ROOT';
  };
}

/**
 * The complete declarative state of the Fretboard Visualizer.
 * Must be 100% serializable to JSON / URL query parameters.
 */
export interface FretboardViewState {
  instrumentId: string;
  labelMode: NodeLabelMode;
  scaleLayer: ScaleLayerConfig;
  targetLayer: TargetLayerConfig;
  filterMask: FilterMaskConfig;
}

/**
 * Computed output for a single (string, fret) intersection.
 * Produced by the pure FretboardProjector function and consumed by the SVG UI.
 */
export interface ComputedFretNode {
  position: FretPosition;
  midiNote: MidiNote;
  pitchClass: PitchClass;
  noteName: string;                // Enharmonically spelled note name, e.g., "F#" or "Gb"
  octave: number;
  frequencyHz: number;             // Precomputed for WebAudio playback & v2 pitch detection

  // Layer Membership Flags
  inScaleLayer: boolean;
  scaleDegree?: IntervalDegree;    // Relative to Scale Root
  isScaleRoot: boolean;

  inTargetLayer: boolean;
  targetInterval?: IntervalDegree; // Relative to Target Chord Root (e.g., '1', 'b3', '5')
  isTargetRoot: boolean;
  isActiveTriadVoicing: boolean;   // True if part of the specifically isolated inversion shape

  // Geometric / Filter Metadata
  inCagedStencil: boolean;
  isMaskedOut: boolean;            // True if dimmed by string mask or fret range
  visualPriority: 'HIDDEN' | 'GHOST' | 'CONTEXT_SCALE' | 'TARGET_TONE' | 'TARGET_ROOT';
  displayLabel: string;            // Resolved text to render inside the SVG circle
}

// ============================================================================
// 4. PRACTICE / DRILL ENGINE MODELS
// ============================================================================

export type DrillPhase = 'IDLE' | 'PROMPTING' | 'REVEALING' | 'PAUSED' | 'SUMMARY';

export interface DrillNoteInfo {
  pitchClass: PitchClass;
  noteName: string;
  interval: IntervalDegree;
  role: 'Root' | '3rd' | '5th';
}

export interface VoicingStringNote {
  stringIndex: number;
  fret: number;
  pitchClass: PitchClass;
  noteName: string;
  interval: IntervalDegree;
  role: 'Root' | '3rd' | '5th';
}

export interface DrillChallenge {
  id: string;
  exerciseType?: 'TRIAD_INVERSION_HUNTER' | 'TRIAD_ALL_INVERSIONS' | 'SCALE_DEGREE_FINDER' | 'CAGED_ARPEGGIO_LINK';
  headlinePrompt: string;          // e.g., "D Minor Triad — 1st Inversion"
  subPrompt: string;               // e.g., "Strings 1-2-3 | Parent Key: A Aeolian (iv)"
  targetPitchClasses: readonly PitchClass[];
  /** Detailed constituent triad notes with enharmonic names and interval roles */
  solutionNotes: readonly DrillNoteInfo[];
  /** Voicing breakdown per string ordered from lowest pitch string to highest */
  voicingNotes?: readonly VoicingStringNote[];
  /** Specific (string, fret) coordinates that satisfy the drill */
  validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>>;
  /** For all-inversions drill: map of inversion to all valid voicings of that inversion */
  inversionVoicings?: Record<TriadInversion, ReadonlyArray<readonly FretPosition[]>>;
  /** The FretboardViewState to apply during the PROMPTING phase (masked/blank) */
  promptBoardState: FretboardViewState;
  /** The FretboardViewState to apply during the REVEALING phase (solution highlighted) */
  revealBoardState: FretboardViewState;
}

export interface DrillConfig {
  exerciseType: 'TRIAD_INVERSION_HUNTER' | 'TRIAD_ALL_INVERSIONS' | 'SCALE_DEGREE_FINDER' | 'CAGED_ARPEGGIO_LINK';
  scaleContext: ScaleLayerConfig;
  stringSets: ReadonlyArray<readonly number[]>; // e.g., [[1, 2, 3], [2, 3, 4]]
  inversions: readonly TriadInversion[];
  fretZone: { min: number; max: number };
  promptDurationMs: number;        // e.g., 8000
  revealDurationMs: number;        // e.g., 4000
  autoAdvance: boolean;
  playDrone: boolean;
  playSolutionAudioOnReveal: boolean;
}
