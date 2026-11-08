import { describe, expect, it } from 'vitest';
import {
  computeRms,
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
