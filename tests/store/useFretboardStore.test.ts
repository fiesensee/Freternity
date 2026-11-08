import { beforeEach, describe, expect, it } from 'vitest';
import { useFretboardStore } from '../../src/store/useFretboardStore';

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
