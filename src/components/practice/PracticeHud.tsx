import { useEffect, useRef, useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { GuitarInputPanel, midiToLabel } from './GuitarInputPanel';
import { positionToMidi } from '../../core/drills/heardNoteMapper';
import { GUITAR_6_STANDARD } from '../../core/constants';

export interface PracticeHudProps {
  onOpenSettings?: () => void;
}

export const PracticeHud: FC<PracticeHudProps> = ({ onOpenSettings }) => {
  const engine = usePracticeStore((s) => s.engine);
  const config = usePracticeStore((s) => s.config);
  const stopPractice = usePracticeStore((s) => s.stopPractice);
  const togglePause = usePracticeStore((s) => s.togglePause);
  const revealNow = usePracticeStore((s) => s.revealNow);
  const submitSelfGrade = usePracticeStore((s) => s.submitSelfGrade);
  const advanceToNextChallenge = usePracticeStore((s) => s.advanceToNextChallenge);
  const userSelections = usePracticeStore((s) => s.userSelections);
  const evaluation = usePracticeStore((s) => s.evaluation);
  const clearUserSelection = usePracticeStore((s) => s.clearUserSelection);
  const inputMode = usePracticeStore((s) => s.inputMode);
  const guitarInputStatus = usePracticeStore((s) => s.guitarInputStatus);
  const heardNotes = usePracticeStore((s) => s.heardNotes);
  const liveEvaluation = usePracticeStore((s) => s.liveEvaluation);
  const inversionStep = usePracticeStore((s) => s.inversionStep);
  const isListening = inputMode === 'GUITAR' && guitarInputStatus === 'LISTENING';

  const { phase, currentChallenge, timeRemainingMs, totalDurationMs, stats } = engine;

  // Keyboard controls for hands-free practice (Space, R, Escape, P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'PROMPTING') {
          revealNow();
        } else if (phase === 'REVEALING') {
          if (config.autoAdvance) {
            advanceToNextChallenge();
          } else {
            // In self-grade mode, if user placed note guesses on the fretboard,
            // Space grades by exact match (all 3 correct), otherwise Got It default
            if (evaluation) {
              submitSelfGrade(evaluation.isMatch);
            } else {
              submitSelfGrade(true); // Got It
            }
          }
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (phase === 'REVEALING' && !config.autoAdvance) {
          submitSelfGrade(false); // Missed
        }
      } else if (e.key === 'p' || e.key === 'P') {
        togglePause();
      } else if (e.key === 'Escape') {
        stopPractice();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    phase,
    config.autoAdvance,
    revealNow,
    advanceToNextChallenge,
    submitSelfGrade,
    togglePause,
    stopPractice,
  ]);

  if (phase === 'IDLE' || !currentChallenge) return null;

  const correctHeardMidis = new Set(
    (liveEvaluation?.correctPositions ?? []).map((p) => positionToMidi(p, GUITAR_6_STANDARD))
  );

  const showTimer = phase === 'PROMPTING' || (phase === 'REVEALING' && config.autoAdvance);
  const progressRatio =
    totalDurationMs > 0 ? Math.max(0, timeRemainingMs / totalDurationMs) : 0;
  const secondsLeft = (timeRemainingMs / 1000).toFixed(1);

  const accuracyPercent =
    stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Top bar: phase + timer · score · one menu for everything secondary */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          {phase === 'PROMPTING' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              YOUR TURN
            </span>
          )}
          {phase === 'REVEALING' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              SOLUTION
            </span>
          )}
          {phase === 'PAUSED' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-slate-700 text-slate-300 border border-slate-600">
              PAUSED
            </span>
          )}

          {showTimer ? (
            <span className="text-sm font-mono font-bold text-slate-200">{secondsLeft}s</span>
          ) : (
            phase === 'REVEALING' && (
              <span className="text-xs font-mono text-emerald-400/90 font-medium">
                Did you get it?
              </span>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            title={`${stats.passed} right, ${stats.missed} wrong`}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono flex items-center gap-2"
          >
            <span className="text-emerald-400 font-bold">✓ {stats.passed}</span>
            <span className="text-rose-400 font-bold">✕ {stats.missed}</span>
            {stats.total > 0 && <span className="text-slate-400">{accuracyPercent}%</span>}
          </span>
          <HudMenu onOpenSettings={onOpenSettings} />
        </div>
      </div>

      <GuitarInputPanel variant="status" />

      {/* Progress Bar (visible during timed countdowns) */}
      {showTimer && (
        <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-75 ${
              phase === 'PROMPTING'
                ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                : 'bg-gradient-to-r from-emerald-500 to-sky-500'
            }`}
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      )}

      {/* Large Callout Prompt Card */}
      <div className="py-2 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {currentChallenge.headlinePrompt}
        </h2>
        <p className="text-sm sm:text-base text-slate-400 mt-1.5 font-medium">
          {currentChallenge.subPrompt}
        </p>

        {/* Guitar input, all inversions: shapes must be played in order up the neck */}
        {phase === 'PROMPTING' &&
          isListening &&
          config.exerciseType === 'TRIAD_ALL_INVERSIONS' && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Nut → 12th fret:</span>
              {[0, 1, 2].map((i) => {
                const found = liveEvaluation?.foundInversions?.[i];
                const isCurrent = i === inversionStep;
                const label = found === 'ROOT' ? 'Root' : found === 'FIRST' ? '1st Inv' : '2nd Inv';
                return (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-lg border font-bold ${
                      found
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : isCurrent
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 animate-pulse'
                        : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}
                  >
                    {i + 1}. {found ? `✓ ${label}` : isCurrent ? 'playing…' : '?'}
                  </span>
                );
              })}
            </div>
          )}

        {/* Interactive Selection Feedback during Prompting */}
        {phase === 'PROMPTING' && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            {isListening ? (
              <span className="text-sky-400 font-mono font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                🎤 Listening, pick the notes one by one
                {heardNotes.length > 0 && (
                  <span className="text-slate-400 flex items-center gap-1">
                    · heard
                    {heardNotes.map((midi) => {
                      const isCorrect = correctHeardMidis.has(midi);
                      return (
                        <span
                          key={midi}
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {isCorrect ? '✓' : '✕'} {midiToLabel(midi)}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sky-400 font-mono font-medium">
                🎸 Click fretboard to place notes ({userSelections.length}/
                {config.exerciseType === 'TRIAD_ALL_INVERSIONS' ? '9' : '3'} placed)
              </span>
            )}
            {userSelections.length > 0 && (
              <button
                onClick={clearUserSelection}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Solutions Box & Evaluation Feedback during Revealing */}
        {phase === 'REVEALING' && (
          <div className="mt-4 flex flex-col items-center gap-3">
            {/* Notes by Name Display */}
            {currentChallenge.solutionNotes && currentChallenge.solutionNotes.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 shadow-inner">
                <span className="text-xs font-mono font-bold tracking-wider uppercase text-slate-400">
                  Notes:
                </span>
                <div className="flex items-center gap-2">
                  {currentChallenge.solutionNotes.map((note) => (
                    <div
                      key={note.interval}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-700/80 shadow-sm"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          note.role === 'Root'
                            ? 'bg-rose-500 ring-2 ring-rose-400/40'
                            : note.role === '3rd'
                            ? 'bg-sky-500 ring-2 ring-sky-400/40'
                            : 'bg-amber-500 ring-2 ring-amber-400/40'
                        }`}
                      />
                      <span className="text-sm sm:text-base font-extrabold font-mono text-white">
                        {note.noteName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 font-medium">
                        ({note.interval})
                      </span>
                    </div>
                  ))}
                </div>

                {/* Voicing Breakdown by String */}
                {currentChallenge.voicingNotes && currentChallenge.voicingNotes.length > 0 && (
                  <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs font-mono text-slate-300">
                    <span className="text-slate-500 text-[11px]">Voicing:</span>
                    {currentChallenge.voicingNotes.map((vn, idx) => (
                      <span key={vn.stringIndex} className="flex items-center gap-1">
                        {idx > 0 && <span className="text-slate-600">→</span>}
                        <span className="text-slate-400 text-[11px]">S{vn.stringIndex}:</span>
                        <strong className="text-white font-bold">{vn.noteName}</strong>
                        <span className="text-[10px] text-slate-400">({vn.interval})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comparison Result Feedback */}
            {evaluation && (
              <div className="flex flex-col items-center justify-center gap-2">
                {evaluation.isMatch ? (
                  <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                    <span>🎉</span>
                    {config.exerciseType === 'TRIAD_ALL_INVERSIONS'
                      ? 'Perfect! You found all 3 inversions!'
                      : 'Perfect! You found the exact triad voicing!'}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
                    {config.exerciseType === 'TRIAD_ALL_INVERSIONS' && evaluation.foundInversions ? (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Inversions:</span>
                        {(['ROOT', 'FIRST', 'SECOND'] as const).map((inv) => {
                          const isFound = evaluation.foundInversions?.includes(inv);
                          const label = inv === 'ROOT' ? 'Root' : inv === 'FIRST' ? '1st' : '2nd';
                          return (
                            <span
                              key={inv}
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                isFound
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {isFound ? '✓' : '✕'} {label}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                        ✓ {evaluation.correctPositions.length} correct
                      </span>
                    )}

                    {evaluation.wrongPositions.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                        ✕ {evaluation.wrongPositions.length} wrong
                      </span>
                    )}
                    {evaluation.missedPositions.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        ! {evaluation.missedPositions.length} missed
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Transport Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            {phase === 'PAUSED' ? '▶ Resume (P)' : '⏸ Pause (P)'}
          </button>
          <button
            onClick={stopPractice}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800/70 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 transition cursor-pointer"
          >
            ✕ Exit Drill (Esc)
          </button>
        </div>

        {/* Primary Phase Action Controls */}
        <div className="flex items-center gap-2">
          {phase === 'PROMPTING' && (
            <button
              onClick={revealNow}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition cursor-pointer flex items-center gap-2"
            >
              <span>Reveal Solution</span>
              <kbd className="px-1.5 py-0.5 rounded bg-rose-700 text-rose-100 text-[11px] font-mono">
                Space
              </kbd>
            </button>
          )}

          {phase === 'REVEALING' && (
            <>
              {config.autoAdvance ? (
                <button
                  onClick={() => advanceToNextChallenge()}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-2"
                >
                  <span>Next Challenge</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-emerald-700 text-emerald-100 text-[11px] font-mono">
                    Space
                  </kbd>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => submitSelfGrade(true)}
                    className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✓ Got It</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-emerald-700 text-emerald-100 text-[11px] font-mono">
                      Space
                    </kbd>
                  </button>
                  <button
                    onClick={() => submitSelfGrade(false)}
                    className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✗ Missed</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-[11px] font-mono">
                      R
                    </kbd>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** Secondary drill controls, kept out of the way of the prompt. */
const HudMenu: FC<{ onOpenSettings?: () => void }> = ({ onOpenSettings }) => {
  const config = usePracticeStore((s) => s.config);
  const inputMode = usePracticeStore((s) => s.inputMode);
  const toggleDroneAudio = usePracticeStore((s) => s.toggleDroneAudio);
  const toggleSolutionAudio = usePracticeStore((s) => s.toggleSolutionAudio);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close the menu instead of exiting the drill
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isOpen]);

  const switchRow = (label: string, hint: string, checked: boolean, onToggle: () => void, disabled = false) => (
    <label
      className={`flex items-start justify-between gap-3 py-1.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span>
        <span className="block text-xs text-slate-200 font-medium">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="accent-sky-500 w-4 h-4 mt-0.5 cursor-pointer"
      />
    </label>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        title="Sound, input & drill settings"
        className={`px-2.5 py-1 text-xs rounded-lg border transition cursor-pointer ${
          isOpen
            ? 'bg-slate-700 text-white border-slate-600'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
        }`}
      >
        ⚙ Options
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 flex flex-col gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Sound</div>
            {switchRow(
              'Drone',
              inputMode === 'GUITAR'
                ? 'Muted while listening to your guitar'
                : 'A soft pad on the key’s root note',
              config.playDrone,
              toggleDroneAudio,
              inputMode === 'GUITAR'
            )}
            {switchRow(
              'Play the solution',
              'Plays the triad when the solution is shown',
              config.playSolutionAudioOnReveal,
              toggleSolutionAudio
            )}
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Answer with</div>
            <GuitarInputPanel variant="toggle" />
          </div>

          {onOpenSettings && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="border-t border-slate-800 pt-3 text-left text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              Change drill settings…
            </button>
          )}
        </div>
      )}
    </div>
  );
};
