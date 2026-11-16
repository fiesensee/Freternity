import { InstrumentConfig, MidiNote } from '../models';
import { GUITAR_6_STANDARD } from '../constants';
import { frequencyToMidiFloat } from './yinPitchDetector';

export interface TuningReading {
  /** Nearest semitone */
  midiNote: MidiNote;
  /** Deviation from that semitone, -50..50 (negative = flat) */
  cents: number;
  /** Internal string index (1 = high E) of the open string this note is, if any */
  openStringIndex: number | null;
}

/** Chromatic tuner reading for a frequency, plus which open string it matches. */
export function readTuning(
  frequencyHz: number,
  instrument: InstrumentConfig = GUITAR_6_STANDARD
): TuningReading {
  const midiFloat = frequencyToMidiFloat(frequencyHz);
  const midiNote = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midiNote) * 1000) / 10;
  const idx = instrument.tuningMidi.indexOf(midiNote);
  return { midiNote, cents, openStringIndex: idx === -1 ? null : idx + 1 };
}

/**
 * Steadies a tuner needle: the median of the recent pitch estimates, ignoring stray
 * frames on a different semitone (pick noise, octave slips) than the latest one.
 */
export function smoothFrequency(recent: readonly number[]): number | null {
  if (recent.length === 0) return null;
  const latestNote = Math.round(frequencyToMidiFloat(recent[recent.length - 1]));
  const sameNote = recent
    .filter((f) => Math.round(frequencyToMidiFloat(f)) === latestNote)
    .sort((a, b) => a - b);
  return sameNote[Math.floor(sameNote.length / 2)];
}

/** How close is close enough to call a string in tune */
export const IN_TUNE_CENTS = 5;
