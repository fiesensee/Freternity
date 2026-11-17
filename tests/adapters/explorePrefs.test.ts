import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasExploreParams,
  loadExploreConfig,
  saveExploreConfig,
} from '../../src/adapters/explorePrefs';
import { DEFAULT_FRETBOARD_STATE } from '../../src/store/useFretboardStore';
import { FretboardViewState } from '../../src/core/models';

// ---------------------------------------------------------------------------
// localStorage mock (vitest environment is 'node')
// ---------------------------------------------------------------------------

const store = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn((i: number) => [...store.keys()][i] ?? null),
};

vi.stubGlobal('localStorage', mockStorage);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-ish clone of FretboardViewState (handles nested objects/arrays). */
function cloneState(s: FretboardViewState): FretboardViewState {
  return JSON.parse(JSON.stringify(s));
}

/** Build a full FretboardViewState from partial overrides. */
function makeState(overrides?: Partial<FretboardViewState>): FretboardViewState {
  return { ...cloneState(DEFAULT_FRETBOARD_STATE), ...overrides } as FretboardViewState;
}

describe('explorePrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // Round-trip
  // -----------------------------------------------------------------------

  it('round-trips a full FretboardViewState losslessly', () => {
    const state: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'CHORD_INTERVAL',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 7,
        preferFlats: false,
        scaleId: 'mixolydian',
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 2,
        chordId: 'min',
        activeInversion: 'FIRST',
        diatonicRomanNumeral: 'ii',
      },
      filterMask: {
        activeStrings: [1, 2, 3],
        fretRange: { min: 5, max: 9 },
        cagedOverlay: {
          enabled: true,
          shape: 'D',
          referenceRoot: 'SCALE_ROOT',
        },
      },
    };

    saveExploreConfig(state);
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);

    expect(loaded).toEqual(state);
  });

  // -----------------------------------------------------------------------
  // Returns defaults when nothing is stored
  // -----------------------------------------------------------------------

  it('returns a copy of defaults when localStorage is empty', () => {
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded).toEqual(DEFAULT_FRETBOARD_STATE);
    // Must be a different reference
    expect(loaded).not.toBe(DEFAULT_FRETBOARD_STATE);
  });

  // -----------------------------------------------------------------------
  // Validation fallback on corrupt / unknown data
  // -----------------------------------------------------------------------

  it('falls back to defaults for corrupt JSON', () => {
    localStorage.setItem('freternity.exploreConfig.v1', 'not-json');
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded).toEqual(DEFAULT_FRETBOARD_STATE);
  });

  it('falls back to defaults for non-object JSON', () => {
    localStorage.setItem('freternity.exploreConfig.v1', '42');
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded).toEqual(DEFAULT_FRETBOARD_STATE);
  });

  it('falls back to defaults for null JSON', () => {
    localStorage.setItem('freternity.exploreConfig.v1', 'null');
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded).toEqual(DEFAULT_FRETBOARD_STATE);
  });

  it('replaces an unknown label mode with the default', () => {
    const stored = makeState({ labelMode: 'SILLY_MODE' as never });
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.labelMode).toBe(DEFAULT_FRETBOARD_STATE.labelMode);
  });

  it('replaces an unknown scaleId with the default', () => {
    const stored = makeState();
    stored.scaleLayer.scaleId = 'superlydian';
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.scaleLayer.scaleId).toBe(DEFAULT_FRETBOARD_STATE.scaleLayer.scaleId);
  });

  it('replaces an invalid rootPitchClass with the default', () => {
    const stored = makeState();
    (stored.scaleLayer as unknown as Record<string, unknown>).rootPitchClass = 42;
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.scaleLayer.rootPitchClass).toBe(DEFAULT_FRETBOARD_STATE.scaleLayer.rootPitchClass);
  });

  it('replaces an unknown CAGED shape with the default', () => {
    const stored = makeState();
    stored.filterMask.cagedOverlay = { enabled: true, shape: 'Z' as never, referenceRoot: 'TARGET_ROOT' };
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.filterMask.cagedOverlay?.shape).toBe('E');
  });

  it('replaces an unknown referenceRoot with the default', () => {
    const stored = makeState();
    stored.filterMask.cagedOverlay = { enabled: true, shape: 'A', referenceRoot: 'INVALID' as never };
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.filterMask.cagedOverlay?.referenceRoot).toBe('TARGET_ROOT');
  });

  it('clamps extreme fretRange values', () => {
    const stored = makeState();
    stored.filterMask.fretRange = { min: -10, max: 50 };
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.filterMask.fretRange.min).toBe(0);
    expect(loaded.filterMask.fretRange.max).toBe(24);
  });

  it('filters out invalid activeStrings', () => {
    const stored = makeState();
    stored.filterMask.activeStrings = [1, 2, 7, 0, 3];
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.filterMask.activeStrings).toEqual([1, 2, 3]);
  });

  it('falls back to default activeStrings when all are invalid', () => {
    const stored = makeState();
    stored.filterMask.activeStrings = [0, 7, 8];
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.filterMask.activeStrings).toEqual(DEFAULT_FRETBOARD_STATE.filterMask.activeStrings);
  });

  it('replaces an unknown inversion with the default', () => {
    const tl = { ...cloneState(DEFAULT_FRETBOARD_STATE).targetLayer, activeInversion: 'TERTIARY' as never };
    const stored = makeState({ targetLayer: tl });
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.targetLayer.activeInversion).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Graceful behaviour when localStorage throws (private mode)
  // -----------------------------------------------------------------------

  it('returns defaults when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(mockStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'InvalidStateError');
    });
    try {
      const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
      expect(loaded).toEqual(DEFAULT_FRETBOARD_STATE);
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('silently ignores errors when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'InvalidStateError');
    });
    try {
      expect(() => saveExploreConfig(DEFAULT_FRETBOARD_STATE)).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('silently ignores quota errors on save', () => {
    const setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    try {
      expect(() => saveExploreConfig(DEFAULT_FRETBOARD_STATE)).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  // -----------------------------------------------------------------------
  // hasExploreParams
  // -----------------------------------------------------------------------

  it('detects Explore-specific URL params', () => {
    expect(hasExploreParams(new URLSearchParams('lens=SCALE_DEGREE&sRoot=5'))).toBe(true);
    expect(hasExploreParams(new URLSearchParams('cagedShape=A'))).toBe(true);
    expect(hasExploreParams(new URLSearchParams('frets=3-8'))).toBe(true);
    expect(hasExploreParams(new URLSearchParams('strings=1,2,3'))).toBe(true);
  });

  it('returns false for unrelated URL params', () => {
    expect(hasExploreParams(new URLSearchParams('utm_source=twitter'))).toBe(false);
    expect(hasExploreParams(new URLSearchParams('ref=homepage'))).toBe(false);
    expect(hasExploreParams(new URLSearchParams(''))).toBe(false);
  });

  it('returns true when both Explore and unrelated params are present', () => {
    expect(hasExploreParams(new URLSearchParams('utm_source=twitter&lens=NOTE_NAME'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // URL-wins-over-localStorage (behaviour of the store, tested here as a
  // policy check: loading from prefs when URL is present is the store's job,
  // but we verify that the adapter returns stored data correctly.)
  // -----------------------------------------------------------------------

  it('returns stored data even when URL params exist (store decides precedence)', () => {
    const stored = makeState({ labelMode: 'BLIND_COLOR' });
    saveExploreConfig(stored);

    // The adapter itself doesn't check URL — it always returns what's stored.
    // Precedence is enforced in the store.
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.labelMode).toBe('BLIND_COLOR');
  });

  // -----------------------------------------------------------------------
  // Partial / missing fields
  // -----------------------------------------------------------------------

  it('fills missing fields from defaults', () => {
    const partial: Record<string, unknown> = {
      labelMode: 'SCALE_DEGREE',
      scaleLayer: { enabled: true, rootPitchClass: 5, preferFlats: false, scaleId: 'lydian' },
    };
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(partial));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    expect(loaded.labelMode).toBe('SCALE_DEGREE');
    expect(loaded.scaleLayer).toEqual(partial.scaleLayer);
    // These come from defaults
    expect(loaded.instrumentId).toBe(DEFAULT_FRETBOARD_STATE.instrumentId);
    expect(loaded.filterMask.activeStrings).toEqual(DEFAULT_FRETBOARD_STATE.filterMask.activeStrings);
  });

  it('handles missing cagedOverlay gracefully (falls back to default)', () => {
    const stored = makeState();
    const fm = { ...stored.filterMask };
    delete (fm as Record<string, unknown>).cagedOverlay;
    stored.filterMask = fm;
    localStorage.setItem('freternity.exploreConfig.v1', JSON.stringify(stored));
    const loaded = loadExploreConfig(DEFAULT_FRETBOARD_STATE);
    // When cagedOverlay is missing, the validator falls back to the default
    expect(loaded.filterMask.cagedOverlay).toEqual(DEFAULT_FRETBOARD_STATE.filterMask.cagedOverlay);
  });
});