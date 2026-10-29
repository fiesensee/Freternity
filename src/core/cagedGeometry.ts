import { CagedShapeId, InstrumentConfig, PitchClass } from './models';
import { midiToPitchClass } from './musicTheory';

export interface CagedShapeDefinition {
  shape: CagedShapeId;
  anchorString: number; // 1-based string index: 6 = Low E, 5 = A, 4 = D
  deltaMin: number;
  deltaMax: number;
}

export const CAGED_DEFINITIONS: Readonly<Record<CagedShapeId, CagedShapeDefinition>> = Object.freeze({
  C: { shape: 'C', anchorString: 5, deltaMin: -3, deltaMax: 1 },
  A: { shape: 'A', anchorString: 5, deltaMin: -1, deltaMax: 3 },
  G: { shape: 'G', anchorString: 6, deltaMin: -3, deltaMax: 1 },
  E: { shape: 'E', anchorString: 6, deltaMin: -1, deltaMax: 3 },
  D: { shape: 'D', anchorString: 4, deltaMin: -1, deltaMax: 3 },
});

export interface FretWindow {
  min: number;
  max: number;
}

/**
 * Computes all active fret windows for a given CAGED shape and reference root on the instrument.
 * Handles multiple octaves (e.g. root at fret 3 and fret 15).
 */
export function getCagedFretWindows(
  shape: CagedShapeId,
  referenceRoot: PitchClass,
  instrument: InstrumentConfig
): readonly FretWindow[] {
  const config = CAGED_DEFINITIONS[shape];
  const openMidi = instrument.tuningMidi[config.anchorString - 1];

  const windows: FretWindow[] = [];

  for (let fret = 0; fret <= instrument.fretCount; fret++) {
    const midi = openMidi + fret;
    if (midiToPitchClass(midi) === referenceRoot) {
      const min = Math.max(0, fret + config.deltaMin);
      const max = Math.min(instrument.fretCount, fret + config.deltaMax);
      if (min <= max) {
        windows.push({ min, max });
      }
    }
  }

  return windows;
}

/**
 * Checks whether a specific fret number falls within any active CAGED stencil window.
 */
export function isFretInCagedStencil(
  fret: number,
  shape: CagedShapeId,
  referenceRoot: PitchClass,
  instrument: InstrumentConfig
): boolean {
  const windows = getCagedFretWindows(shape, referenceRoot, instrument);
  return windows.some((w) => fret >= w.min && fret <= w.max);
}
