import { MidiNote } from '../models';
import { frequencyToMidiFloat } from './yinPitchDetector';

/**
 * Turns a noisy stream of per-frame pitch estimates into discrete "note played" events.
 *
 * Guitar specifics handled here:
 * - A note must be stable for a few consecutive frames before it counts (pick transients are noisy).
 * - While a note decays, detectors often jump an octave/twelfth onto a harmonic. Such jumps are
 *   ignored unless a fresh pick attack (level jump) was seen.
 * - Re-picking the same note re-emits it once an attack is detected or the string went silent.
 */

export interface PitchFrame {
  /** null when the frame is silent or aperiodic */
  frequencyHz: number | null;
  clarity: number;
  rms: number;
}

export interface NoteTrackerOptions {
  minClarity?: number;
  /** Consecutive frames on the same semitone before emitting. */
  stableFrames?: number;
  /** Consecutive invalid frames before the sounding note is considered released. */
  releaseFrames?: number;
  /** Reject frames further than this from the nearest semitone (tuning/vibrato tolerance). */
  maxCentsOffset?: number;
  /** RMS ratio vs. the previous frame that counts as a new pick attack. */
  attackRatio?: number;
}

const DEFAULTS: Required<NoteTrackerOptions> = {
  minClarity: 0.8,
  stableFrames: 3,
  releaseFrames: 4,
  maxCentsOffset: 40,
  attackRatio: 1.8,
};

const HARMONIC_JUMPS = new Set([12, 19, 24]);

export class NoteTracker {
  private readonly opts: Required<NoteTrackerOptions>;
  private candidate: MidiNote | null = null;
  private candidateCount = 0;
  private sounding: MidiNote | null = null;
  private invalidCount = 0;
  private prevRms = 0;
  private attackSinceEmit = false;

  constructor(options: NoteTrackerOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  public reset(): void {
    this.candidate = null;
    this.candidateCount = 0;
    this.sounding = null;
    this.invalidCount = 0;
    this.prevRms = 0;
    this.attackSinceEmit = false;
  }

  /** Feed one analysis frame. Returns a MIDI note when a new note onset is confirmed. */
  public push(frame: PitchFrame): MidiNote | null {
    const isAttack = this.prevRms > 0 && frame.rms > this.prevRms * this.opts.attackRatio;
    this.prevRms = frame.rms;
    if (isAttack) {
      this.attackSinceEmit = true;
      this.candidateCount = 0;
    }

    const midi = this.toStableMidi(frame);
    if (midi === null) {
      this.invalidCount++;
      if (this.invalidCount >= this.opts.releaseFrames) {
        this.sounding = null;
        this.candidate = null;
        this.candidateCount = 0;
      }
      return null;
    }
    this.invalidCount = 0;

    if (midi === this.candidate) {
      this.candidateCount++;
    } else {
      this.candidate = midi;
      this.candidateCount = 1;
    }

    if (this.candidateCount < this.opts.stableFrames) return null;

    const isSameAsSounding = this.sounding === midi;
    if (isSameAsSounding && !this.attackSinceEmit) return null;

    const isHarmonicJump =
      this.sounding !== null &&
      !this.attackSinceEmit &&
      HARMONIC_JUMPS.has(Math.abs(midi - this.sounding));
    if (isHarmonicJump) return null;

    this.sounding = midi;
    this.attackSinceEmit = false;
    return midi;
  }

  private toStableMidi(frame: PitchFrame): MidiNote | null {
    if (frame.frequencyHz === null || frame.clarity < this.opts.minClarity) return null;
    const midiFloat = frequencyToMidiFloat(frame.frequencyHz);
    const midi = Math.round(midiFloat);
    const cents = Math.abs(midiFloat - midi) * 100;
    return cents <= this.opts.maxCentsOffset ? midi : null;
  }
}
