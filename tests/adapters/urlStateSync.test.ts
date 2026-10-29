import { describe, expect, it } from 'vitest';
import {
  searchParamsToState,
  stateToSearchParams,
} from '../../src/adapters/urlStateSync';
import { DEFAULT_FRETBOARD_STATE } from '../../src/store/useFretboardStore';
import { FretboardViewState } from '../../src/core/models';

describe('urlStateSync', () => {
  it('serializes and deserializes FretboardViewState losslessly', () => {
    const originalState: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'CHORD_INTERVAL',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 2, // D
        preferFlats: false,
        scaleId: 'dorian',
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 7, // G
        chordId: 'maj',
        activeInversion: 'SECOND',
        diatonicRomanNumeral: 'IV',
      },
      filterMask: {
        activeStrings: [2, 3, 4],
        fretRange: { min: 3, max: 10 },
        cagedOverlay: {
          enabled: true,
          shape: 'A',
          referenceRoot: 'TARGET_ROOT',
        },
      },
    };

    const searchParams = stateToSearchParams(originalState);
    const restored = searchParamsToState(searchParams, DEFAULT_FRETBOARD_STATE);

    expect(restored.instrumentId).toBe(originalState.instrumentId);
    expect(restored.labelMode).toBe(originalState.labelMode);
    expect(restored.scaleLayer).toEqual(originalState.scaleLayer);
    expect(restored.targetLayer).toEqual(originalState.targetLayer);
    expect(restored.filterMask.activeStrings).toEqual([2, 3, 4]);
    expect(restored.filterMask.fretRange).toEqual({ min: 3, max: 10 });
    expect(restored.filterMask.cagedOverlay).toEqual({
      enabled: true,
      shape: 'A',
      referenceRoot: 'TARGET_ROOT',
    });
  });

  it('safely falls back to default state when URL search params are invalid', () => {
    const invalidParams = new URLSearchParams('lens=INVALID&sRoot=99&strings=bad,data');
    const restored = searchParamsToState(invalidParams, DEFAULT_FRETBOARD_STATE);

    expect(restored.labelMode).toBe(DEFAULT_FRETBOARD_STATE.labelMode);
    expect(restored.scaleLayer.rootPitchClass).toBe(
      DEFAULT_FRETBOARD_STATE.scaleLayer.rootPitchClass
    );
    expect(restored.filterMask.activeStrings).toEqual(
      DEFAULT_FRETBOARD_STATE.filterMask.activeStrings
    );
  });
});
