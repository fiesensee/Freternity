import { describe, expect, it } from 'vitest';
import { describeKey, summarizeDrillOptions } from '../../src/components/practice/DrillSettings';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';

describe('drill settings summary', () => {
  it('summarizes the default options in one line', () => {
    expect(summarizeDrillOptions(DEFAULT_DRILL_CONFIG).join(' · ')).toBe(
      'strings 4-5-6 · all inversions · next after 4s · drone on'
    );
  });

  it('lists chosen inversions, string sets and self-grading', () => {
    const summary = summarizeDrillOptions({
      ...DEFAULT_DRILL_CONFIG,
      inversions: ['ROOT', 'SECOND'],
      stringSets: [[1, 2, 3], [2, 3, 4]],
      autoAdvance: false,
      playDrone: false,
    });
    expect(summary).toEqual([
      'strings 4-5-6, 3-4-5',
      'root pos & 2nd inv',
      'self-graded',
      'drone off',
    ]);
  });

  it('names the key readably', () => {
    expect(describeKey(DEFAULT_DRILL_CONFIG.scaleContext)).toBe('A Minor');
  });

  it('summarizes the CAGED chord-shape drill by its shapes', () => {
    const caged = { ...DEFAULT_DRILL_CONFIG, exerciseType: 'CAGED_CHORD_SHAPE' as const };
    expect(summarizeDrillOptions(caged)).toEqual(['all 5 shapes', 'next after 4s', 'drone on']);
    expect(summarizeDrillOptions({ ...caged, cagedShapes: ['G', 'E'] })[0]).toBe('G, E shapes');
    expect(summarizeDrillOptions({ ...caged, cagedShapes: ['D'] })[0]).toBe('D shape');
  });

  it('summarizes the scale-in-time drill by tempo, grid and positions', () => {
    const rhythm = {
      ...DEFAULT_DRILL_CONFIG,
      exerciseType: 'SCALE_RHYTHM' as const,
      rhythm: { bpm: 90, subdivision: 4 as const },
    };
    expect(summarizeDrillOptions(rhythm)).toEqual(['sixteenths at 90 bpm', 'all 5 positions', 'next after 4s']);
    expect(summarizeDrillOptions({ ...rhythm, cagedShapes: ['E'] })[1]).toBe('E position');
  });
});
