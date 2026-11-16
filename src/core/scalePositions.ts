import {
  CagedShapeId,
  FretPosition,
  InstrumentConfig,
  IntervalDegree,
  MidiNote,
  PitchClass,
  ScaleDefinition,
} from './models';
import { CAGED_DEFINITIONS, FretWindow } from './cagedGeometry';
import { getIntervalDegree, midiToPitchClass, semitoneDistance } from './musicTheory';

export interface ScalePositionNote extends FretPosition {
  midi: MidiNote;
  degree: IntervalDegree;
}

export interface ScalePosition {
  shape: CagedShapeId;
  /** The shape's 5-fret CAGED box */
  window: FretWindow;
  /** Frets the chosen notes actually use (can be narrower than the box) */
  span: FretWindow;
  /** Every scale note in the box once, lowest pitch first: the order you play it ascending */
  notes: readonly ScalePositionNote[];
}

/**
 * A scale played in one CAGED position: all scale notes inside the shape's 5-fret box.
 *
 * Only complete boxes count (the ones cut off by the nut are skipped), and the lowest one
 * on the neck is used.
 *
 * A 5-fret box often holds one pitch twice: the top fret of the G string equals the bottom
 * fret of the B string. Only one of them belongs in the position. The one that keeps the
 * hand span narrowest wins (e.g. A minor, D shape: F on the G string at fret 10, so the
 * position is frets 7–10 instead of reaching back to fret 6 on the B string for it).
 * If both fit equally, the higher string's note is kept.
 */
export function getCagedScalePosition(
  scaleRoot: PitchClass,
  scale: ScaleDefinition,
  shape: CagedShapeId,
  instrument: InstrumentConfig
): ScalePosition | null {
  const def = CAGED_DEFINITIONS[shape];
  const anchorOpen = instrument.tuningMidi[def.anchorString - 1];
  const width = def.deltaMax - def.deltaMin;

  let window: FretWindow | null = null;
  for (let rootFret = 0; rootFret <= instrument.fretCount; rootFret++) {
    if (midiToPitchClass(anchorOpen + rootFret) !== scaleRoot) continue;
    const min = rootFret + def.deltaMin;
    const max = rootFret + def.deltaMax;
    if (min >= 0 && max <= instrument.fretCount && max - min === width) {
      window = { min, max };
      break;
    }
  }
  if (!window) return null;

  // Every scale note in the box, grouped by pitch (high string first, for the tie-break)
  const byPitch = new Map<MidiNote, ScalePositionNote[]>();
  for (let stringIndex = 1; stringIndex <= instrument.stringCount; stringIndex++) {
    const open = instrument.tuningMidi[stringIndex - 1];
    for (let fret = window.min; fret <= window.max; fret++) {
      const midi = open + fret;
      const pc = midiToPitchClass(midi);
      if (!scale.semitones.includes(semitoneDistance(scaleRoot, pc))) continue;
      const note = { stringIndex, fret, midi, degree: getIntervalDegree(scaleRoot, pc, scale) };
      byPitch.set(midi, [...(byPitch.get(midi) ?? []), note]);
    }
  }

  const groups = [...byPitch.values()];
  const chosen = groups.filter((g) => g.length === 1).map((g) => g[0]);
  const spanWith = (extra: ScalePositionNote) => {
    const frets = [...chosen, extra].map((n) => n.fret);
    return Math.max(...frets) - Math.min(...frets);
  };
  for (const duplicates of groups.filter((g) => g.length > 1)) {
    // Stable sort: on equal span the first one (higher string) stays first
    chosen.push([...duplicates].sort((a, b) => spanWith(a) - spanWith(b))[0]);
  }

  const notes = chosen.sort((a, b) => a.midi - b.midi);
  const frets = notes.map((n) => n.fret);
  return {
    shape,
    window,
    span: { min: Math.min(...frets), max: Math.max(...frets) },
    notes,
  };
}
