import { describe, expect, it } from 'vitest';
import {
  getCagedFretWindows,
  isFretInCagedStencil,
} from '../../src/core/cagedGeometry';
import { GUITAR_6_STANDARD } from '../../src/core/constants';

describe('cagedGeometry', () => {
  it('computes correct stencil windows for C shape with C root', () => {
    // C Root = 0.
    // C Shape anchor string is 5 (A string).
    // Open A is 9. Fret for C (0) on string 5: 9 + 3 = 12 -> fret 3 (and 3 + 12 = 15).
    // DeltaMin = -3, DeltaMax = 1.
    // Window 1: [3 - 3, 3 + 1] = [0, 4].
    // Window 2: [15 - 3, 15 + 1] = [12, 16].
    const windows = getCagedFretWindows('C', 0, GUITAR_6_STANDARD);
    expect(windows).toEqual([
      { min: 0, max: 4 },
      { min: 12, max: 16 },
    ]);

    expect(isFretInCagedStencil(2, 'C', 0, GUITAR_6_STANDARD)).toBe(true);
    expect(isFretInCagedStencil(14, 'C', 0, GUITAR_6_STANDARD)).toBe(true);
    expect(isFretInCagedStencil(8, 'C', 0, GUITAR_6_STANDARD)).toBe(false);
  });

  it('computes correct stencil windows for E shape with G root', () => {
    // G Root = 7.
    // E Shape anchor string is 6 (Low E string).
    // Open E is 4. Fret for G (7) on string 6: 4 + 3 = 7 -> fret 3 (and 3 + 12 = 15).
    // DeltaMin = -1, DeltaMax = 3.
    // Window 1: [3 - 1, 3 + 3] = [2, 6].
    // Window 2: [15 - 1, 15 + 3] = [14, 18].
    const windows = getCagedFretWindows('E', 7, GUITAR_6_STANDARD);
    expect(windows).toEqual([
      { min: 2, max: 6 },
      { min: 14, max: 18 },
    ]);

    expect(isFretInCagedStencil(3, 'E', 7, GUITAR_6_STANDARD)).toBe(true);
    expect(isFretInCagedStencil(6, 'E', 7, GUITAR_6_STANDARD)).toBe(true);
    expect(isFretInCagedStencil(1, 'E', 7, GUITAR_6_STANDARD)).toBe(false);
  });
});
