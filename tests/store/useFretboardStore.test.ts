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
});
