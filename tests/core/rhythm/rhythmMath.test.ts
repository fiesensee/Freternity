import { describe, expect, it } from 'vitest';
import {
  gradeOffset,
  gridInterval,
  latencyFromCalibration,
  matchToGrid,
  timingStats,
} from '../../../src/core/rhythm/rhythmMath';

const grid = { startTime: 10, bpm: 120, subdivision: 2 as const }; // eighths: 250 ms apart

describe('rhythmMath', () => {
  it('spaces the grid by tempo and subdivision', () => {
    expect(gridInterval({ bpm: 60, subdivision: 1 })).toBe(1);
    expect(gridInterval({ bpm: 120, subdivision: 4 })).toBe(0.125);
    expect(gridInterval({ bpm: 90, subdivision: 3 })).toBeCloseTo(0.2222, 4);
  });

  it('snaps a played time to the nearest slot, early negative / late positive', () => {
    expect(matchToGrid(10.51, grid)).toEqual({ slot: 2, offsetMs: expect.closeTo(10, 6) });
    expect(matchToGrid(10.73, grid)).toEqual({ slot: 3, offsetMs: expect.closeTo(-20, 6) });
    expect(matchToGrid(9.5, grid)).toBeNull(); // during the count-in
  });

  it('removes measured latency before snapping', () => {
    // played exactly on slot 4, heard 90 ms later
    expect(matchToGrid(11.09, grid, 90)).toEqual({ slot: 4, offsetMs: expect.closeTo(0, 6) });
  });

  it('summarizes consistency', () => {
    const s = timingStats([-10, 0, 10, 20, 60])!;
    expect(s.meanMs).toBe(16);
    expect(s.medianMs).toBe(10);
    expect(s.spreadMs).toBeCloseTo(24.17, 1);
    expect(s.within25).toBe(0.8);
    expect(s.within50).toBe(0.8);
    expect(timingStats([])).toBeNull();
  });

  it('calibrates from the median, ignoring a fluffed note, and needs a few hits', () => {
    expect(latencyFromCalibration([82, 88, 85, 300, 86, 84])).toBe(86 - 0.5 > 85 ? 86 : 85);
    expect(latencyFromCalibration([80, 90])).toBeNull();
  });

  it('grades offsets', () => {
    expect([12, -30, 70].map(gradeOffset)).toEqual(['tight', 'ok', 'off']);
  });
});
