import { DrillChallenge, DrillPhase } from '../models';

export interface DrillEngineState {
  phase: DrillPhase;
  currentChallenge: DrillChallenge | null;
  timeRemainingMs: number;
  totalDurationMs: number;
  stats: {
    total: number;
    passed: number;
    missed: number;
  };
}

export const INITIAL_DRILL_ENGINE_STATE: DrillEngineState = {
  phase: 'IDLE',
  currentChallenge: null,
  timeRemainingMs: 0,
  totalDurationMs: 0,
  stats: {
    total: 0,
    passed: 0,
    missed: 0,
  },
};

export function startChallenge(
  challenge: DrillChallenge,
  promptDurationMs: number,
  currentStats = INITIAL_DRILL_ENGINE_STATE.stats
): DrillEngineState {
  return {
    phase: 'PROMPTING',
    currentChallenge: challenge,
    timeRemainingMs: promptDurationMs,
    totalDurationMs: promptDurationMs,
    stats: currentStats,
  };
}

export function transitionToReveal(
  state: DrillEngineState,
  revealDurationMs: number
): DrillEngineState {
  if (state.phase !== 'PROMPTING') return state;

  return {
    ...state,
    phase: 'REVEALING',
    timeRemainingMs: revealDurationMs,
    totalDurationMs: revealDurationMs,
  };
}

export function recordSelfGrade(
  state: DrillEngineState,
  passed: boolean
): DrillEngineState {
  return {
    ...state,
    stats: {
      total: state.stats.total + 1,
      passed: passed ? state.stats.passed + 1 : state.stats.passed,
      missed: passed ? state.stats.missed : state.stats.missed + 1,
    },
  };
}

export function pauseDrill(state: DrillEngineState): DrillEngineState {
  if (state.phase === 'PROMPTING' || state.phase === 'REVEALING') {
    return {
      ...state,
      phase: 'PAUSED',
    };
  }
  return state;
}

export function resumeDrill(
  state: DrillEngineState,
  previousPhase: 'PROMPTING' | 'REVEALING'
): DrillEngineState {
  if (state.phase === 'PAUSED') {
    return {
      ...state,
      phase: previousPhase,
    };
  }
  return state;
}
