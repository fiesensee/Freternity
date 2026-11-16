import { describe, expect, it } from 'vitest';
import { generateScaleRhythmChallenge } from '../../src/core/drills/scaleRhythmGenerator';
import { scoreTake } from '../../src/core/rhythm/takeScoring';
import {
  DEFAULT_DRILL_CONFIG,
  rhythmScoreToEvaluation,
  rhythmTurnaroundSlot,
} from '../../src/store/usePracticeStore';

const challenge = generateScaleRhythmChallenge({
  ...DEFAULT_DRILL_CONFIG,
  exerciseType: 'SCALE_RHYTHM',
  scaleContext: { enabled: true, rootPitchClass: 7, preferFlats: false, scaleId: 'ionian' },
  cagedShapes: ['E'],
  rhythm: { bpm: 120, subdivision: 2 },
});
const expected = challenge.rhythm!.expected;
const grid = { startTime: 0, bpm: 120, subdivision: 2 as const };
const at = (slot: number) => slot * 0.25;

describe('rhythmScoreToEvaluation', () => {
  it('a perfect take: every position right, nothing missed, passes', () => {
    const played = expected.map((e) => ({ time: at(e.slot), midi: e.midi }));
    const ev = rhythmScoreToEvaluation(scoreTake(expected, played, grid, 0), challenge, true);
    expect(ev.isMatch).toBe(true);
    expect(ev.correctPositions).toHaveLength(17); // each position once, though played twice
    expect(ev.missedPositions).toEqual([]);
  });

  it('a position right on the way up but skipped on the way down is not shown as missed', () => {
    const skipDownSlot = 20; // a note of the descending half
    const played = expected.filter((e) => e.slot !== skipDownSlot).map((e) => ({ time: at(e.slot), midi: e.midi }));
    const ev = rhythmScoreToEvaluation(scoreTake(expected, played, grid, 0), challenge, true);
    expect(ev.rhythmScore!.missed).toBe(1);
    expect(ev.missedPositions).toEqual([]);
  });

  it('places a wrong pitch inside the box, and shows missed notes only in the final result', () => {
    const played = [{ time: at(0), midi: expected[0].midi + 1 }]; // G2 instead of F#2: low E fret 3
    const live = rhythmScoreToEvaluation(scoreTake(expected, played, grid, 0), challenge, false);
    expect(live.wrongPositions).toEqual([{ stringIndex: 6, fret: 3 }]);
    expect(live.missedPositions).toEqual([]);
    expect(live.isMatch).toBe(false);
    const final = rhythmScoreToEvaluation(scoreTake(expected, played, grid, 0), challenge, true);
    expect(final.missedPositions.length).toBeGreaterThan(0);
  });

  it('from the top note on, the way up is no longer marked', () => {
    const played = expected.map((e) => ({ time: at(e.slot), midi: e.midi }));
    const top = rhythmTurnaroundSlot(challenge);
    expect(top).toBe(16); // 17 notes up, the 17th is the top
    // Up pass done, top note and two more on the way down played
    const sofar = played.slice(0, top + 3);
    const ev = rhythmScoreToEvaluation(scoreTake(expected, sofar, grid, 0), challenge, false, top);
    const lit = ev.correctPositions.map((p) => `${p.stringIndex}-${p.fret}`).sort();
    expect(lit).toEqual(
      expected.slice(top, top + 3).map((e) => `${e.stringIndex}-${e.fret}`).sort()
    );
    // The take's score still counts everything played so far
    expect(ev.rhythmScore!.rightNotes).toBe(top + 3);
  });

  it('grades each right position by timing, the worse of the way up and down', () => {
    const offsetMs = (slot: number) => (slot === 3 ? 40 : slot === expected.length - 4 ? 90 : 5);
    const played = expected.map((e) => ({ time: at(e.slot) + offsetMs(e.slot) / 1000, midi: e.midi }));
    const ev = rhythmScoreToEvaluation(scoreTake(expected, played, grid, 0), challenge, true);
    const key = (slot: number) => `${expected[slot].stringIndex}-${expected[slot].fret}`;
    // Slot 3 and slot 29 are the same position (4th note up / 4th from the end down)
    expect(key(3)).toBe(key(expected.length - 4));
    expect(ev.timingGrades![key(3)]).toBe('off'); // ±40 up, +90 down → worse wins
    expect(ev.timingGrades![key(0)]).toBe('tight');
    expect(ev.timingGrades![key(4)]).toBe('tight');
  });
});
