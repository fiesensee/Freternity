import { describe, expect, it } from 'vitest';
import { describeKey, summarizeDrillOptions } from '../../src/components/practice/DrillSettings';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';

describe('drill settings summary', () => {
  it('summarizes the default options in one line', () => {
    expect(summarizeDrillOptions(DEFAULT_DRILL_CONFIG).join(' · ')).toBe(
      'strings 1-2-3 · all inversions · next after 4s · drone on'
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
      'strings 1-2-3, 2-3-4',
      'root pos & 2nd inv',
      'self-graded',
      'drone off',
    ]);
  });

  it('names the key readably', () => {
    expect(describeKey(DEFAULT_DRILL_CONFIG.scaleContext)).toBe('A Minor');
  });
});
