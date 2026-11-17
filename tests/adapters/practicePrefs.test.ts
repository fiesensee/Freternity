import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPracticeConfig, savePracticeConfig } from '../../src/adapters/practicePrefs';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';
import { DrillConfig } from '../../src/core/models';

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

/** Deep-ish clone of DrillConfig (handles nested objects/arrays). */
function cloneConfig(c: DrillConfig): DrillConfig {
  return JSON.parse(JSON.stringify(c));
}

/** Build a full DrillConfig from partial overrides. */
function makeConfig(overrides?: Partial<DrillConfig>): DrillConfig {
  return { ...cloneConfig(DEFAULT_DRILL_CONFIG), ...overrides } as DrillConfig;
}

describe('practicePrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // Round-trip
  // -----------------------------------------------------------------------

  it('round-trips a full DrillConfig losslessly', () => {
    const config = makeConfig({
      exerciseType: 'CAGED_CHORD_SHAPE',
      scaleContext: { enabled: true, rootPitchClass: 2, preferFlats: false, scaleId: 'dorian' },
      stringSets: [[2, 3, 4], [3, 4, 5]],
      inversions: ['ROOT', 'SECOND'],
      cagedShapes: ['C', 'A', 'G'],
      rhythm: { bpm: 100, subdivision: 4 },
      fretZone: { min: 3, max: 12 },
      promptDurationMs: 30000,
      revealDurationMs: 6000,
      autoAdvance: false,
      playDrone: false,
      playSolutionAudioOnReveal: true,
    });

    savePracticeConfig(config);
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);

    expect(loaded).toEqual(config);
  });

  // -----------------------------------------------------------------------
  // Returns defaults when nothing is stored
  // -----------------------------------------------------------------------

  it('returns a copy of defaults when localStorage is empty', () => {
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded).toEqual(DEFAULT_DRILL_CONFIG);
    // Must be a different reference so callers can mutate safely
    expect(loaded).not.toBe(DEFAULT_DRILL_CONFIG);
  });

  // -----------------------------------------------------------------------
  // Validation fallback on corrupt / unknown data
  // -----------------------------------------------------------------------

  it('falls back to defaults for corrupt JSON', () => {
    localStorage.setItem('freternity.practiceConfig.v1', 'not-json');
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded).toEqual(DEFAULT_DRILL_CONFIG);
  });

  it('falls back to defaults for non-object JSON', () => {
    localStorage.setItem('freternity.practiceConfig.v1', '"string"');
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded).toEqual(DEFAULT_DRILL_CONFIG);
  });

  it('falls back to defaults for null JSON', () => {
    localStorage.setItem('freternity.practiceConfig.v1', 'null');
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded).toEqual(DEFAULT_DRILL_CONFIG);
  });

  it('replaces an unknown exerciseType with the default', () => {
    const stored = makeConfig({ exerciseType: 'UNKNOWN_TYPE' as never });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.exerciseType).toBe(DEFAULT_DRILL_CONFIG.exerciseType);
  });

  it('replaces an unknown scaleId with the default', () => {
    const stored = makeConfig();
    stored.scaleContext.scaleId = 'hyperlydian';
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.scaleContext.scaleId).toBe(DEFAULT_DRILL_CONFIG.scaleContext.scaleId);
  });

  it('replaces an invalid rootPitchClass with the default', () => {
    const stored = makeConfig({ scaleContext: { ...cloneConfig(DEFAULT_DRILL_CONFIG).scaleContext, rootPitchClass: 99 as unknown as 0 } });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.scaleContext.rootPitchClass).toBe(DEFAULT_DRILL_CONFIG.scaleContext.rootPitchClass);
  });

  it('replaces an unknown CAGED shape with the default', () => {
    const stored = makeConfig({ cagedShapes: ['X', 'Y'] as never });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.cagedShapes).toEqual(DEFAULT_DRILL_CONFIG.cagedShapes);
  });

  it('replaces an unknown inversion with the default', () => {
    const stored = makeConfig({ inversions: ['TERTIARY'] as never });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.inversions).toEqual(DEFAULT_DRILL_CONFIG.inversions);
  });

  it('clamps extreme bpm values', () => {
    const stored = makeConfig({ rhythm: { bpm: 9999, subdivision: 2 } });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.rhythm.bpm).toBe(300);
  });

  it('clamps extreme promptDurationMs', () => {
    const stored = makeConfig({ promptDurationMs: 999999 });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.promptDurationMs).toBe(300000);
  });

  it('clamps extreme fretZone values', () => {
    const stored = makeConfig({ fretZone: { min: -5, max: 99 } });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.fretZone.min).toBe(0);
    expect(loaded.fretZone.max).toBe(24);
  });

  it('filters out invalid string sets', () => {
    const stored = makeConfig({ stringSets: [[1, 2, 7], [0, 2, 3], [4, 5, 6]] as never });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    // [4, 5, 6] is valid, [1, 2, 7] and [0, 2, 3] are not
    expect(loaded.stringSets).toEqual([[4, 5, 6]]);
  });

  it('falls back to default string sets when all are invalid', () => {
    const stored = makeConfig({ stringSets: [[0, 1, 2], [1, 2, 7]] as never });
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(stored));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.stringSets).toEqual(DEFAULT_DRILL_CONFIG.stringSets);
  });

  // -----------------------------------------------------------------------
  // Graceful behaviour when localStorage throws (private mode)
  // -----------------------------------------------------------------------

  it('returns defaults when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(mockStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'InvalidStateError');
    });
    try {
      const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
      expect(loaded).toEqual(DEFAULT_DRILL_CONFIG);
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('silently ignores errors when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'InvalidStateError');
    });
    try {
      expect(() => savePracticeConfig(DEFAULT_DRILL_CONFIG)).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('silently ignores quota errors on save', () => {
    const setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    try {
      expect(() => savePracticeConfig(DEFAULT_DRILL_CONFIG)).not.toThrow();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  // -----------------------------------------------------------------------
  // Validation: partial / missing fields
  // -----------------------------------------------------------------------

  it('fills missing fields from defaults', () => {
    const partial: Record<string, unknown> = {
      exerciseType: 'TRIAD_ALL_INVERSIONS',
      scaleContext: { enabled: true, rootPitchClass: 5, preferFlats: true, scaleId: 'mixolydian' },
    };
    localStorage.setItem('freternity.practiceConfig.v1', JSON.stringify(partial));
    const loaded = loadPracticeConfig(DEFAULT_DRILL_CONFIG);
    expect(loaded.exerciseType).toBe('TRIAD_ALL_INVERSIONS');
    expect(loaded.scaleContext).toEqual(partial.scaleContext);
    // These come from defaults
    expect(loaded.stringSets).toEqual(DEFAULT_DRILL_CONFIG.stringSets);
    expect(loaded.autoAdvance).toBe(DEFAULT_DRILL_CONFIG.autoAdvance);
  });
});