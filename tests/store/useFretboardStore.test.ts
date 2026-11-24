import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFretboardStore } from '../../src/store/useFretboardStore';

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

describe('useFretboardStore', () => {
  beforeEach(() => {
    useFretboardStore.getState().resetToDefaults();
  });

  it('updates lens label mode', () => {
    useFretboardStore.getState().setLabelMode('SCALE_DEGREE');
    expect(useFretboardStore.getState().viewState.labelMode).toBe('SCALE_DEGREE');
  });

  it('updates active string set filter', () => {
    useFretboardStore.getState().setActiveStrings([2, 3, 4]);
    expect(useFretboardStore.getState().viewState.filterMask.activeStrings).toEqual([
      2, 3, 4,
    ]);
  });

  it('toggles and sets CAGED stencil shapes', () => {
    useFretboardStore.getState().setCagedShape('C');
    expect(
      useFretboardStore.getState().viewState.filterMask.cagedOverlay?.shape
    ).toBe('C');

    useFretboardStore.getState().toggleCagedOverlay();
    expect(
      useFretboardStore.getState().viewState.filterMask.cagedOverlay?.enabled
    ).toBe(false);

    useFretboardStore.getState().toggleCagedOverlay();
    expect(
      useFretboardStore.getState().viewState.filterMask.cagedOverlay?.enabled
    ).toBe(true);
  });

  it('changes note spelling without changing the selected scale or chord', () => {
    const store = useFretboardStore.getState;
    store().setScaleLayer({ rootPitchClass: 9, scaleId: 'aeolian' });
    store().setTargetLayer({ enabled: true });
    const before = store().viewState;

    store().setScaleLayer({ preferFlats: false });
    const after = store().viewState;

    expect(after.scaleLayer).toEqual({ ...before.scaleLayer, preferFlats: false });
    expect(after.targetLayer).toEqual(before.targetLayer);
  });

  it('pivots relative modes mathematically', () => {
    // Set base scale to C Ionian (root = 0, scaleId = 'ionian')
    useFretboardStore.getState().setScaleLayer({ rootPitchClass: 0, scaleId: 'ionian' });

    // Pivot to relative Aeolian (natural minor of C is A = 9)
    useFretboardStore.getState().pivotRelativeMode('aeolian');
    const stateAeolian = useFretboardStore.getState().viewState.scaleLayer;
    expect(stateAeolian.scaleId).toBe('aeolian');
    expect(stateAeolian.rootPitchClass).toBe(9); // A

    // Pivot from A Aeolian to relative Dorian (D = 2)
    useFretboardStore.getState().pivotRelativeMode('dorian');
    const stateDorian = useFretboardStore.getState().viewState.scaleLayer;
    expect(stateDorian.scaleId).toBe('dorian');
    expect(stateDorian.rootPitchClass).toBe(2); // D

    // Pivot from D Dorian to relative Mixolydian (G = 7)
    useFretboardStore.getState().pivotRelativeMode('mixolydian');
    const stateMixo = useFretboardStore.getState().viewState.scaleLayer;
    expect(stateMixo.scaleId).toBe('mixolydian');
    expect(stateMixo.rootPitchClass).toBe(7); // G
  });

  it('sets target chord with root and roman numeral', () => {
    useFretboardStore.getState().setTargetChord(2, 'min', 'ii');
    const target = useFretboardStore.getState().viewState.targetLayer;
    expect(target.enabled).toBe(true);
    expect(target.rootPitchClass).toBe(2);
    expect(target.chordId).toBe('min');
    expect(target.diatonicRomanNumeral).toBe('ii');
  });

  it('automatically switches target triad to the tonic (i / I) triad when switching root or mode', () => {
    // Start from A Aeolian, then switch root to E (4)
    useFretboardStore.getState().setScaleLayer({ rootPitchClass: 9, scaleId: 'aeolian' });
    useFretboardStore.getState().setBaseScaleRoot(4);
    let state = useFretboardStore.getState().viewState;
    expect(state.scaleLayer.rootPitchClass).toBe(4);
    // In E Aeolian, tonic triad is E minor (i)
    expect(state.targetLayer.rootPitchClass).toBe(4);
    expect(state.targetLayer.chordId).toBe('min');
    expect(state.targetLayer.diatonicRomanNumeral).toBe('i');

    // Switch scale to Major (C Ionian) via setScaleLayer
    useFretboardStore.getState().setScaleLayer({ rootPitchClass: 0, scaleId: 'ionian' });
    state = useFretboardStore.getState().viewState;
    expect(state.scaleLayer.rootPitchClass).toBe(0);
    // In C Ionian, tonic triad is C Major (I)
    expect(state.targetLayer.rootPitchClass).toBe(0);
    expect(state.targetLayer.chordId).toBe('maj');
    expect(state.targetLayer.diatonicRomanNumeral).toBe('I');

    // Pivot relative mode to Dorian (D Dorian)
    useFretboardStore.getState().pivotRelativeMode('dorian');
    state = useFretboardStore.getState().viewState;
    expect(state.scaleLayer.rootPitchClass).toBe(2);
    // In D Dorian, tonic triad is D minor (i)
    expect(state.targetLayer.rootPitchClass).toBe(2);
    expect(state.targetLayer.chordId).toBe('min');
    expect(state.targetLayer.diatonicRomanNumeral).toBe('i');
  });

  it('keeps a hidden chord hidden when switching root, mode or relative mode', () => {
    const store = useFretboardStore.getState;
    store().setTargetLayer({ enabled: false });

    store().setBaseScaleRoot(2);
    expect(store().viewState.targetLayer.enabled).toBe(false);

    store().setScaleLayer({ scaleId: 'dorian' });
    expect(store().viewState.targetLayer.enabled).toBe(false);

    store().pivotRelativeMode('ionian');
    expect(store().viewState.targetLayer.enabled).toBe(false);

    // Showing it again gives the tonic chord of the current key
    store().setTargetLayer({ enabled: true });
    const { scaleLayer, targetLayer } = store().viewState;
    expect(targetLayer.rootPitchClass).toBe(scaleLayer.rootPitchClass);
  });

  it('shows the CAGED outline again when a shape is picked after it was switched off', () => {
    const store = useFretboardStore.getState;
    const overlay = store().viewState.filterMask.cagedOverlay!;
    store().setCagedOverlay({ ...overlay, enabled: false });

    store().setCagedShape('A');
    expect(store().viewState.filterMask.cagedOverlay).toMatchObject({ shape: 'A', enabled: true });
  });

  it('starts with plain C major on all strings, without chord or CAGED shape', () => {
    const { scaleLayer, targetLayer, filterMask } = useFretboardStore.getState().viewState;
    expect(scaleLayer).toMatchObject({ enabled: true, rootPitchClass: 0, scaleId: 'ionian' });
    expect(targetLayer.enabled).toBe(false);
    expect(filterMask.activeStrings).toEqual([1, 2, 3, 4, 5, 6]);
    expect(filterMask.cagedOverlay?.enabled).toBe(false);
  });
});

describe('useFretboardStore persisted explore config', () => {
  beforeEach(() => {
    localStorage.clear();
    useFretboardStore.getState().resetToDefaults();
  });

  it('persists state to localStorage when a setting changes', () => {
    useFretboardStore.getState().setLabelMode('SCALE_DEGREE');
    const raw = localStorage.getItem('freternity.exploreConfig.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.labelMode).toBe('SCALE_DEGREE');
  });

  it('persists CAGED overlay changes to localStorage', () => {
    useFretboardStore.getState().setCagedShape('A');
    const raw = localStorage.getItem('freternity.exploreConfig.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.filterMask.cagedOverlay.shape).toBe('A');
    expect(parsed.filterMask.cagedOverlay.enabled).toBe(true);
  });

  it('persists scale root changes to localStorage', () => {
    useFretboardStore.getState().setBaseScaleRoot(7);
    const raw = localStorage.getItem('freternity.exploreConfig.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.scaleLayer.rootPitchClass).toBe(7);
  });

  it('persists reset to defaults to localStorage', () => {
    useFretboardStore.getState().setLabelMode('BLIND_COLOR');
    useFretboardStore.getState().resetToDefaults();
    const raw = localStorage.getItem('freternity.exploreConfig.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.labelMode).toBe('NOTE_NAME');
    expect(parsed.scaleLayer.rootPitchClass).toBe(0);
  });

  it('persists string set changes to localStorage', () => {
    useFretboardStore.getState().setActiveStrings([1, 2, 3]);
    const raw = localStorage.getItem('freternity.exploreConfig.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.filterMask.activeStrings).toEqual([1, 2, 3]);
  });
});

describe('useFretboardStore scale finder', () => {
  beforeEach(() => {
    localStorage.clear();
    useFretboardStore.getState().resetToDefaults();
  });

  it('starts inactive with no selected positions', () => {
    expect(useFretboardStore.getState().scaleFinderActive).toBe(false);
    expect(useFretboardStore.getState().scaleFinderPositions).toEqual([]);
  });

  it('toggles scale finder mode and note positions without mutating viewState', () => {
    const initialView = useFretboardStore.getState().viewState;

    useFretboardStore.getState().toggleScaleFinder();
    expect(useFretboardStore.getState().scaleFinderActive).toBe(true);

    useFretboardStore.getState().toggleScaleFinderPosition({ stringIndex: 6, fret: 5 });
    useFretboardStore.getState().toggleScaleFinderPosition({ stringIndex: 5, fret: 3 });
    expect(useFretboardStore.getState().scaleFinderPositions).toEqual([
      { stringIndex: 6, fret: 5 },
      { stringIndex: 5, fret: 3 },
    ]);

    // Toggling the same position removes it
    useFretboardStore.getState().toggleScaleFinderPosition({ stringIndex: 6, fret: 5 });
    expect(useFretboardStore.getState().scaleFinderPositions).toEqual([
      { stringIndex: 5, fret: 3 },
    ]);

    // viewState remains unchanged while selecting notes
    expect(useFretboardStore.getState().viewState).toEqual(initialView);

    // Clear resets positions
    useFretboardStore.getState().clearScaleFinderPositions();
    expect(useFretboardStore.getState().scaleFinderPositions).toEqual([]);
  });

  it('applies a non-7-note scale (e.g. minor_pentatonic) cleanly and keeps finder open', () => {
    useFretboardStore.getState().setScaleFinderActive(true);
    useFretboardStore.getState().setTargetChord(0, 'maj', 'I');

    useFretboardStore.getState().setScaleLayer({
      enabled: true,
      rootPitchClass: 9,
      scaleId: 'minor_pentatonic',
    });

    const state = useFretboardStore.getState();
    expect(state.viewState.scaleLayer.rootPitchClass).toBe(9);
    expect(state.viewState.scaleLayer.scaleId).toBe('minor_pentatonic');
    expect(state.viewState.targetLayer.enabled).toBe(false);
    expect(state.scaleFinderActive).toBe(true);
  });

  it('resets scale finder state on resetToDefaults', () => {
    useFretboardStore.getState().setScaleFinderActive(true);
    useFretboardStore.getState().toggleScaleFinderPosition({ stringIndex: 1, fret: 0 });

    useFretboardStore.getState().resetToDefaults();
    expect(useFretboardStore.getState().scaleFinderActive).toBe(false);
    expect(useFretboardStore.getState().scaleFinderPositions).toEqual([]);
  });
});
