import { describe, expect, it } from 'vitest';
import { OnsetDetector } from '../../../src/core/rhythm/onsetDetector';

const SR = 48000;
let seed = 3;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

/**
 * Plucked notes over a little background noise: a few ms of pick click, then partials where
 * the higher ones fade faster. Like fretting a scale, each note is damped when the next one
 * starts, unless `letRing` (notes on different strings).
 */
function performance(
  notes: { at: number; freq: number; amp?: number }[],
  seconds: number,
  letRing = false
) {
  const buf = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * noise();
  notes.forEach(({ at, freq, amp = 0.3 }, n) => {
    const start = Math.round(at * SR);
    const next = notes[n + 1];
    const dampAt = !letRing && next ? next.at - at : Infinity;
    for (let i = start; i < buf.length; i++) {
      const t = (i - start) / SR;
      const damping = t > dampAt ? Math.exp(-(t - dampAt) / 0.01) : 1;
      if (damping < 1e-4) break;
      let v = 0;
      for (let h = 1; h <= 6; h++) {
        v += (1 / h) * Math.exp(-t * (1.2 + 1.5 * h)) * Math.sin(2 * Math.PI * freq * h * t + h);
      }
      const click = t < 0.004 ? 0.25 * noise() * Math.exp(-t / 0.001) : 0;
      buf[i] += amp * damping * (Math.min(1, t / 0.001) * v + click);
    }
  });
  return buf;
}

function detect(buf: Float32Array, chunk = 128) {
  const d = new OnsetDetector({ sampleRate: SR });
  const found: number[] = [];
  for (let i = 0; i < buf.length; i += chunk) found.push(...d.process(buf.subarray(i, i + chunk)));
  return found.map((s) => s / SR);
}

describe('OnsetDetector', () => {
  it('finds each pluck of a scale within 3 ms', () => {
    const times = [0.2, 0.45, 0.7, 0.95, 1.2, 1.45, 1.7, 1.95]; // eighths at 120 bpm
    const freqs = [98, 110, 123.5, 130.8, 146.8, 164.8, 185, 196];
    const found = detect(performance(times.map((at, i) => ({ at, freq: freqs[i] })), 2.4));
    expect(found).toHaveLength(times.length);
    found.forEach((t, i) => expect(Math.abs(t - times[i]) * 1000).toBeLessThan(3));
  });

  it('catches the same note picked again (which pitch tracking alone can miss)', () => {
    const times = [0.1, 0.35, 0.6, 0.85];
    const found = detect(performance(times.map((at) => ({ at, freq: 82.4 })), 1.2));
    expect(found).toHaveLength(4);
  });

  it('handles sixteenths at 120 bpm (125 ms apart)', () => {
    const times = Array.from({ length: 8 }, (_, i) => 0.1 + i * 0.125);
    const found = detect(performance(times.map((at, i) => ({ at, freq: 110 + i * 12 })), 1.4));
    expect(found).toHaveLength(8);
  });

  it('finds plucks while notes on other strings keep ringing and beat against each other', () => {
    // An arpeggio left to ring: 4 notes overlapping, then 0.8 s of pure ringing
    const times = [0.1, 0.35, 0.6, 0.85];
    const found = detect(
      performance(times.map((at, i) => ({ at, freq: [110, 138.6, 164.8, 220][i] })), 1.8, true)
    );
    expect(found).toHaveLength(4);
    found.forEach((t, i) => expect(Math.abs(t - times[i]) * 1000).toBeLessThan(3));
  });

  it('ignores loud mains hum and finds the plucks on top of it', () => {
    const buf = performance([{ at: 0.3, freq: 82.4 }, { at: 0.8, freq: 87.3 }], 1.3);
    for (let i = 0; i < buf.length; i++) buf[i] += 0.15 * Math.sin((2 * Math.PI * 50 * i) / SR);
    const found = detect(buf);
    expect(found).toHaveLength(2);
    expect(Math.abs(found[0] - 0.3) * 1000).toBeLessThan(3);
  });

  it('ignores background noise and a quiet note below the gate', () => {
    expect(detect(performance([{ at: 0.3, freq: 200, amp: 0.005 }], 1))).toEqual([]);
  });

  it('gives the same answer regardless of chunk size', () => {
    const buf = performance([{ at: 0.123, freq: 140 }, { at: 0.5, freq: 160 }], 0.8);
    expect(detect(buf, 128)).toEqual(detect(buf, 1000));
  });
});
