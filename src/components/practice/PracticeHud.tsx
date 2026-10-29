import { useEffect, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';

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
  const toggleDroneAudio = usePracticeStore((s) => s.toggleDroneAudio);
  const toggleSolutionAudio = usePracticeStore((s) => s.toggleSolutionAudio);
  const userSelections = usePracticeStore((s) => s.userSelections);
  const evaluation = usePracticeStore((s) => s.evaluation);
  const clearUserSelection = usePracticeStore((s) => s.clearUserSelection);

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

  const showTimer = phase === 'PROMPTING' || (phase === 'REVEALING' && config.autoAdvance);
  const progressRatio =
    totalDurationMs > 0 ? Math.max(0, timeRemainingMs / totalDurationMs) : 0;
  const secondsLeft = (timeRemainingMs / 1000).toFixed(1);

  const accuracyPercent =
    stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Top Status Bar: Phase badge, Timer, Stats, Audio Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          {/* Phase Badge */}
          {phase === 'PROMPTING' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              THINK & PLAY
            </span>
          )}
          {phase === 'REVEALING' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              SOLUTION REVEALED
            </span>
          )}
          {phase === 'PAUSED' && (
            <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-slate-700 text-slate-300 border border-slate-600">
              PAUSED
            </span>
          )}

          {/* Time Remaining - only shown when transition is timed */}
          {showTimer ? (
            <span className="text-sm font-mono font-bold text-slate-200">
              {secondsLeft}s
            </span>
          ) : (
            <span className="text-xs font-mono text-emerald-400/90 font-medium">
              Awaiting self-grade
            </span>
          )}
        </div>

        {/* Center Stats: Always display Right / Wrong regardless of mode */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <span className="font-semibold text-emerald-400">✓ Right:</span>
            <strong className="text-white text-xs sm:text-sm font-bold">{stats.passed}</strong>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">
            <span className="font-semibold text-rose-400">✕ Wrong:</span>
            <strong className="text-white text-xs sm:text-sm font-bold">{stats.missed}</strong>
          </div>
          <div className="text-slate-400 text-[11px] hidden sm:block">
            Completed: <strong className="text-slate-200">{stats.total}</strong>
            {stats.total > 0 && (
              <span className="ml-1.5 text-slate-400">({accuracyPercent}%)</span>
            )}
          </div>
        </div>

        {/* Audio Toggles & Settings */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDroneAudio}
            title="Toggle Web Audio Root Drone Synth"
            className={`px-2 py-1 text-xs rounded-md font-mono transition cursor-pointer ${
              config.playDrone
                ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            🔊 Drone: {config.playDrone ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={toggleSolutionAudio}
            title="Strum triad pitches on reveal"
            className={`px-2 py-1 text-xs rounded-md font-mono transition cursor-pointer ${
              config.playSolutionAudioOnReveal
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            🎸 Strum: {config.playSolutionAudioOnReveal ? 'ON' : 'OFF'}
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              ⚙ Drill Settings
            </button>
          )}
        </div>
      </div>

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

        {/* Interactive Selection Feedback during Prompting */}
        {phase === 'PROMPTING' && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <span className="text-sky-400 font-mono font-medium">
              🎸 Click fretboard to place notes ({userSelections.length}/
              {config.exerciseType === 'TRIAD_ALL_INVERSIONS' ? '9' : '3'} placed)
            </span>
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
