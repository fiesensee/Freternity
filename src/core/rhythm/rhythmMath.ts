/**
 * Timing math for rhythm practice. All times are in seconds on one shared audio clock.
 */

export type Subdivision = 1 | 2 | 3 | 4; // quarters, eighths, triplets, sixteenths

export interface RhythmGrid {
  /** Audio-clock time of the first beat after the count-in */
  startTime: number;
  bpm: number;
  subdivision: Subdivision;
}

export const gridInterval = (grid: Pick<RhythmGrid, 'bpm' | 'subdivision'>): number =>
  60 / grid.bpm / grid.subdivision;

export interface GridHit {
  /** Index of the nearest grid slot (0 = first beat after the count-in) */
  slot: number;
  /** Played time minus target time, in ms (negative = early) */
  offsetMs: number;
}

/**
 * Snaps a played time onto the nearest slot of the grid, after removing the system's
 * latency (what the calibration measured). Returns null before the first slot.
 */
export function matchToGrid(time: number, grid: RhythmGrid, latencyMs = 0): GridHit | null {
  const interval = gridInterval(grid);
  const corrected = time - latencyMs / 1000;
  const slot = Math.round((corrected - grid.startTime) / interval);
  if (slot < 0) return null;
  return { slot, offsetMs: (corrected - (grid.startTime + slot * interval)) * 1000 };
}

export interface TimingStats {
  count: number;
  meanMs: number;
  medianMs: number;
  /** Standard deviation: how consistent the timing is (the part calibration can't remove) */
  spreadMs: number;
  /** Share of hits within ±25 ms and ±50 ms */
  within25: number;
  within50: number;
}

export function timingStats(offsetsMs: readonly number[]): TimingStats | null {
  const n = offsetsMs.length;
  if (n === 0) return null;
  const mean = offsetsMs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...offsetsMs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = offsetsMs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n;
  const share = (limit: number) => offsetsMs.filter((x) => Math.abs(x) <= limit).length / n;
  return {
    count: n,
    meanMs: mean,
    medianMs: median,
    spreadMs: Math.sqrt(variance),
    within25: share(25),
    within50: share(50),
  };
}

/**
 * The latency to subtract from now on: the median offset of a calibration run in which
 * the player aimed exactly at the beat. The median ignores the odd fluffed note.
 */
export function latencyFromCalibration(rawOffsetsMs: readonly number[]): number | null {
  const stats = timingStats(rawOffsetsMs);
  return stats && stats.count >= 4 ? Math.round(stats.medianMs) : null;
}

export type TimingGrade = 'tight' | 'ok' | 'off';

export const gradeOffset = (offsetMs: number): TimingGrade =>
  Math.abs(offsetMs) <= 25 ? 'tight' : Math.abs(offsetMs) <= 50 ? 'ok' : 'off';
