import { describe, expect, it } from 'vitest';
import { NoteTracker, PitchFrame } from '../../../src/core/pitch/noteTracker';

const hz = (m: number, cents = 0) => 440 * Math.pow(2, (m - 69 + cents / 100) / 12);
const note = (m: number, rms = 0.1, cents = 0): PitchFrame => ({ frequencyHz: hz(m, cents), clarity: 0.95, rms });
const silence: PitchFrame = { frequencyHz: null, clarity: 0, rms: 0.001 };

function run(tracker: NoteTracker, frames: PitchFrame[]): number[] {
  return frames.map((f) => tracker.push(f)).filter((m): m is number => m !== null);
}

describe('NoteTracker', () => {
  it('emits a note once after it is stable for a few frames', () => {
    const tracker = new NoteTracker({ stableFrames: 3 });
    expect(run(tracker, [note(60), note(60)])).toEqual([]);
    expect(run(tracker, [note(60), note(60), note(60)])).toEqual([60]);
  });

  it('ignores a single glitchy frame', () => {
    const tracker = new NoteTracker({ stableFrames: 3 });
    expect(run(tracker, [note(60), note(67), note(60), note(60), note(60)])).toEqual([60]);
  });

  it('emits successive different notes of an arpeggio', () => {
    const tracker = new NoteTracker();
    const frames = [60, 64, 67].flatMap((m) => [note(m), note(m), note(m), note(m)]);
    expect(run(tracker, frames)).toEqual([60, 64, 67]);
  });

  it('suppresses octave jumps on a decaying note but accepts a re-picked octave', () => {
    const tracker = new NoteTracker();
    const decay = [note(55, 0.1), note(55, 0.09), note(55, 0.08), note(67, 0.07), note(67, 0.06), note(67, 0.05)];
    expect(run(tracker, decay)).toEqual([55]);
    const repick = [note(67, 0.2), note(67, 0.19), note(67, 0.18)];
    expect(run(tracker, repick)).toEqual([67]);
  });

  it('re-emits the same note after silence', () => {
    const tracker = new NoteTracker({ releaseFrames: 2 });
    const frames = [note(60), note(60), note(60), silence, silence, note(60), note(60), note(60)];
    expect(run(tracker, frames)).toEqual([60, 60]);
  });

  it('rejects badly out-of-tune frames', () => {
    const tracker = new NoteTracker({ maxCentsOffset: 40 });
    expect(run(tracker, [note(60, 0.1, 48), note(60, 0.1, 48), note(60, 0.1, 48)])).toEqual([]);
  });
});
