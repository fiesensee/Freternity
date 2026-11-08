import { DrillConfig, FretPosition, InstrumentConfig, MidiNote } from '../models';

/**
 * Bridges audio input (pitches) and the position-based drill evaluator.
 *
 * A microphone hears pitches, not (string, fret) coordinates. Since every valid voicing has
 * exact pitches (octave included), a heard note that matches one is mapped onto that voicing's
 * position; any other heard note is placed on the nearest plausible fret so it can be shown
 * as a wrong pick.
 */

/** Distinct notes kept for the single-voicing drill — a fresh 3-note pass replaces mistakes. */
const SINGLE_VOICING_WINDOW = 3;
/** Upper bound for the all-inversions drill (3 inversions × 3 notes, plus slack). */
const ALL_INVERSIONS_WINDOW = 16;

export function appendHeardNote(
  heard: readonly MidiNote[],
  midi: MidiNote,
  exerciseType: DrillConfig['exerciseType']
): MidiNote[] {
  const windowSize =
    exerciseType === 'TRIAD_ALL_INVERSIONS' ? ALL_INVERSIONS_WINDOW : SINGLE_VOICING_WINDOW;
  const withoutDuplicate = heard.filter((m) => m !== midi);
  return [...withoutDuplicate, midi].slice(-windowSize);
}

export function positionToMidi(pos: FretPosition, instrument: InstrumentConfig): MidiNote {
  return instrument.tuningMidi[pos.stringIndex - 1] + pos.fret;
}

const samePosition = (a: FretPosition, b: FretPosition) =>
  a.stringIndex === b.stringIndex && a.fret === b.fret;

export function mapHeardNotesToPositions(
  heard: readonly MidiNote[],
  validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>>,
  exerciseType: DrillConfig['exerciseType'],
  activeStrings: readonly number[],
  fretZone: { min: number; max: number },
  instrument: InstrumentConfig
): FretPosition[] {
  if (heard.length === 0) return [];

  const heardSet = new Set(heard);
  const rankedVoicings = [...validVoicings].sort(
    (a, b) =>
      b.filter((p) => heardSet.has(positionToMidi(p, instrument))).length -
      a.filter((p) => heardSet.has(positionToMidi(p, instrument))).length
  );

  // Single-voicing drill: credit only the best matching shape so the evaluator
  // doesn't see a second voicing's notes as wrong picks.
  const creditableVoicings =
    exerciseType === 'TRIAD_ALL_INVERSIONS' ? rankedVoicings : rankedVoicings.slice(0, 1);

  const result: FretPosition[] = [];
  const matchedMidis = new Set<MidiNote>();
  for (const voicing of creditableVoicings) {
    for (const pos of voicing) {
      const midi = positionToMidi(pos, instrument);
      if (heardSet.has(midi) && !result.some((r) => samePosition(r, pos))) {
        result.push(pos);
        matchedMidis.add(midi);
      }
    }
  }

  const anchorVoicing = rankedVoicings[0] ?? [];
  const anchorFret =
    anchorVoicing.length > 0
      ? anchorVoicing.reduce((sum, p) => sum + p.fret, 0) / anchorVoicing.length
      : (fretZone.min + fretZone.max) / 2;

  for (const midi of heard) {
    if (matchedMidis.has(midi)) continue;
    const fallback = findNearestPosition(midi, anchorFret, activeStrings, fretZone, instrument);
    if (fallback && !result.some((r) => samePosition(r, fallback))) {
      result.push(fallback);
    }
  }

  return result;
}

function findNearestPosition(
  midi: MidiNote,
  anchorFret: number,
  activeStrings: readonly number[],
  fretZone: { min: number; max: number },
  instrument: InstrumentConfig
): FretPosition | null {
  const candidatesOn = (strings: readonly number[], minFret: number, maxFret: number) =>
    strings
      .map((stringIndex) => ({
        stringIndex,
        fret: midi - instrument.tuningMidi[stringIndex - 1],
      }))
      .filter((p) => p.fret >= minFret && p.fret <= maxFret);

  const allStrings = instrument.tuningMidi.map((_, i) => i + 1);
  const maxFret = Math.min(fretZone.max, instrument.fretCount);
  const candidates =
    [
      candidatesOn(activeStrings, fretZone.min, maxFret),
      candidatesOn(allStrings, 0, instrument.fretCount),
    ].find((list) => list.length > 0) ?? [];

  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) =>
    Math.abs(p.fret - anchorFret) < Math.abs(best.fret - anchorFret) ? p : best
  );
}
