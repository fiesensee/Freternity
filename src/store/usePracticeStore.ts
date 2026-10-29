import { create } from 'zustand';
import {
  DrillChallenge,
  DrillConfig,
  FretboardViewState,
  FretPosition,
  TriadInversion,
} from '../core/models';
import {
  DrillEngineState,
  INITIAL_DRILL_ENGINE_STATE,
  pauseDrill,
  resumeDrill,
  startChallenge,
  transitionToReveal,
} from '../core/drills/drillEngine';
import { generateTriadInversionChallenge } from '../core/drills/triadInversionGenerator';
import { audioSynthAdapter } from '../adapters/audioSynth';
import { wakeLockAdapter } from '../adapters/wakeLock';
import { GUITAR_6_STANDARD } from '../core/constants';
import { midiToFrequencyHz } from '../core/musicTheory';

export interface PracticeEvaluation {
  isMatch: boolean;
  correctPositions: readonly FretPosition[];
  wrongPositions: readonly FretPosition[];
  missedPositions: readonly FretPosition[];
  foundInversions?: readonly TriadInversion[];
  missingInversions?: readonly TriadInversion[];
}

export function evaluateVoicingSelection(
  userPositions: readonly FretPosition[],
  validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>>,
  exerciseType?: DrillConfig['exerciseType'],
  inversionVoicings?: Record<TriadInversion, ReadonlyArray<readonly FretPosition[]>>
): PracticeEvaluation | null {
  if (userPositions.length === 0 || validVoicings.length === 0) {
    return null;
  }

  // --- BRANCH 1: TRIAD_ALL_INVERSIONS ---
  if (exerciseType === 'TRIAD_ALL_INVERSIONS' && inversionVoicings) {
    const isPosInList = (pos: FretPosition, list: readonly FretPosition[]) =>
      list.some((p) => p.stringIndex === pos.stringIndex && p.fret === pos.fret);

    const allValidPositions = validVoicings.flat();
    const correctPositions = userPositions.filter((u) => isPosInList(u, allValidPositions));
    const wrongPositions = userPositions.filter((u) => !isPosInList(u, allValidPositions));

    const inversionTypes: TriadInversion[] = ['ROOT', 'FIRST', 'SECOND'];
    const foundInversions: TriadInversion[] = [];
    const missingInversions: TriadInversion[] = [];
    const missedPositions: FretPosition[] = [];

    for (const inv of inversionTypes) {
      const voicingsForInv = inversionVoicings[inv] ?? [];
      // Has the user identified this inversion (either <= 12 or > 12)?
      const hasFound = voicingsForInv.some((voicing) =>
        voicing.every((vPos) => isPosInList(vPos, userPositions))
      );

      if (hasFound) {
        foundInversions.push(inv);
      } else {
        missingInversions.push(inv);
        // Highlight positions of the primary voicing (lowest frets) as missed
        if (voicingsForInv.length > 0) {
          const primaryVoicing = voicingsForInv[0];
          for (const p of primaryVoicing) {
            if (!isPosInList(p, userPositions) && !isPosInList(p, missedPositions)) {
              missedPositions.push(p);
            }
          }
        }
      }
    }

    // Correct if all 3 inversions are found and no wrong notes were picked
    const isMatch = foundInversions.length === 3 && wrongPositions.length === 0;

    return {
      isMatch,
      correctPositions,
      wrongPositions,
      missedPositions,
      foundInversions,
      missingInversions,
    };
  }

  // --- BRANCH 2: Single Voicing (TRIAD_INVERSION_HUNTER) ---
  let bestVoicing = validVoicings[0];
  let maxMatches = -1;

  for (const voicing of validVoicings) {
    let matches = 0;
    for (const u of userPositions) {
      if (voicing.some((v) => v.stringIndex === u.stringIndex && v.fret === u.fret)) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestVoicing = voicing;
    }
  }

  const correctPositions = userPositions.filter((u) =>
    bestVoicing.some((v) => v.stringIndex === u.stringIndex && v.fret === u.fret)
  );

  const wrongPositions = userPositions.filter(
    (u) => !bestVoicing.some((v) => v.stringIndex === u.stringIndex && v.fret === u.fret)
  );

  const missedPositions = bestVoicing.filter(
    (v) => !userPositions.some((u) => u.stringIndex === v.stringIndex && u.fret === v.fret)
  );

  const isMatch =
    correctPositions.length === bestVoicing.length &&
    wrongPositions.length === 0 &&
    missedPositions.length === 0;

  return {
    isMatch,
    correctPositions,
    wrongPositions,
    missedPositions,
  };
}

export const DEFAULT_DRILL_CONFIG: DrillConfig = {
  exerciseType: 'TRIAD_INVERSION_HUNTER',
  scaleContext: {
    enabled: true,
    rootPitchClass: 9, // A
    preferFlats: true,
    scaleId: 'aeolian',
  },
  stringSets: [[1, 2, 3]],
  inversions: ['ROOT', 'FIRST', 'SECOND'],
  fretZone: { min: 0, max: 22 },
  promptDurationMs: 8000,
  revealDurationMs: 4000,
  autoAdvance: true,
  playDrone: true,
  playSolutionAudioOnReveal: true,
};

export interface PracticeStore {
  config: DrillConfig;
  engine: DrillEngineState;
  previousPhase: 'PROMPTING' | 'REVEALING';
  userSelections: readonly FretPosition[];
  evaluation: PracticeEvaluation | null;

  // Actions
  startPractice: (customConfig?: Partial<DrillConfig>) => void;
  stopPractice: () => void;
  togglePause: () => void;
  revealNow: () => void;
  submitSelfGrade: (passed: boolean) => void;
  advanceToNextChallenge: (explicitPassed?: boolean) => void;
  updateConfig: (patch: Partial<DrillConfig>) => void;
  toggleDroneAudio: () => void;
  toggleSolutionAudio: () => void;
  toggleUserSelection: (position: FretPosition) => void;
  clearUserSelection: () => void;

  // View accessor for fretboard renderer
  getCurrentBoardState: (fallbackState: FretboardViewState) => FretboardViewState;
}

let timerIntervalId: ReturnType<typeof setInterval> | null = null;

export const usePracticeStore = create<PracticeStore>((set, get) => {
  const clearTimer = () => {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  };

  const playSolutionAudio = (challenge: DrillChallenge) => {
    if (!get().config.playSolutionAudioOnReveal) return;
    const firstVoicing = challenge.validVoicings[0];
    if (!firstVoicing) return;

    // Convert positions to frequencies
    const freqs = firstVoicing.map((pos) => {
      const openMidi = GUITAR_6_STANDARD.tuningMidi[pos.stringIndex - 1];
      const midi = openMidi + pos.fret;
      return midiToFrequencyHz(midi);
    });

    audioSynthAdapter.playTriadStrum(freqs, 75);
  };

  const triggerRevealTransition = () => {
    const { engine, config, userSelections } = get();
    if (!engine.currentChallenge) return;

    const evaluation = evaluateVoicingSelection(
      userSelections,
      engine.currentChallenge.validVoicings,
      config.exerciseType,
      engine.currentChallenge.inversionVoicings
    );

    const nextEngine = transitionToReveal(engine, config.revealDurationMs);
    set({
      engine: nextEngine,
      previousPhase: 'REVEALING',
      evaluation,
    });

    // Automatically stop drone once reveal is triggered
    audioSynthAdapter.stopDrone();

    playSolutionAudio(engine.currentChallenge);
  };

  const runTimerLoop = () => {
    clearTimer();
    const tickIntervalMs = 50;

    timerIntervalId = setInterval(() => {
      const state = get();
      const { engine, config } = state;

      if (engine.phase === 'PAUSED' || engine.phase === 'IDLE') return;

      const newRemaining = Math.max(0, engine.timeRemainingMs - tickIntervalMs);

      if (newRemaining <= 0) {
        if (engine.phase === 'PROMPTING') {
          // Time expired in PROMPTING -> transition to REVEAL & evaluate
          triggerRevealTransition();
        } else if (engine.phase === 'REVEALING') {
          if (config.autoAdvance) {
            get().advanceToNextChallenge();
          } else {
            set({ engine: { ...engine, timeRemainingMs: 0 } });
          }
        }
      } else {
        set({ engine: { ...engine, timeRemainingMs: newRemaining } });
      }
    }, tickIntervalMs);
  };

  return {
    config: DEFAULT_DRILL_CONFIG,
    engine: INITIAL_DRILL_ENGINE_STATE,
    previousPhase: 'PROMPTING',
    userSelections: [],
    evaluation: null,

    startPractice: (customConfig) => {
      clearTimer();
      const config = { ...get().config, ...customConfig };
      const firstChallenge = generateTriadInversionChallenge(config);
      const newEngine = startChallenge(firstChallenge, config.promptDurationMs);

      set({
        config,
        engine: newEngine,
        previousPhase: 'PROMPTING',
        userSelections: [],
        evaluation: null,
      });

      // Ambient Drone Pad & Screen Wake Lock
      if (config.playDrone) {
        audioSynthAdapter.startDrone(config.scaleContext.rootPitchClass, 0.22);
      }
      wakeLockAdapter.request().catch(() => {});

      runTimerLoop();
    },

    stopPractice: () => {
      clearTimer();
      audioSynthAdapter.stopDrone();
      wakeLockAdapter.release().catch(() => {});
      set({
        engine: INITIAL_DRILL_ENGINE_STATE,
        userSelections: [],
        evaluation: null,
      });
    },

    togglePause: () => {
      const { engine, previousPhase, config } = get();
      if (engine.phase === 'PAUSED') {
        set({ engine: resumeDrill(engine, previousPhase) });
        if (config.playDrone && previousPhase === 'PROMPTING') {
          audioSynthAdapter.startDrone(config.scaleContext.rootPitchClass, 0.22);
        }
      } else if (engine.phase === 'PROMPTING' || engine.phase === 'REVEALING') {
        if (engine.phase === 'PROMPTING') {
          audioSynthAdapter.stopDrone();
        }
        set({
          previousPhase: engine.phase,
          engine: pauseDrill(engine),
        });
      }
    },

    revealNow: () => {
      const { engine } = get();
      if (engine.phase !== 'PROMPTING') return;
      triggerRevealTransition();
    },

    submitSelfGrade: (passed) => {
      get().advanceToNextChallenge(passed);
    },

    advanceToNextChallenge: (explicitPassed) => {
      const { config, engine, evaluation } = get();

      // Determine Right vs Wrong:
      // If explicit grade provided (e.g. self-grade buttons), use it;
      // otherwise, Right ONLY if all notes were guessed correctly (evaluation?.isMatch === true)
      const isRight =
        typeof explicitPassed === 'boolean'
          ? explicitPassed
          : evaluation?.isMatch === true;

      const updatedStats = {
        total: engine.stats.total + 1,
        passed: isRight ? engine.stats.passed + 1 : engine.stats.passed,
        missed: isRight ? engine.stats.missed : engine.stats.missed + 1,
      };

      const nextChallenge = generateTriadInversionChallenge(config);
      const newEngine = startChallenge(
        nextChallenge,
        config.promptDurationMs,
        updatedStats
      );

      set({
        engine: newEngine,
        previousPhase: 'PROMPTING',
        userSelections: [],
        evaluation: null,
      });

      // Resume drone for the new challenge prompt if enabled
      if (config.playDrone) {
        audioSynthAdapter.startDrone(config.scaleContext.rootPitchClass, 0.22);
      }
    },

    updateConfig: (patch) => {
      set((state) => ({ config: { ...state.config, ...patch } }));
    },

    toggleDroneAudio: () => {
      const current = get().config.playDrone;
      const next = !current;
      get().updateConfig({ playDrone: next });
      if (next && get().engine.phase === 'PROMPTING') {
        audioSynthAdapter.startDrone(get().config.scaleContext.rootPitchClass, 0.22);
      } else {
        audioSynthAdapter.stopDrone();
      }
    },

    toggleSolutionAudio: () => {
      const current = get().config.playSolutionAudioOnReveal;
      get().updateConfig({ playSolutionAudioOnReveal: !current });
    },

    toggleUserSelection: (position) => {
      const { engine, userSelections, config } = get();
      if (engine.phase !== 'PROMPTING') return;

      // Check if position is already selected
      const isAlreadySelected = userSelections.some(
        (p) => p.stringIndex === position.stringIndex && p.fret === position.fret
      );

      let nextSelections: FretPosition[];
      if (isAlreadySelected) {
        nextSelections = userSelections.filter(
          (p) => !(p.stringIndex === position.stringIndex && p.fret === position.fret)
        );
      } else {
        if (config.exerciseType === 'TRIAD_ALL_INVERSIONS') {
          // Multi-note selection across string set: allow adding multiple frets per string
          nextSelections = [...userSelections, position];
        } else {
          // Single-note per string: replace selection on the same string
          const filtered = userSelections.filter(
            (p) => p.stringIndex !== position.stringIndex
          );
          nextSelections = [...filtered, position];
        }
      }

      set({ userSelections: nextSelections });
    },

    clearUserSelection: () => {
      set({ userSelections: [] });
    },

    getCurrentBoardState: (fallbackState) => {
      const { engine } = get();
      if (engine.phase === 'IDLE' || !engine.currentChallenge) {
        return fallbackState;
      }
      if (engine.phase === 'PROMPTING' || engine.phase === 'PAUSED') {
        return engine.currentChallenge.promptBoardState;
      }
      return engine.currentChallenge.revealBoardState;
    },
  };
});
