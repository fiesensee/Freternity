import { describe, expect, it } from 'vitest';
import {
  INITIAL_DRILL_ENGINE_STATE,
  pauseDrill,
  recordSelfGrade,
  resumeDrill,
  startChallenge,
  transitionToReveal,
} from '../../src/core/drills/drillEngine';
import { generateTriadInversionChallenge } from '../../src/core/drills/triadInversionGenerator';
import { DEFAULT_DRILL_CONFIG } from '../../src/store/usePracticeStore';

describe('drillEngine state machine', () => {
  const challenge = generateTriadInversionChallenge(DEFAULT_DRILL_CONFIG);

  it('starts challenge in PROMPTING phase with countdown', () => {
    const state = startChallenge(challenge, 8000);
    expect(state.phase).toBe('PROMPTING');
    expect(state.timeRemainingMs).toBe(8000);
    expect(state.currentChallenge).toBe(challenge);
  });

  it('transitions to REVEALING phase', () => {
    const promptingState = startChallenge(challenge, 8000);
    const revealingState = transitionToReveal(promptingState, 4000);

    expect(revealingState.phase).toBe('REVEALING');
    expect(revealingState.timeRemainingMs).toBe(4000);
    expect(revealingState.totalDurationMs).toBe(4000);
  });

  it('records self-grades accurately', () => {
    let state = INITIAL_DRILL_ENGINE_STATE;
    state = recordSelfGrade(state, true); // Passed
    expect(state.stats).toEqual({ total: 1, passed: 1, missed: 0 });

    state = recordSelfGrade(state, false); // Missed
    expect(state.stats).toEqual({ total: 2, passed: 1, missed: 1 });
  });

  it('pauses and resumes cleanly', () => {
    const promptingState = startChallenge(challenge, 8000);
    const paused = pauseDrill(promptingState);
    expect(paused.phase).toBe('PAUSED');

    const resumed = resumeDrill(paused, 'PROMPTING');
    expect(resumed.phase).toBe('PROMPTING');
  });
});
