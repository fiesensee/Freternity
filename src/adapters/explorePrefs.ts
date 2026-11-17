import {
  CagedShapeId,
  FretboardViewState,
  NodeLabelMode,
  PitchClass,
  TriadInversion,
} from '../core/models';
import { SCALE_MAP } from '../core/constants';

const STORAGE_KEY = 'freternity.exploreConfig.v1';

/** URL param names that belong to the Explore view state. */
const EXPLORE_PARAM_NAMES = new Set([
  'inst', 'lens',
  'sOn', 'sRoot', 'scale', 'flats',
  'tOn', 'tRoot', 'chord', 'inv', 'roman',
  'strings', 'frets',
  'cagedOn', 'cagedShape', 'cagedRef',
]);

/** Valid node label modes. */
const VALID_LENS: ReadonlySet<NodeLabelMode> = new Set<NodeLabelMode>([
  'NOTE_NAME', 'SCALE_DEGREE', 'CHORD_INTERVAL', 'BLIND_COLOR',
]);

/** Valid CAGED shape IDs. */
const VALID_CAGED_SHAPES: ReadonlySet<CagedShapeId> = new Set<CagedShapeId>([
  'C', 'A', 'G', 'E', 'D',
]);

/** Valid reference root values. */
const VALID_REF_ROOTS: ReadonlySet<string> = new Set(['SCALE_ROOT', 'TARGET_ROOT']);

/** Valid triad inversion values. */
const VALID_INVERSIONS: ReadonlySet<string> = new Set(['ROOT', 'FIRST', 'SECOND', 'ANY']);

/** Clamp an integer to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check whether the URL search params contain any Explore-specific parameters.
 * This prevents unrelated query strings (e.g. utm_source) from blocking localStorage loading.
 */
export function hasExploreParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (EXPLORE_PARAM_NAMES.has(key)) return true;
  }
  return false;
}

/**
 * Validate a loaded FretboardViewState against the current app schema.
 * Unknown or invalid values fall back to the corresponding default.
 */
function validateState(state: unknown, defaults: FretboardViewState): FretboardViewState {
  if (typeof state !== 'object' || state === null) return { ...defaults };

  const s = state as Record<string, unknown>;

  const instrumentId = typeof s.instrumentId === 'string' ? s.instrumentId : defaults.instrumentId;

  const labelMode: NodeLabelMode = VALID_LENS.has(s.labelMode as NodeLabelMode)
    ? (s.labelMode as NodeLabelMode)
    : defaults.labelMode;

  const scaleLayer = (() => {
    const sl = s.scaleLayer as Record<string, unknown> | undefined;
    if (typeof sl !== 'object' || sl === null) return { ...defaults.scaleLayer };
    const rootPc = typeof sl.rootPitchClass === 'number' && sl.rootPitchClass >= 0 && sl.rootPitchClass <= 11
      ? (sl.rootPitchClass as PitchClass)
      : defaults.scaleLayer.rootPitchClass;
    const scaleId = typeof sl.scaleId === 'string' && SCALE_MAP[sl.scaleId]
      ? sl.scaleId
      : defaults.scaleLayer.scaleId;
    return {
      enabled: typeof sl.enabled === 'boolean' ? sl.enabled : defaults.scaleLayer.enabled,
      rootPitchClass: rootPc,
      preferFlats: typeof sl.preferFlats === 'boolean' ? sl.preferFlats : defaults.scaleLayer.preferFlats,
      scaleId,
    };
  })();

  const targetLayer = (() => {
    const tl = s.targetLayer as Record<string, unknown> | undefined;
    if (typeof tl !== 'object' || tl === null) return { ...defaults.targetLayer };
    const tRoot = typeof tl.rootPitchClass === 'number' && tl.rootPitchClass >= 0 && tl.rootPitchClass <= 11
      ? (tl.rootPitchClass as PitchClass)
      : defaults.targetLayer.rootPitchClass;
    const chordId = typeof tl.chordId === 'string' ? tl.chordId : defaults.targetLayer.chordId;
    const inv = typeof tl.activeInversion === 'string' && VALID_INVERSIONS.has(tl.activeInversion)
      ? (tl.activeInversion as TriadInversion | 'ANY')
      : defaults.targetLayer.activeInversion;
    return {
      enabled: typeof tl.enabled === 'boolean' ? tl.enabled : defaults.targetLayer.enabled,
      rootPitchClass: tRoot,
      chordId,
      activeInversion: inv,
      diatonicRomanNumeral: typeof tl.diatonicRomanNumeral === 'string'
        ? tl.diatonicRomanNumeral
        : defaults.targetLayer.diatonicRomanNumeral,
    };
  })();

  const filterMask = (() => {
    const fm = s.filterMask as Record<string, unknown> | undefined;
    if (typeof fm !== 'object' || fm === null) return { ...defaults.filterMask };

    const activeStrings = (() => {
      if (!Array.isArray(fm.activeStrings)) return [...defaults.filterMask.activeStrings];
      const validated = fm.activeStrings.filter(
        (s: unknown) => typeof s === 'number' && s >= 1 && s <= 6
      );
      return validated.length > 0 ? validated : [...defaults.filterMask.activeStrings];
    })();

    const fretRange = (() => {
      const fr = fm.fretRange as Record<string, unknown> | undefined;
      if (typeof fr !== 'object' || fr === null) return { ...defaults.filterMask.fretRange };
      return {
        min: typeof fr.min === 'number' ? clamp(Math.floor(fr.min), 0, 24) : defaults.filterMask.fretRange.min,
        max: typeof fr.max === 'number' ? clamp(Math.floor(fr.max), 0, 24) : defaults.filterMask.fretRange.max,
      };
    })();

    const cagedOverlay = (() => {
      const co = fm.cagedOverlay as Record<string, unknown> | undefined;
      if (typeof co !== 'object' || co === null) return defaults.filterMask.cagedOverlay
        ? { ...defaults.filterMask.cagedOverlay }
        : undefined;
      const shape = typeof co.shape === 'string' && VALID_CAGED_SHAPES.has(co.shape as CagedShapeId)
        ? (co.shape as CagedShapeId)
        : defaults.filterMask.cagedOverlay?.shape ?? 'E';
      const ref = typeof co.referenceRoot === 'string' && VALID_REF_ROOTS.has(co.referenceRoot)
        ? (co.referenceRoot as 'SCALE_ROOT' | 'TARGET_ROOT')
        : defaults.filterMask.cagedOverlay?.referenceRoot ?? 'TARGET_ROOT';
      return {
        enabled: typeof co.enabled === 'boolean' ? co.enabled : (defaults.filterMask.cagedOverlay?.enabled ?? false),
        shape,
        referenceRoot: ref,
      };
    })();

    return { activeStrings, fretRange, cagedOverlay };
  })();

  return { instrumentId, labelMode, scaleLayer, targetLayer, filterMask };
}

/**
 * Load the explore config from localStorage.
 * Returns the stored state (validated) if available, or a copy of `defaults` otherwise.
 * Does NOT check URL params — the caller should decide whether to call this.
 */
export function loadExploreConfig(defaults: FretboardViewState): FretboardViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    return validateState(parsed, defaults);
  } catch {
    // localStorage unavailable (private mode) or corrupt data — use defaults
    return { ...defaults };
  }
}

/**
 * Persist the explore config to localStorage.
 * Silently ignores errors (private mode, quota, etc.).
 */
export function saveExploreConfig(state: FretboardViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — per-viewer convenience only
  }
}