/**
 * Sample-accurate pluck (onset) detector. Pure and streaming: feed it audio in chunks of
 * any size and it reports the absolute sample index where each new attack starts.
 *
 * How: the signal is first tilted towards the treble (6 dB/octave, unity at 1 kHz). A pick
 * attack is a short bright click, while a sustained note, especially a low one, is mostly
 * low-frequency energy, so the tilt makes each pluck stand out even when it's no louder
 * than the note before it (even sixteenths). It also suppresses hum and rumble.
 *
 * An envelope follower (instant attack, slow release) then tracks that level. An
 * onset is a sharp *rise*: the envelope now is several times what it was a few ms ago,
 * and above an absolute gate. Comparing against the recent past (not a long average)
 * lets a new pluck stand out even while the previous note still rings, and catches the
 * same note picked twice. The comparison level never drops below half the recent average,
 * so the dips of two ringing notes beating against each other don't look like new attacks.
 *
 * The release is longer than the period of the lowest string (low E: ~12 ms), so the
 * envelope doesn't ripple with each cycle of a low note and fake new attacks.
 *
 * Runs inside an AudioWorklet in the app, and directly in unit tests.
 */

export interface OnsetDetectorOptions {
  sampleRate: number;
  /** Absolute level (0..1 peak) a pluck must reach */
  gate?: number;
  /** Envelope rise (now vs `lookbackMs` ago) that counts as an attack */
  riseRatio?: number;
  /** The rise must calm down below this before the next onset can fire */
  rearmRatio?: number;
  lookbackMs?: number;
  /** Minimum time between two onsets */
  refractoryMs?: number;
  releaseMs?: number;
  /** Time constant of the recent-average level that floors the comparison */
  averageMs?: number;
  /** Ignore this long at the start: the stream switching on looks like an attack */
  warmupMs?: number;
}

const DEFAULTS = {
  gate: 0.02,
  riseRatio: 1.8,
  rearmRatio: 1.15,
  lookbackMs: 15,
  refractoryMs: 50,
  releaseMs: 60,
  averageMs: 100,
  warmupMs: 100,
};

export class OnsetDetector {
  private readonly release: number;
  private readonly averageCoef: number;
  private average = 0;
  private readonly riseRatio: number;
  private readonly rearmRatio: number;
  private readonly refractorySamples: number;
  private readonly warmupSamples: number;
  private gate: number;

  /** Ring buffer of past envelope values, `lookback` samples long */
  private readonly history: Float32Array;
  private historyPos = 0;
  private env = 0;
  private sampleIndex = 0;
  private prevSample = 0;
  /** Scales the first difference to unity gain at 1 kHz */
  private readonly tiltGain: number;
  private lastOnset = -Infinity;
  private armed = true;

  constructor(options: OnsetDetectorOptions) {
    const o = { ...DEFAULTS, ...options };
    this.release = Math.exp(-1 / ((o.releaseMs / 1000) * o.sampleRate));
    this.averageCoef = Math.exp(-1 / ((o.averageMs / 1000) * o.sampleRate));
    this.riseRatio = o.riseRatio;
    this.rearmRatio = o.rearmRatio;
    this.refractorySamples = Math.round((o.refractoryMs / 1000) * o.sampleRate);
    this.warmupSamples = Math.round((o.warmupMs / 1000) * o.sampleRate);
    this.history = new Float32Array(Math.max(1, Math.round((o.lookbackMs / 1000) * o.sampleRate)));
    this.gate = o.gate;
    this.tiltGain = o.sampleRate / (2 * Math.PI * 1000);
  }

  public setGate(gate: number): void {
    this.gate = gate;
  }

  /** Processes the next chunk; returns absolute sample indices of onsets found in it. */
  public process(chunk: ArrayLike<number>): number[] {
    const onsets: number[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const level = Math.abs(chunk[i] - this.prevSample) * this.tiltGain;
      this.prevSample = chunk[i];
      this.env = level > this.env ? level : this.env * this.release;

      const past = this.history[this.historyPos];
      this.history[this.historyPos] = this.env;
      this.historyPos = (this.historyPos + 1) % this.history.length;

      // Compare with the recent past, floored by half the recent average (beating dips)
      // and a tiny absolute floor (silence)
      const reference = Math.max(past, 0.5 * this.average) + this.gate * 0.1;
      this.average = this.averageCoef * this.average + (1 - this.averageCoef) * this.env;
      const rise = this.env / reference;
      const index = this.sampleIndex + i;

      if (!this.armed && rise < this.rearmRatio) this.armed = true;
      if (
        this.armed &&
        index >= this.warmupSamples &&
        this.env >= this.gate &&
        rise >= this.riseRatio &&
        index - this.lastOnset >= this.refractorySamples
      ) {
        onsets.push(index);
        this.lastOnset = index;
        this.armed = false;
      }
    }
    this.sampleIndex += chunk.length;
    return onsets;
  }
}
