import {
  CagedShapeId,
  FretPosition,
  InstrumentConfig,
  IntervalDegree,
  PitchClass,
} from './models';
import { CAGED_DEFINITIONS } from './cagedGeometry';
import { midiToPitchClass } from './musicTheory';

/**
 * The five CAGED chord shapes as concrete, moveable fingerings.
 *
 * Each tone sits at a fret offset from the root on the shape's anchor string (the lowest
 * root of the open chord the shape is named after). Strings use internal indexing
 * (1 = high E … 6 = low E); strings a shape doesn't use are simply absent.
 *
 * Minor versions flatten the 3rd. Where that makes the open-chord form unplayable
 * (C and G shapes), the 3rd on the top string is swapped for the nearest playable
 * chord tone, as these shapes are commonly taught (Cm = x31013, Gm = 310033).
 */

export type CagedChordQuality = 'maj' | 'min';

export interface CagedShapeTone {
  stringIndex: number;
  fretOffset: number;
  interval: IntervalDegree;
}

export const CAGED_CHORD_SHAPES: Readonly<
  Record<CagedChordQuality, Readonly<Record<CagedShapeId, readonly CagedShapeTone[]>>>
> = Object.freeze({
  maj: {
    // x32010
    C: [
      { stringIndex: 5, fretOffset: 0, interval: '1' },
      { stringIndex: 4, fretOffset: -1, interval: '3' },
      { stringIndex: 3, fretOffset: -3, interval: '5' },
      { stringIndex: 2, fretOffset: -2, interval: '1' },
      { stringIndex: 1, fretOffset: -3, interval: '3' },
    ],
    // x02220
    A: [
      { stringIndex: 5, fretOffset: 0, interval: '1' },
      { stringIndex: 4, fretOffset: 2, interval: '5' },
      { stringIndex: 3, fretOffset: 2, interval: '1' },
      { stringIndex: 2, fretOffset: 2, interval: '3' },
      { stringIndex: 1, fretOffset: 0, interval: '5' },
    ],
    // 320003
    G: [
      { stringIndex: 6, fretOffset: 0, interval: '1' },
      { stringIndex: 5, fretOffset: -1, interval: '3' },
      { stringIndex: 4, fretOffset: -3, interval: '5' },
      { stringIndex: 3, fretOffset: -3, interval: '1' },
      { stringIndex: 2, fretOffset: -3, interval: '3' },
      { stringIndex: 1, fretOffset: 0, interval: '1' },
    ],
    // 022100
    E: [
      { stringIndex: 6, fretOffset: 0, interval: '1' },
      { stringIndex: 5, fretOffset: 2, interval: '5' },
      { stringIndex: 4, fretOffset: 2, interval: '1' },
      { stringIndex: 3, fretOffset: 1, interval: '3' },
      { stringIndex: 2, fretOffset: 0, interval: '5' },
      { stringIndex: 1, fretOffset: 0, interval: '1' },
    ],
    // xx0232
    D: [
      { stringIndex: 4, fretOffset: 0, interval: '1' },
      { stringIndex: 3, fretOffset: 2, interval: '5' },
      { stringIndex: 2, fretOffset: 3, interval: '1' },
      { stringIndex: 1, fretOffset: 2, interval: '3' },
    ],
  },
  min: {
    // x31013 (as Cm)
    C: [
      { stringIndex: 5, fretOffset: 0, interval: '1' },
      { stringIndex: 4, fretOffset: -2, interval: 'b3' },
      { stringIndex: 3, fretOffset: -3, interval: '5' },
      { stringIndex: 2, fretOffset: -2, interval: '1' },
      { stringIndex: 1, fretOffset: 0, interval: '5' },
    ],
    // x02210
    A: [
      { stringIndex: 5, fretOffset: 0, interval: '1' },
      { stringIndex: 4, fretOffset: 2, interval: '5' },
      { stringIndex: 3, fretOffset: 2, interval: '1' },
      { stringIndex: 2, fretOffset: 1, interval: 'b3' },
      { stringIndex: 1, fretOffset: 0, interval: '5' },
    ],
    // 310033 (as Gm)
    G: [
      { stringIndex: 6, fretOffset: 0, interval: '1' },
      { stringIndex: 5, fretOffset: -2, interval: 'b3' },
      { stringIndex: 4, fretOffset: -3, interval: '5' },
      { stringIndex: 3, fretOffset: -3, interval: '1' },
      { stringIndex: 2, fretOffset: 0, interval: '5' },
      { stringIndex: 1, fretOffset: 0, interval: '1' },
    ],
    // 022000
    E: [
      { stringIndex: 6, fretOffset: 0, interval: '1' },
      { stringIndex: 5, fretOffset: 2, interval: '5' },
      { stringIndex: 4, fretOffset: 2, interval: '1' },
      { stringIndex: 3, fretOffset: 0, interval: 'b3' },
      { stringIndex: 2, fretOffset: 0, interval: '5' },
      { stringIndex: 1, fretOffset: 0, interval: '1' },
    ],
    // xx0231
    D: [
      { stringIndex: 4, fretOffset: 0, interval: '1' },
      { stringIndex: 3, fretOffset: 2, interval: '5' },
      { stringIndex: 2, fretOffset: 3, interval: '1' },
      { stringIndex: 1, fretOffset: 1, interval: 'b3' },
    ],
  },
});

export function isCagedChordQuality(chordId: string): chordId is CagedChordQuality {
  return chordId === 'maj' || chordId === 'min';
}

export interface CagedChordVoicingTone extends FretPosition {
  interval: IntervalDegree;
}

/** One placement of a CAGED chord shape, tones ordered from the lowest string up. */
export interface CagedChordVoicing {
  shape: CagedShapeId;
  /** Fret of the root on the anchor string */
  rootFret: number;
  tones: readonly CagedChordVoicingTone[];
}

/**
 * Every place on the neck where `shape` spells the given chord (usually two: an octave apart).
 * A placement only counts if all of its frets exist and lie inside `fretZone`.
 */
export function findCagedChordVoicings(
  rootPitchClass: PitchClass,
  quality: CagedChordQuality,
  shape: CagedShapeId,
  instrument: InstrumentConfig,
  fretZone: { min: number; max: number } = { min: 0, max: instrument.fretCount }
): CagedChordVoicing[] {
  const anchorString = CAGED_DEFINITIONS[shape].anchorString;
  const openMidi = instrument.tuningMidi[anchorString - 1];
  const tones = CAGED_CHORD_SHAPES[quality][shape];
  const minFret = Math.max(0, fretZone.min);
  const maxFret = Math.min(instrument.fretCount, fretZone.max);

  const voicings: CagedChordVoicing[] = [];
  for (let rootFret = 0; rootFret <= instrument.fretCount; rootFret++) {
    if (midiToPitchClass(openMidi + rootFret) !== rootPitchClass) continue;

    const placed = tones.map((t) => ({
      stringIndex: t.stringIndex,
      fret: rootFret + t.fretOffset,
      interval: t.interval,
    }));
    if (placed.every((p) => p.fret >= minFret && p.fret <= maxFret)) {
      voicings.push({
        shape,
        rootFret,
        // Low string first, the order you'd strum it in
        tones: [...placed].sort((a, b) => b.stringIndex - a.stringIndex),
      });
    }
  }
  return voicings;
}
