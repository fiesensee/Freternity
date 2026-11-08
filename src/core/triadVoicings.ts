import {
  ChordDefinition,
  FretPosition,
  InstrumentConfig,
  PitchClass,
  TriadInversion,
} from './models';
import { midiToPitchClass } from './musicTheory';

export interface TriadVoicing {
  inversion: TriadInversion;
  positions: readonly FretPosition[];
}

/**
 * Finds all playable closed-position triad voicings on a specified 3-string set.
 *
 * Closed position ordering:
 * - ROOT: Lowest string has Root, middle string has Third, highest string has Fifth
 * - FIRST: Lowest string has Third, middle string has Fifth, highest string has Root
 * - SECOND: Lowest string has Fifth, middle string has Root, highest string has Third
 */
export function findClosedTriadVoicings(
  rootPitchClass: PitchClass,
  chord: ChordDefinition,
  inversion: TriadInversion | 'ANY',
  stringSet: readonly number[], // e.g. [1, 2, 3] (1 = high E)
  instrument: InstrumentConfig,
  fretZone?: { min: number; max: number }
): readonly TriadVoicing[] {
  if (stringSet.length !== 3) {
    throw new Error(`Closed triad voicings require exactly 3 strings, received ${stringSet.length}`);
  }

  // Sort strings by open-string MIDI note ascending (lowest pitch string to highest pitch string)
  const sortedStrings = [...stringSet].sort((a, b) => {
    const midiA = instrument.tuningMidi[a - 1];
    const midiB = instrument.tuningMidi[b - 1];
    return midiA - midiB;
  });

  const [stringLow, stringMid, stringHigh] = sortedStrings;

  const R = rootPitchClass;
  const T = ((R + chord.semitones[1]) % 12) as PitchClass;
  const F = ((R + chord.semitones[2]) % 12) as PitchClass;

  const inversionsToSearch: TriadInversion[] =
    inversion === 'ANY' ? ['ROOT', 'FIRST', 'SECOND'] : [inversion];

  const results: TriadVoicing[] = [];

  for (const inv of inversionsToSearch) {
    let targetLow: PitchClass;
    let targetMid: PitchClass;
    let targetHigh: PitchClass;

    switch (inv) {
      case 'ROOT':
        targetLow = R;
        targetMid = T;
        targetHigh = F;
        break;
      case 'FIRST':
        targetLow = T;
        targetMid = F;
        targetHigh = R;
        break;
      case 'SECOND':
        targetLow = F;
        targetMid = R;
        targetHigh = T;
        break;
    }

    const minFret = fretZone ? fretZone.min : 0;
    const maxFret = fretZone ? Math.min(fretZone.max, instrument.fretCount) : instrument.fretCount;

    // Collect candidate frets on each string
    const candidatesLow = getMatchingFretsOnString(stringLow, targetLow, instrument, minFret, maxFret);
    const candidatesMid = getMatchingFretsOnString(stringMid, targetMid, instrument, minFret, maxFret);
    const candidatesHigh = getMatchingFretsOnString(stringHigh, targetHigh, instrument, minFret, maxFret);

    for (const fLow of candidatesLow) {
      for (const fMid of candidatesMid) {
        for (const fHigh of candidatesHigh) {
          const frets = [fLow, fMid, fHigh];
          const span = Math.max(...frets) - Math.min(...frets);

          if (span <= 4) {
            results.push({
              inversion: inv,
              positions: [
                { stringIndex: stringLow, fret: fLow },
                { stringIndex: stringMid, fret: fMid },
                { stringIndex: stringHigh, fret: fHigh },
              ],
            });
          }
        }
      }
    }
  }

  return results;
}

const minFret = (v: readonly FretPosition[]) => Math.min(...v.map((p) => p.fret));
const avgFret = (v: readonly FretPosition[]) => v.reduce((sum, p) => sum + p.fret, 0) / v.length;

/** Orders voicings from the nut upward (lowest fret first, then average fret). */
export function compareVoicingsByNeckPosition(
  a: readonly FretPosition[],
  b: readonly FretPosition[]
): number {
  return minFret(a) - minFret(b) || avgFret(a) - avgFret(b);
}

export interface InversionStep {
  inversion: TriadInversion;
  positions: readonly FretPosition[];
}

/**
 * The three consecutive inversion shapes starting nearest the nut, in the order they
 * appear walking up the neck (they repeat from ~fret 12 on).
 */
export function getAscendingInversionSequence(
  inversionVoicings: Record<TriadInversion, ReadonlyArray<readonly FretPosition[]>>
): InversionStep[] {
  return (['ROOT', 'FIRST', 'SECOND'] as const)
    .map((inversion) => {
      const lowest = [...(inversionVoicings[inversion] ?? [])].sort(compareVoicingsByNeckPosition)[0];
      return lowest ? { inversion, positions: lowest } : null;
    })
    .filter((step): step is InversionStep => step !== null)
    .sort((a, b) => compareVoicingsByNeckPosition(a.positions, b.positions));
}

function getMatchingFretsOnString(
  stringIndex: number,
  targetPitch: PitchClass,
  instrument: InstrumentConfig,
  minFret: number,
  maxFret: number
): number[] {
  const openMidi = instrument.tuningMidi[stringIndex - 1];
  const frets: number[] = [];

  for (let f = minFret; f <= maxFret; f++) {
    const midi = openMidi + f;
    if (midiToPitchClass(midi) === targetPitch) {
      frets.push(f);
    }
  }

  return frets;
}
