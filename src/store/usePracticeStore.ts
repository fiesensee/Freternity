import { create } from 'zustand';
import {
  DrillChallenge,
  DrillConfig,
  FretboardViewState,
  FretPosition,
  MidiNote,
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
import {
  appendHeardNote,
  mapHeardNotesToPositions,
  positionToMidi,
} from '../core/drills/heardNoteMapper';
import { getAscendingInversionSequence } from '../core/triadVoicings';
import { guitarPitchInput } from '../adapters/guitarPitchInput';

export type PracticeInputMode = 'POINTER' | 'GUITAR';
export type GuitarInputStatus = 'OFF' | 'STARTING' | 'LISTENING' | 'ERROR';

/** Ignore the mic right after a new prompt so the previous reveal strum doesn't count. */
const PROMPT_START_DEAF_MS = 600;

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
  promptDurationMs: 45000,
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
  inputMode: PracticeInputMode;
  guitarInputStatus: GuitarInputStatus;
  guitarInputError: string | null;
  /** Distinct MIDI notes heard from the guitar during the current prompt (oldest first) */
  heardNotes: readonly MidiNote[];
  /** Per-note feedback while still prompting (guitar input): correct/wrong only, never missed */
  liveEvaluation: PracticeEvaluation | null;
  /** All-inversions drill with guitar input: how many shapes (nut → 12th fret) are done */
  inversionStep: number;

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
  setInputMode: (mode: PracticeInputMode) => Promise<void>;
  registerPlayedNote: (midi: MidiNote) => void;

  // View accessor for fretboard renderer
  getCurrentBoardState: (fallbackState: FretboardViewState) => FretboardViewState;
}

let timerIntervalId: ReturnType<typeof setInterval> | null = null;
let unsubscribeGuitarInput: (() => void) | null = null;

export const usePracticeStore = create<PracticeStore>((set, get) => {
  const clearTimer = () => {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  };

  /** Drone would be picked up by the mic (it sits on the root), so it stays off while listening. */
  const startDroneForPrompt = () => {
    const { config, inputMode } = get();
    if (config.playDrone && inputMode !== 'GUITAR') {
      audioSynthAdapter.startDrone(config.scaleContext.rootPitchClass, 0.22);
    }
  };

  const onNewPrompt = () => {
    startDroneForPrompt();
    if (get().inputMode === 'GUITAR') {
      guitarPitchInput.resetTracking(PROMPT_START_DEAF_MS);
    }
  };

  /**
   * All-inversions drill with guitar input: the three shapes must be played in order from
   * the nut upward. Each note is judged against the shape that's due next, which also tells
   * us where on the neck it was played. A completed shape locks in and clears its mistakes.
   */
  const registerSequentialInversionNote = (midi: MidiNote, challenge: DrillChallenge) => {
    const { config, heardNotes, inversionStep } = get();
    const sequence = getAscendingInversionSequence(challenge.inversionVoicings!);
    const expected = sequence[inversionStep];
    if (!expected) return;

    const activeStrings = challenge.promptBoardState.filterMask.activeStrings;
    const stepHeard = appendHeardNote(heardNotes, midi, 'TRIAD_INVERSION_HUNTER');
    const expectedMidis = expected.positions.map((p) => positionToMidi(p, GUITAR_6_STANDARD));
    const isStepComplete = expectedMidis.every((m) => stepHeard.includes(m));

    const nextStep = isStepComplete ? inversionStep + 1 : inversionStep;
    const lockedIn = sequence.slice(0, nextStep).flatMap((s) => s.positions);
    const currentAttempt = isStepComplete
      ? []
      : mapHeardNotesToPositions(
          stepHeard,
          [expected.positions],
          'TRIAD_INVERSION_HUNTER',
          activeStrings,
          config.fretZone,
          GUITAR_6_STANDARD
        );
    const isCorrect = (p: FretPosition) =>
      expected.positions.some((e) => e.stringIndex === p.stringIndex && e.fret === p.fret);

    const foundInversions = sequence.slice(0, nextStep).map((s) => s.inversion);
    const liveEvaluation: PracticeEvaluation = {
      isMatch: nextStep >= sequence.length,
      correctPositions: [...lockedIn, ...currentAttempt.filter(isCorrect)],
      wrongPositions: currentAttempt.filter((p) => !isCorrect(p)),
      missedPositions: [],
      foundInversions,
      missingInversions: sequence.slice(nextStep).map((s) => s.inversion),
    };

    set({
      heardNotes: isStepComplete ? [] : stepHeard,
      inversionStep: nextStep,
      userSelections: [...lockedIn, ...currentAttempt],
      liveEvaluation,
    });

    if (liveEvaluation.isMatch) {
      triggerRevealTransition();
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
    inputMode: 'POINTER',
    guitarInputStatus: 'OFF',
    guitarInputError: null,
    heardNotes: [],
    liveEvaluation: null,
    inversionStep: 0,

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
        heardNotes: [],
        liveEvaluation: null,
        inversionStep: 0,
        evaluation: null,
      });

      // Ambient Drone Pad & Screen Wake Lock
      onNewPrompt();
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
        heardNotes: [],
        liveEvaluation: null,
        inversionStep: 0,
        evaluation: null,
      });
    },

    togglePause: () => {
      const { engine, previousPhase } = get();
      if (engine.phase === 'PAUSED') {
        set({ engine: resumeDrill(engine, previousPhase) });
        if (previousPhase === 'PROMPTING') {
          startDroneForPrompt();
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
        heardNotes: [],
        liveEvaluation: null,
        inversionStep: 0,
        evaluation: null,
      });

      // Resume drone / re-arm guitar input for the new challenge prompt
      onNewPrompt();
    },

    updateConfig: (patch) => {
      set((state) => ({ config: { ...state.config, ...patch } }));
    },

    toggleDroneAudio: () => {
      const current = get().config.playDrone;
      const next = !current;
      get().updateConfig({ playDrone: next });
      if (next && get().engine.phase === 'PROMPTING') {
        startDroneForPrompt();
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
      set({ userSelections: [], heardNotes: [], liveEvaluation: null, inversionStep: 0 });
    },

    setInputMode: async (mode) => {
      if (mode === get().inputMode && get().guitarInputStatus !== 'ERROR') return;

      if (mode === 'POINTER') {
        unsubscribeGuitarInput?.();
        unsubscribeGuitarInput = null;
        guitarPitchInput.stop();
        set({
          inputMode: 'POINTER',
          guitarInputStatus: 'OFF',
          guitarInputError: null,
          heardNotes: [],
          liveEvaluation: null,
          inversionStep: 0,
        });
        if (get().engine.phase === 'PROMPTING') startDroneForPrompt();
        return;
      }

      set({ inputMode: 'GUITAR', guitarInputStatus: 'STARTING', guitarInputError: null });
      audioSynthAdapter.stopDrone();
      try {
        await guitarPitchInput.start();
        if (get().inputMode !== 'GUITAR') {
          guitarPitchInput.stop(); // switched back while the permission prompt was open
          return;
        }
        unsubscribeGuitarInput?.();
        unsubscribeGuitarInput = guitarPitchInput.onEvent((event) => {
          if (event.type === 'PITCH_DETECTED') get().registerPlayedNote(event.midiNote);
        });
        set({ guitarInputStatus: 'LISTENING' });
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.'
            : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No audio input found. Plug in your interface or microphone and try again.'
            : err instanceof Error
            ? err.message
            : 'Could not start audio input.';
        set({ guitarInputStatus: 'ERROR', guitarInputError: message });
      }
    },

    registerPlayedNote: (midi) => {
      const { engine, config, heardNotes } = get();
      const challenge = engine.currentChallenge;
      if (engine.phase !== 'PROMPTING' || !challenge) return;

      if (config.exerciseType === 'TRIAD_ALL_INVERSIONS' && challenge.inversionVoicings) {
        registerSequentialInversionNote(midi, challenge);
        return;
      }

      const nextHeard = appendHeardNote(heardNotes, midi, config.exerciseType);
      const userSelections = mapHeardNotesToPositions(
        nextHeard,
        challenge.validVoicings,
        config.exerciseType,
        challenge.promptBoardState.filterMask.activeStrings,
        config.fretZone,
        GUITAR_6_STANDARD
      );
      const evaluation = evaluateVoicingSelection(
        userSelections,
        challenge.validVoicings,
        config.exerciseType,
        challenge.inversionVoicings
      );
      set({ heardNotes: nextHeard, userSelections, liveEvaluation: evaluation });

      // Played it right → reveal immediately instead of waiting out the timer
      if (evaluation?.isMatch) {
        triggerRevealTransition();
      }
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
