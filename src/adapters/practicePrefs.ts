import {
  CagedShapeId,
  DrillConfig,
  ExerciseType,
  RhythmSubdivision,
  ScaleRhythmPattern,
  TriadInversion,
} from '../core/models';
import { DIATONIC_MODES } from '../core/constants';
import { ALL_CAGED_SHAPES } from '../core/drills/cagedChordShapeGenerator';

const STORAGE_KEY = 'freternity.practiceConfig.v1';

/** Set of exercise types that exist in the current version. */
const VALID_EXERCISE_TYPES: ReadonlySet<ExerciseType> = new Set<ExerciseType>([
  'TRIAD_INVERSION_HUNTER',
  'TRIAD_ALL_INVERSIONS',
  'CAGED_CHORD_SHAPE',
  'SCALE_RHYTHM',
  'SCALE_DEGREE_FINDER',
  'CAGED_ARPEGGIO_LINK',
]);

/** Set of valid scale (mode) IDs. */
const VALID_SCALE_IDS: ReadonlySet<string> = new Set(
  DIATONIC_MODES.map((m) => m.id)
);

/** Set of valid CAGED shape IDs. */
const VALID_CAGED_SHAPES: ReadonlySet<CagedShapeId> = new Set(ALL_CAGED_SHAPES);

/** Set of valid triad inversion IDs. */
const VALID_INVERSIONS: ReadonlySet<TriadInversion> = new Set<TriadInversion>([
  'ROOT',
  'FIRST',
  'SECOND',
]);

/** Set of valid rhythm subdivisions. */
const VALID_SUBDIVISIONS: ReadonlySet<number> = new Set<number>([1, 2, 3, 4]);

/** Set of valid scale-in-time note patterns. */
const VALID_SCALE_PATTERNS: ReadonlySet<ScaleRhythmPattern> = new Set<ScaleRhythmPattern>([
  'STRAIGHT',
  'THIRDS',
]);

/** Clamp an integer to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate a loaded DrillConfig against the current app schema.
 * Invalid or unknown values are replaced with the corresponding default.
 */
function validateConfig(config: unknown, defaults: DrillConfig): DrillConfig {
  if (typeof config !== 'object' || config === null) return { ...defaults };

  const c = config as Record<string, unknown>;

  const exerciseType: ExerciseType = VALID_EXERCISE_TYPES.has(c.exerciseType as ExerciseType)
    ? (c.exerciseType as ExerciseType)
    : defaults.exerciseType;

  const scaleContext = (() => {
    const sc = c.scaleContext as Record<string, unknown> | undefined;
    if (typeof sc !== 'object' || sc === null) return { ...defaults.scaleContext };
    const rootPc = typeof sc.rootPitchClass === 'number' && sc.rootPitchClass >= 0 && sc.rootPitchClass <= 11
      ? (sc.rootPitchClass as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11)
      : defaults.scaleContext.rootPitchClass;
    const scaleId = VALID_SCALE_IDS.has(sc.scaleId as string)
      ? (sc.scaleId as string)
      : defaults.scaleContext.scaleId;
    return {
      enabled: typeof sc.enabled === 'boolean' ? sc.enabled : defaults.scaleContext.enabled,
      rootPitchClass: rootPc,
      preferFlats: typeof sc.preferFlats === 'boolean' ? sc.preferFlats : defaults.scaleContext.preferFlats,
      scaleId,
    };
  })();

  const stringSets = (() => {
    if (!Array.isArray(c.stringSets)) return [...defaults.stringSets];
    const validated = c.stringSets.filter(
      (set): set is readonly number[] =>
        Array.isArray(set) &&
        set.length > 0 &&
        set.every((s: unknown) => typeof s === 'number' && s >= 1 && s <= 6)
    );
    return validated.length > 0 ? validated : [...defaults.stringSets];
  })();

  const inversions = (() => {
    if (!Array.isArray(c.inversions)) return [...defaults.inversions];
    const validated = c.inversions.filter((i: unknown) => VALID_INVERSIONS.has(i as TriadInversion));
    return validated.length > 0 ? validated : [...defaults.inversions];
  })();

  const cagedShapes = (() => {
    if (!Array.isArray(c.cagedShapes)) return [...defaults.cagedShapes];
    const validated = c.cagedShapes.filter((s: unknown) => VALID_CAGED_SHAPES.has(s as CagedShapeId));
    return validated.length > 0 ? validated : [...defaults.cagedShapes];
  })();

  const rhythm = (() => {
    const r = c.rhythm as Record<string, unknown> | undefined;
    if (typeof r !== 'object' || r === null) return { ...defaults.rhythm };
    return {
      bpm: typeof r.bpm === 'number' ? clamp(r.bpm, 20, 300) : defaults.rhythm.bpm,
      subdivision: VALID_SUBDIVISIONS.has(r.subdivision as number)
        ? (r.subdivision as RhythmSubdivision)
        : defaults.rhythm.subdivision,
      pattern: VALID_SCALE_PATTERNS.has(r.pattern as ScaleRhythmPattern)
        ? (r.pattern as ScaleRhythmPattern)
        : defaults.rhythm.pattern,
    };
  })();

  const fretZone = (() => {
    const fz = c.fretZone as Record<string, unknown> | undefined;
    if (typeof fz !== 'object' || fz === null) return { ...defaults.fretZone };
    return {
      min: typeof fz.min === 'number' ? clamp(Math.floor(fz.min), 0, 24) : defaults.fretZone.min,
      max: typeof fz.max === 'number' ? clamp(Math.floor(fz.max), 0, 24) : defaults.fretZone.max,
    };
  })();

  return {
    exerciseType,
    scaleContext,
    stringSets,
    inversions,
    cagedShapes,
    rhythm,
    fretZone,
    promptDurationMs: typeof c.promptDurationMs === 'number'
      ? clamp(c.promptDurationMs, 1000, 300000)
      : defaults.promptDurationMs,
    revealDurationMs: typeof c.revealDurationMs === 'number'
      ? clamp(c.revealDurationMs, 500, 60000)
      : defaults.revealDurationMs,
    autoAdvance: typeof c.autoAdvance === 'boolean' ? c.autoAdvance : defaults.autoAdvance,
    playDrone: typeof c.playDrone === 'boolean' ? c.playDrone : defaults.playDrone,
    playSolutionAudioOnReveal: typeof c.playSolutionAudioOnReveal === 'boolean'
      ? c.playSolutionAudioOnReveal
      : defaults.playSolutionAudioOnReveal,
  };
}

/**
 * Load the practice config from localStorage.
 * Returns the stored config (validated) if available, or a copy of `defaults` otherwise.
 */
export function loadPracticeConfig(defaults: DrillConfig): DrillConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    return validateConfig(parsed, defaults);
  } catch {
    // localStorage unavailable (private mode) or corrupt data — use defaults
    return { ...defaults };
  }
}

/**
 * Persist the practice config to localStorage.
 * Silently ignores errors (private mode, quota, etc.).
 */
export function savePracticeConfig(config: DrillConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage unavailable — per-viewer convenience only
  }
}