import { describe, expect, it } from 'vitest';
import { ExpectedNote, scoreTake, takeDurationMs } from '../../../src/core/rhythm/takeScoring';

const grid = { startTime: 10, bpm: 120, subdivision: 2 as const }; // 250 ms slots
const expected: ExpectedNote[] = [40, 42, 43, 45].map((midi, slot) => ({ slot, midi, stringIndex: 6, fret: midi - 40 }));
const at = (slot: number, offsetMs: number, latencyMs = 0) => 10 + slot * 0.25 + (offsetMs + latencyMs) / 1000;

describe('scoreTake', () => {
  it('a clean take passes, with timing measured after latency correction', () => {
    const played = expected.map((e, i) => ({ time: at(e.slot, [5, -10, 0, 20][i], 90), midi: e.midi }));
    const s = scoreTake(expected, played, grid, 90);
    expect(s.outcomes.map((o) => o.status)).toEqual(['RIGHT', 'RIGHT', 'RIGHT', 'RIGHT']);
    expect(s.timing!.meanMs).toBeCloseTo(3.75, 5);
    expect(s.passed).toBe(true);
  });

  it('judges notes and timing separately', () => {
    const played = [
      { time: at(0, 0), midi: 40 },
      { time: at(1, 70), midi: 42 }, // right note, late
      { time: at(2, 0), midi: 44 }, // on time, wrong note
      // slot 3 missed
    ];
    const s = scoreTake(expected, played, grid, 0);
    expect(s.outcomes.map((o) => o.status)).toEqual(['RIGHT', 'RIGHT', 'WRONG_NOTE', 'MISSED']);
    expect([s.rightNotes, s.wrongNotes, s.missed]).toEqual([2, 1, 1]);
    expect(s.timing!.count).toBe(3); // the wrong note still counts for timing
    expect(s.passed).toBe(false);
  });

  it('a doubled pluck keeps the better one and counts the other as extra', () => {
    const played = [
      { time: at(0, -40), midi: 41 },
      { time: at(0, 15), midi: 40 },
      { time: at(9, 0), midi: 50 }, // after the take
      { time: 9, midi: 40 }, // during the count-in
    ];
    const s = scoreTake(expected, played, grid, 0);
    expect(s.outcomes[0]).toEqual({ status: 'RIGHT', offsetMs: expect.closeTo(15, 6), playedMidi: 40 });
    expect(s.extras).toBe(3);
  });

  it('live scoring only judges notes that are already due', () => {
    const s = scoreTake(expected, [{ time: at(0, 0), midi: 40 }], grid, 0, 0);
    expect([s.rightNotes, s.missed, s.noteAccuracy]).toEqual([1, 0, 1]);
  });

  it('take length covers count-in, notes and a tail', () => {
    // 4 beats at 120 = 2 s, 31 eighths = 7.75 s, + 0.8 s
    expect(takeDurationMs({ bpm: 120, subdivision: 2 }, 31, 4)).toBe(10550);
  });
});
