import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version';
import packageJson from '../package.json';
// @ts-expect-error JavaScript ES module in scripts/ directory
import { calculateNextVersion } from '../scripts/release.mjs';

describe('App Versioning', () => {
  it('exports version matching package.json', () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it('follows semantic versioning format (MAJOR.MINOR.PATCH)', () => {
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
    expect(APP_VERSION).toMatch(semverRegex);
  });

  describe('calculateNextVersion semver logic', () => {
    it('bumps patch for fixes or chores', () => {
      const res = calculateNextVersion('0.2.0', 'auto', ['fix: resolve fret offset', 'chore: clean tests']);
      expect(res.bumpType).toBe('patch');
      expect(res.nextVersion).toBe('0.2.1');
    });

    it('bumps minor for new features', () => {
      const res = calculateNextVersion('0.2.0', 'auto', ['feat: add all inversions mode', 'fix: tone plucking']);
      expect(res.bumpType).toBe('minor');
      expect(res.nextVersion).toBe('0.3.0');
    });

    it('bumps major for breaking changes', () => {
      const res1 = calculateNextVersion('0.2.0', 'auto', ['feat!: redesign core models']);
      expect(res1.bumpType).toBe('major');
      expect(res1.nextVersion).toBe('1.0.0');

      const res2 = calculateNextVersion('0.2.0', 'auto', ['refactor: overhaul engine\n\nBREAKING CHANGE: state shape changed']);
      expect(res2.bumpType).toBe('major');
      expect(res2.nextVersion).toBe('1.0.0');
    });

    it('honors explicit bump override', () => {
      expect(calculateNextVersion('0.2.0', 'major').nextVersion).toBe('1.0.0');
      expect(calculateNextVersion('0.2.0', 'minor').nextVersion).toBe('0.3.0');
      expect(calculateNextVersion('0.2.0', 'patch').nextVersion).toBe('0.2.1');
    });
  });
});
