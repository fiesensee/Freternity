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
import { generateChallenge } from '../core/drills/generateChallenge';
import { ALL_CAGED_SHAPES } from '../core/drills/cagedChordShapeGenerator';
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
import { loadPracticeConfig, savePracticeConfig } from '../adapters/practicePrefs';
import { RhythmSession } from '../adapters/rhythm/rhythmSession';
import { getClickVolume, getRhythmLatency, setClickVolume } from '../adapters/rhythm/rhythmPrefs';
import { RhythmGrid, TimingGrade, gradeOffset, gridInterval } from '../core/rhythm/rhythmMath';
import { PlayedNote, TakeScore, scoreTake, takeDurationMs } from '../core/rhythm/takeScoring';

export type PracticeInputMode = 'POINTER' | 'GUITAR';
export type GuitarInputStatus = 'OFF' | 'STARTING' | 'LISTENING' | 'ERROR';

const INPUT_MODE_KEY = 'freternity.practiceInputMode.v1';

function loadInputMode(): PracticeInputMode {
  try {
    const raw = localStorage.getItem(INPUT_MODE_KEY);
    if (raw === 'GUITAR' || raw === 'POINTER') return raw;
  } catch {
    // localStorage unavailable — use default
  }
  return 'GUITAR';
}

function saveInputMode(mode: PracticeInputMode): void {
  try {
    localStorage.setItem(INPUT_MODE_KEY, mode);
  } catch {
    // storage unavailable — per-viewer convenience only
  }
}

/** Ignore the mic right after a new prompt so the previous reveal strum doesn't count. */
const PROMPT_START_DEAF_MS = 600;

export interface PracticeEvaluation {
  isMatch: boolean;
  correctPositions: readonly FretPosition[];
  wrongPositions: readonly FretPosition[];
  missedPositions: readonly FretPosition[];
  foundInversions?: readonly TriadInversion[];
  missingInversions?: readonly TriadInversion[];
  /** Scale-in-time drill: the full score of the take */
  rhythmScore?: TakeScore;
  /**
   * Scale-in-time drill: timing of each right position (`string-fret`). A position played
   * on the way up and down shows the worse of the two.
   */
  timingGrades?: Readonly<Record<string, TimingGrade>>;
}

export interface RhythmTakeState {
  status: 'OPENING_MIC' | 'RUNNING' | 'ERROR';
  grid: RhythmGrid | null;
  /** Latency correction used for this take (0 = input not calibrated) */
  latencyMs: number;
  calibrated: boolean;
  error?: string;
}

/** Results of a rhythm take stay up at least this long, even with a short reveal time */
const RHYTHM_MIN_REVEAL_MS = 8000;
/** Placeholder prompt time until the take's real length is known (mic permission etc.) */
const RHYTHM_WAITING_MS = 10 * 60 * 1000;
const RHYTHM_LEAD_IN_MS = 150;

/** One rhythm session (mic + metronome) for the whole drill, reopened after a stop */
const rhythmSession = new RhythmSession();
let unsubscribeRhythm: (() => void) | null = null;
let rhythmPlucks: PlayedNote[] = [];

/** Audio-clock time of the rhythm drill, for visuals that follow the click (beat lights) */
export const getRhythmClockNow = () => rhythmSession.now();

const isRhythmChallenge = (c: DrillChallenge | null | undefined): boolean => !!c?.rhythm;

/** Slot of the highest note, where the scale turns around and heads back down */
export const rhythmTurnaroundSlot = (challenge: DrillChallenge): number =>
  Math.floor((challenge.rhythm!.expected.length - 1) / 2);

/** Where on the neck a wrongly played pitch most likely was: inside the box, near the expected string */
function locateInWindow(
  midi: MidiNote,
  window: { min: number; max: number },
  nearString: number
): FretPosition | null {
  const options = GUITAR_6_STANDARD.tuningMidi
    .map((open, i) => ({ stringIndex: i + 1, fret: midi - open }))
    .filter((p) => p.fret >= window.min && p.fret <= window.max);
  if (options.length === 0) return null;
  return options.reduce((best, p) =>
    Math.abs(p.stringIndex - nearString) < Math.abs(best.stringIndex - nearString) ? p : best
  );
}

/** Turns a take score into the fretboard's right / wrong / missed markings. */
export function rhythmScoreToEvaluation(
  score: TakeScore,
  challenge: DrillChallenge,
  final: boolean,
  /** Only mark notes from this slot on (the score itself always covers the whole take) */
  fromSlot = 0
): PracticeEvaluation {
  const expected = challenge.rhythm!.expected;
  const window = challenge.promptBoardState.filterMask.fretRange;
  const key = (p: FretPosition) => `${p.stringIndex}-${p.fret}`;
  const correct = new Map<string, FretPosition>();
  const wrong = new Map<string, FretPosition>();
  const missed = new Map<string, FretPosition>();
  const timingGrades: Record<string, TimingGrade> = {};
  const severity: Record<TimingGrade, number> = { tight: 0, ok: 1, off: 2 };

  score.outcomes.forEach((o, i) => {
    const e = expected[i];
    if (e.slot < fromSlot) return;
    const pos = { stringIndex: e.stringIndex, fret: e.fret };
    if (o.status === 'RIGHT') {
      correct.set(key(pos), pos);
      const grade = gradeOffset(o.offsetMs);
      const earlier = timingGrades[key(pos)];
      if (!earlier || severity[grade] > severity[earlier]) timingGrades[key(pos)] = grade;
    }
    else if (o.status === 'WRONG_NOTE' && o.playedMidi !== null) {
      const at = locateInWindow(o.playedMidi, window, e.stringIndex);
      if (at) wrong.set(key(at), at);
    } else if (o.status === 'MISSED' && final) missed.set(key(pos), pos);
  });
  // The scale passes most positions twice (up and down): one good pass shows as right
  for (const k of correct.keys()) missed.delete(k);

  return {
    isMatch: final && score.passed,
    correctPositions: [...correct.values()],
    wrongPositions: [...wrong.values()].filter((p) => !correct.has(key(p))),
    missedPositions: [...missed.values()],
    rhythmScore: score,
    timingGrades,
  };
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
  cagedShapes: ALL_CAGED_SHAPES,
  rhythm: { bpm: 70, subdivision: 2 },
  fretZone: { min: 0, max: 24 },
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
  /** Scale-in-time drill: the take in progress */
  rhythmTake: RhythmTakeState | null;
  /** Scale-in-time drill: index of the note due now / next */
  rhythmCursor: number;

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
  /** Scale-in-time drill: change the click volume (also while a take runs) */
  setRhythmClickVolume: (volume: number) => void;
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
    const { config, inputMode, engine } = get();
    if (isRhythmChallenge(engine.currentChallenge)) return; // would bleed into the mic
    if (config.playDrone && inputMode !== 'GUITAR') {
      audioSynthAdapter.startDrone(config.scaleContext.rootPitchClass, 0.22);
    }
  };

  const onNewPrompt = () => {
    const challenge = get().engine.currentChallenge;
    if (challenge && isRhythmChallenge(challenge)) {
      void beginRhythmTake(challenge);
      return;
    }
    // Switched away from the rhythm drill mid-session: release its mic
    if (rhythmSession.isOpen) closeRhythmSession();
    startDroneForPrompt();
    if (get().inputMode === 'GUITAR') {
      guitarPitchInput.resetTracking(PROMPT_START_DEAF_MS);
    }
  };

  const closeRhythmSession = () => {
    unsubscribeRhythm?.();
    unsubscribeRhythm = null;
    rhythmSession.close();
    rhythmPlucks = [];
  };

  /**
   * Opens the mic if needed, then starts the click. The take's countdown is set only now,
   * so a slow permission prompt doesn't eat into it.
   */
  const beginRhythmTake = async (challenge: DrillChallenge) => {
    const spec = challenge.rhythm!;
    const deviceId = guitarPitchInput.getDeviceId();
    const calibratedLatency = getRhythmLatency(deviceId);
    rhythmPlucks = [];
    set({
      rhythmTake: {
        status: 'OPENING_MIC',
        grid: null,
        latencyMs: calibratedLatency ?? 0,
        calibrated: calibratedLatency !== null,
      },
      rhythmCursor: 0,
      liveEvaluation: null,
    });

    try {
      await rhythmSession.open();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser’s site settings, then resume.'
          : err instanceof Error
          ? err.message
          : 'Could not open the audio input.';
      const { engine } = get();
      wakeLockAdapter.release().catch(() => {});
      set({
        rhythmTake: { ...get().rhythmTake!, status: 'ERROR', error: message },
        previousPhase: 'PROMPTING',
        engine: pauseDrill(engine),
      });
      return;
    }

    // The drill may have moved on (or stopped) while the permission prompt was open
    const { engine } = get();
    if (engine.currentChallenge?.id !== challenge.id || engine.phase !== 'PROMPTING') return;

    rhythmSession.setClickVolume(getClickVolume());
    rhythmSession.setRequirePitch(true);
    if (!unsubscribeRhythm) {
      unsubscribeRhythm = rhythmSession.onEvent((e) => {
        if (e.type === 'onset') registerRhythmPluck({ time: e.time, midi: e.midiNote });
      });
    }

    const grid = rhythmSession.startMetronome({
      bpm: spec.bpm,
      subdivision: spec.subdivision,
      beatsPerBar: spec.countInBeats,
      countInBars: 1,
      clickSubdivisions: false,
    });
    const duration = takeDurationMs(spec, spec.expected.length, spec.countInBeats) + RHYTHM_LEAD_IN_MS;
    set({
      rhythmTake: { ...get().rhythmTake!, status: 'RUNNING', grid },
      engine: { ...get().engine, timeRemainingMs: duration, totalDurationMs: duration },
    });
  };

  const registerRhythmPluck = (pluck: PlayedNote) => {
    const { engine, rhythmTake } = get();
    const challenge = engine.currentChallenge;
    if (engine.phase !== 'PROMPTING' || !challenge?.rhythm || !rhythmTake?.grid) return;
    rhythmPlucks = [...rhythmPlucks, pluck];
    refreshLiveRhythm();
  };

  /**
   * Live marks on the fretboard. Once the top note is reached they start over, so the way
   * back down shows only how the descending notes go (the up pass would otherwise leave
   * every position green).
   */
  const refreshLiveRhythm = () => {
    const { engine, rhythmTake, rhythmCursor } = get();
    const challenge = engine.currentChallenge;
    if (!challenge?.rhythm || !rhythmTake?.grid) return;
    const score = scoreTake(challenge.rhythm.expected, rhythmPlucks, rhythmTake.grid, rhythmTake.latencyMs);
    const turnaround = rhythmTurnaroundSlot(challenge);
    const fromSlot = rhythmCursor >= turnaround ? turnaround : 0;
    set({ liveEvaluation: rhythmScoreToEvaluation(score, challenge, false, fromSlot) });
  };

  /** Moves the "next note" marker along with the click (called from the timer loop). */
  const updateRhythmCursor = () => {
    const { engine, rhythmTake, rhythmCursor } = get();
    const spec = engine.currentChallenge?.rhythm;
    if (!spec || !rhythmTake?.grid || engine.phase !== 'PROMPTING') return;
    const position = (rhythmSession.now() - rhythmTake.grid.startTime) / gridInterval(spec);
    // Switch to the next note halfway between two slots
    const cursor = Math.min(spec.expected.length - 1, Math.max(0, Math.ceil(position - 0.5)));
    if (cursor === rhythmCursor) return;
    set({ rhythmCursor: cursor });
    // Reaching the top note clears the marks of the way up
    if (engine.currentChallenge && cursor === rhythmTurnaroundSlot(engine.currentChallenge)) {
      refreshLiveRhythm();
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
    const { engine, config, userSelections, rhythmTake } = get();
    if (!engine.currentChallenge) return;

    if (isRhythmChallenge(engine.currentChallenge)) {
      rhythmSession.stopMetronome();
      const challenge = engine.currentChallenge;
      const evaluation = rhythmTake?.grid
        ? rhythmScoreToEvaluation(
            scoreTake(challenge.rhythm!.expected, rhythmPlucks, rhythmTake.grid, rhythmTake.latencyMs),
            challenge,
            true
          )
        : null;
      set({
        engine: transitionToReveal(engine, Math.max(config.revealDurationMs, RHYTHM_MIN_REVEAL_MS)),
        previousPhase: 'REVEALING',
        evaluation,
      });
      return;
    }

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
      updateRhythmCursor();

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
    config: loadPracticeConfig(DEFAULT_DRILL_CONFIG),
    engine: INITIAL_DRILL_ENGINE_STATE,
    previousPhase: 'PROMPTING',
    userSelections: [],
    evaluation: null,
    inputMode: loadInputMode(),
    guitarInputStatus: 'OFF',
    guitarInputError: null,
    heardNotes: [],
    liveEvaluation: null,
    inversionStep: 0,
    rhythmTake: null,
    rhythmCursor: 0,

    startPractice: (customConfig) => {
      clearTimer();
      const config = { ...get().config, ...customConfig };
      savePracticeConfig(config);
      // Restarting mid-drill shouldn't re-ask the question that was just on screen either
      const firstChallenge = generateChallenge(
        config,
        GUITAR_6_STANDARD,
        get().engine.currentChallenge
      );
      const newEngine = startChallenge(
        firstChallenge,
        isRhythmChallenge(firstChallenge) ? RHYTHM_WAITING_MS : config.promptDurationMs
      );

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
      closeRhythmSession();
      wakeLockAdapter.release().catch(() => {});
      set({
        engine: INITIAL_DRILL_ENGINE_STATE,
        userSelections: [],
        heardNotes: [],
        liveEvaluation: null,
        inversionStep: 0,
        evaluation: null,
        rhythmTake: null,
        rhythmCursor: 0,
      });
    },

    togglePause: () => {
      const { engine, previousPhase } = get();
      const rhythm = isRhythmChallenge(engine.currentChallenge);
      if (engine.phase === 'PAUSED') {
        set({ engine: resumeDrill(engine, previousPhase) });
        wakeLockAdapter.request().catch(() => {});
        if (previousPhase === 'PROMPTING') {
          // A take can't continue mid-bar: start it over with a fresh count-in
          if (rhythm) void beginRhythmTake(engine.currentChallenge!);
          else startDroneForPrompt();
        }
      } else if (engine.phase === 'PROMPTING' || engine.phase === 'REVEALING') {
        if (engine.phase === 'PROMPTING') {
          audioSynthAdapter.stopDrone();
          if (rhythm) rhythmSession.stopMetronome();
        }
        wakeLockAdapter.release().catch(() => {});
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

      const nextChallenge = generateChallenge(config, GUITAR_6_STANDARD, engine.currentChallenge);
      const newEngine = startChallenge(
        nextChallenge,
        isRhythmChallenge(nextChallenge) ? RHYTHM_WAITING_MS : config.promptDurationMs,
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
      set((state) => {
        const next = { ...state.config, ...patch };
        savePracticeConfig(next);
        return { config: next };
      });
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
      if (engine.phase !== 'PROMPTING' || isRhythmChallenge(engine.currentChallenge)) return;

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
        saveInputMode('POINTER');
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
        saveInputMode('GUITAR');
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.'
            : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No audio input found. Plug in your interface or microphone and try again.'
            : err instanceof Error
            ? err.message
            : 'Could not start audio input.';
        // Fall back to POINTER so the drill is usable; keep the error visible
        set({
          inputMode: 'POINTER',
          guitarInputStatus: 'OFF',
          guitarInputError: message,
          heardNotes: [],
          liveEvaluation: null,
          inversionStep: 0,
        });
        saveInputMode('POINTER');
        if (get().engine.phase === 'PROMPTING') startDroneForPrompt();
      }
    },

    registerPlayedNote: (midi) => {
      const { engine, config, heardNotes } = get();
      const challenge = engine.currentChallenge;
      // The rhythm drill has its own, sample-accurate input
      if (engine.phase !== 'PROMPTING' || !challenge || isRhythmChallenge(challenge)) return;

      if (config.exerciseType === 'TRIAD_ALL_INVERSIONS' && challenge.inversionVoicings) {
        registerSequentialInversionNote(midi, challenge);
        return;
      }

      const nextHeard = appendHeardNote(
        heardNotes,
        midi,
        config.exerciseType,
        challenge.validVoicings[0]?.length
      );
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

    setRhythmClickVolume: (volume) => {
      rhythmSession.setClickVolume(volume);
      setClickVolume(volume);
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
