import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_FRAME_SIZE,
  analysisDecimation,
  computeRms,
  downsampleByAveraging,
  detectPitchYin,
  frequencyToMidiFloat,
} from '../../../src/core/pitch/yinPitchDetector';

const SAMPLE_RATE = 48000;
const FRAME = 2048;

/** Guitar-like tone: fundamental plus decaying harmonics */
function pluckedTone(freq: number, harmonics = [1, 0.6, 0.4, 0.25, 0.15]): Float32Array {
  const buf = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    const t = i / SAMPLE_RATE;
    buf[i] = harmonics.reduce((acc, amp, h) => acc + amp * Math.sin(2 * Math.PI * freq * (h + 1) * t), 0) * 0.2;
  }
  return buf;
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

describe('detectPitchYin', () => {
  it.each([
    ['low E2 (open 6th string)', 40],
    ['G3 (open 3rd string)', 55],
    ['E4 (open 1st string)', 64],
    ['D6 (fret 22, 1st string)', 86],
  ])('detects %s within 10 cents', (_label, midi) => {
    const result = detectPitchYin(pluckedTone(midiHz(midi)), SAMPLE_RATE);
    expect(result).not.toBeNull();
    const cents = (frequencyToMidiFloat(result!.frequencyHz) - midi) * 100;
    expect(Math.abs(cents)).toBeLessThan(10);
    expect(result!.clarity).toBeGreaterThan(0.85);
  });

  it('does not jump an octave on a tone with a strong 2nd harmonic', () => {
    const result = detectPitchYin(pluckedTone(midiHz(50), [0.5, 1, 0.3]), SAMPLE_RATE);
    expect(Math.round(frequencyToMidiFloat(result!.frequencyHz))).toBe(50);
  });

  describe('high sample rates (audio interfaces at 88.2 / 96 / 192 kHz)', () => {
    const toneAt = (freq: number, sampleRate: number, length: number) =>
      Float32Array.from({ length }, (_, i) =>
        [1, 0.6, 0.4, 0.25].reduce(
          (acc, amp, h) => acc + amp * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sampleRate),
          0
        ) * 0.2
      );

    it('a raw 2048-sample frame at 96 kHz is too short for low E and F (the bug)', () => {
      expect(detectPitchYin(toneAt(midiHz(40), 96000, 2048), 96000)).toBeNull();
      expect(detectPitchYin(toneAt(midiHz(41), 96000, 2048), 96000)).toBeNull();
    });

    it.each([44100, 48000, 88200, 96000, 176400, 192000])(
      'detects low E and F at %i Hz once downsampled to ~48 kHz',
      (sampleRate) => {
        const factor = analysisDecimation(sampleRate);
        for (const midi of [40, 41, 42]) {
          const raw = toneAt(midiHz(midi), sampleRate, ANALYSIS_FRAME_SIZE * factor);
          const frame = downsampleByAveraging(raw, factor);
          expect(frame).toHaveLength(ANALYSIS_FRAME_SIZE);
          const result = detectPitchYin(frame, sampleRate / factor);
          expect(result).not.toBeNull();
          expect(Math.abs((frequencyToMidiFloat(result!.frequencyHz) - midi) * 100)).toBeLessThan(10);
        }
      }
    );

    it('picks the downsampling factor from the sample rate', () => {
      expect([44100, 48000, 88200, 96000, 192000].map(analysisDecimation)).toEqual([1, 1, 2, 2, 4]);
    });
  });

  it('returns null for white noise', () => {
    let seed = 1;
    const noise = new Float32Array(FRAME).map(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.4;
    });
    expect(detectPitchYin(noise, SAMPLE_RATE)).toBeNull();
  });

  it('computes RMS', () => {
    expect(computeRms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1);
    expect(computeRms(new Float32Array(16))).toBe(0);
  });
});
