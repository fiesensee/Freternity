/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 * Pure function over a mono PCM frame — no Web Audio dependency, fully unit-testable.
 */

export interface PitchEstimate {
  frequencyHz: number;
  /** 0..1 — 1 minus the normalized YIN difference at the chosen lag (higher = more periodic). */
  clarity: number;
}

export interface YinOptions {
  /** Lowest detectable pitch. Guitar low E2 is ~82 Hz; leave headroom for drop tunings. */
  minFrequencyHz?: number;
  /** Highest detectable pitch. Fret 22 on high E (D6) is ~1175 Hz. */
  maxFrequencyHz?: number;
  /** Absolute threshold on the cumulative mean normalized difference function. */
  threshold?: number;
}

const DEFAULTS: Required<YinOptions> = {
  minFrequencyHz: 70,
  maxFrequencyHz: 1400,
  threshold: 0.15,
};

export function computeRms(buffer: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return buffer.length > 0 ? Math.sqrt(sum / buffer.length) : 0;
}

/**
 * Note: the buffer must hold at least two periods of `minFrequencyHz`
 * (2 × sampleRate / minFrequencyHz samples), otherwise the lowest notes can't be found.
 */
export function detectPitchYin(
  buffer: ArrayLike<number>,
  sampleRate: number,
  options: YinOptions = {}
): PitchEstimate | null {
  const { minFrequencyHz, maxFrequencyHz, threshold } = { ...DEFAULTS, ...options };

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequencyHz));
  const tauMax = Math.min(Math.floor(sampleRate / minFrequencyHz), Math.floor(buffer.length / 2));
  if (tauMax <= tauMin + 1) return null;

  const windowSize = buffer.length - tauMax;
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;

  // Steps 2 + 3: difference function and cumulative mean normalization
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let diff = 0;
    for (let j = 0; j < windowSize; j++) {
      const delta = buffer[j] - buffer[j + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    cmnd[tau] = runningSum > 0 ? (diff * tau) / runningSum : 1;
  }

  // Step 4: first dip below the absolute threshold, then descend to its local minimum
  let bestTau = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }
  if (bestTau === -1) return null;

  // Step 5: parabolic interpolation for sub-sample lag precision
  let refinedTau = bestTau;
  if (bestTau > 1 && bestTau < tauMax) {
    const s0 = cmnd[bestTau - 1];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) {
      refinedTau = bestTau + (s2 - s0) / denom;
    }
  }

  return {
    frequencyHz: sampleRate / refinedTau,
    clarity: Math.max(0, Math.min(1, 1 - cmnd[bestTau])),
  };
}

/** Sample rate the detector is tuned for: a 2048-sample frame then spans ~43 ms. */
export const ANALYSIS_SAMPLE_RATE = 48000;
/** Samples handed to the detector per analysis frame (after downsampling). */
export const ANALYSIS_FRAME_SIZE = 2048;

/**
 * How many input samples to merge into one so the detector always runs near 48 kHz.
 * Audio interfaces often run at 88.2/96/192 kHz; analysed directly, a 2048-sample frame
 * would then be too short to hold two periods of the low E (82 Hz) and F (87 Hz).
 */
export function analysisDecimation(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / ANALYSIS_SAMPLE_RATE));
}

/**
 * Downsamples by averaging each group of `factor` samples (a crude but sufficient
 * low-pass: guitar fundamentals stay far below the new Nyquist frequency).
 */
export function downsampleByAveraging(
  input: ArrayLike<number>,
  factor: number,
  output: Float32Array = new Float32Array(Math.floor(input.length / factor))
): Float32Array {
  if (factor <= 1) {
    for (let i = 0; i < output.length; i++) output[i] = input[i];
    return output;
  }
  for (let i = 0; i < output.length; i++) {
    let sum = 0;
    const start = i * factor;
    for (let k = 0; k < factor; k++) sum += input[start + k];
    output[i] = sum / factor;
  }
  return output;
}

/** Continuous (fractional) MIDI note number for a frequency. A4 = 440 Hz = 69. */
export function frequencyToMidiFloat(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}
