import { useCallback, useMemo, useState, type FC } from 'react';
import { useFretboardStore } from './store/useFretboardStore';
import { usePracticeStore, type PracticeEvaluation } from './store/usePracticeStore';
import type { ComparisonStatus } from './components/fretboard/FretNode';
import { GUITAR_6_STANDARD } from './core/constants';
import { projectFretboard } from './core/fretboardProjector';
import { ComputedFretNode } from './core/models';
import { ChordShapeStrip, FretboardLegend, type LegendContext } from './components/fretboard';
import { FretboardSvg } from './components/fretboard';
import { audioSynthAdapter } from './adapters/audioSynth';
import { APP_VERSION } from './version';
import {
  LensSwitcher,
  SentenceBar,
  TunerBar,
  TuningForkIcon,
  ViewMenu,
} from './components/controls';
import { RhythmLab } from './components/rhythm/RhythmLab';
import {
  DrillConfigModal,
  DrillSetupCard,
  PracticeHud,
} from './components/practice';

export const App: FC = () => {
  const exploreViewState = useFretboardStore((s) => s.viewState);
  const viewWindow = useFretboardStore((s) => s.viewWindow);
  const resetToDefaults = useFretboardStore((s) => s.resetToDefaults);

  // Practice state
  const practicePhase = usePracticeStore((s) => s.engine.phase);
  const startPractice = usePracticeStore((s) => s.startPractice);
  const stopPractice = usePracticeStore((s) => s.stopPractice);
  const getCurrentBoardState = usePracticeStore((s) => s.getCurrentBoardState);
  const userSelections = usePracticeStore((s) => s.userSelections);
  const evaluation = usePracticeStore((s) => s.evaluation);
  const liveEvaluation = usePracticeStore((s) => s.liveEvaluation);
  const toggleUserSelection = usePracticeStore((s) => s.toggleUserSelection);
  const inputMode = usePracticeStore((s) => s.inputMode);
  const setInputMode = usePracticeStore((s) => s.setInputMode);
  const rhythmSpec = usePracticeStore((s) => s.engine.currentChallenge?.rhythm);

  const [activeTab, setActiveTab] = useState<'explore' | 'practice' | 'rhythm'>('explore');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const closeTuner = useCallback(() => setIsTunerOpen(false), []);

  const isPracticing = practicePhase !== 'IDLE';

  const handleSwitchToExplore = () => {
    if (isPracticing) {
      stopPractice();
    }
    // Don't keep the microphone open outside of practice
    setInputMode('POINTER');
    setActiveTab('explore');
  };

  const handleSwitchToRhythm = () => {
    if (isPracticing) stopPractice();
    // The lab opens its own input; don't keep the drill's open at the same time
    setInputMode('POINTER');
    setActiveTab('rhythm');
  };

  // If practicing, project the practice board state; otherwise explore state
  const effectiveViewState = isPracticing
    ? getCurrentBoardState(exploreViewState)
    : exploreViewState;

  // Pure projection
  const matrix = projectFretboard(effectiveViewState, GUITAR_6_STANDARD);

  // Comparison map: full result on REVEAL; while prompting with guitar input,
  // each played note is marked right/wrong immediately (missed notes stay hidden).
  const comparisonMap = useMemo(() => {
    // Rhythm drill: a right note is coloured by its timing
    const correctStatus = (ev: PracticeEvaluation, key: string): ComparisonStatus => {
      const grade = ev.timingGrades?.[key];
      return grade === 'ok' ? 'CORRECT_LOOSE' : grade === 'off' ? 'CORRECT_OFF' : 'CORRECT';
    };
    if (isPracticing && practicePhase === 'PROMPTING' && liveEvaluation) {
      const live: Record<string, ComparisonStatus> = {};
      liveEvaluation.correctPositions.forEach((p) => {
        const key = `${p.stringIndex}-${p.fret}`;
        live[key] = correctStatus(liveEvaluation, key);
      });
      liveEvaluation.wrongPositions.forEach((p) => {
        live[`${p.stringIndex}-${p.fret}`] = 'WRONG';
      });
      return live;
    }
    if (!isPracticing || practicePhase !== 'REVEALING' || !evaluation) {
      return undefined;
    }
    const map: Record<string, ComparisonStatus> = {};
    evaluation.correctPositions.forEach((p) => {
      const key = `${p.stringIndex}-${p.fret}`;
      map[key] = correctStatus(evaluation, key);
    });
    evaluation.wrongPositions.forEach((p) => {
      map[`${p.stringIndex}-${p.fret}`] = 'WRONG';
    });
    evaluation.missedPositions.forEach((p) => {
      map[`${p.stringIndex}-${p.fret}`] = 'MISSED';
    });
    return map;
  }, [isPracticing, practicePhase, evaluation, liveEvaluation]);

  const legendContext: LegendContext = !isPracticing
    ? { kind: 'explore', viewState: effectiveViewState }
    : practicePhase === 'REVEALING'
    ? {
        kind: 'reveal',
        viewState: effectiveViewState,
        hasCorrect: (evaluation?.correctPositions.length ?? 0) > 0,
        hasWrong: (evaluation?.wrongPositions.length ?? 0) > 0,
        hasMissed: (evaluation?.missedPositions.length ?? 0) > 0,
        rhythm: !!rhythmSpec,
      }
    : { kind: 'prompt', inputMode, rhythm: !!rhythmSpec };

  const canClickNotes =
    isPracticing && practicePhase === 'PROMPTING' && inputMode === 'POINTER' && !rhythmSpec;

  const handleNodeClick = (node: ComputedFretNode) => {
    if (canClickNotes) {
      audioSynthAdapter.playSingleNote(node.frequencyHz);
      toggleUserSelection(node.position);
    }
  };

  const copyShareUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation / App Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎸</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">Freternity</h1>
                <span className="text-[10px] font-mono uppercase bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400">
                Relational Fretboard Theory & Practice Engine
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={handleSwitchToExplore}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'explore' && !isPracticing
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Explore Mode
            </button>
            <button
              onClick={() => setActiveTab('practice')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'practice' || isPracticing
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Practice Mode</span>
              {isPracticing && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={handleSwitchToRhythm}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'rhythm' && !isPracticing
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Rhythm Lab
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTunerOpen((open) => !open)}
              aria-expanded={isTunerOpen}
              title="Tuner & guitar input"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                isTunerOpen
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <TuningForkIcon />
              <span>Tune</span>
            </button>

            {/* Share / Copy URL Button */}
            <button
              onClick={copyShareUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer hidden sm:flex"
            >
              <span>{copiedUrl ? '✓ Copied' : '🔗 Share'}</span>
            </button>

            {/* Reset Button */}
            <button
              onClick={resetToDefaults}
              title="Back to plain C major"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {isTunerOpen && <TunerBar onClose={closeTuner} />}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Practice Mode: If not practicing, display the dedicated Setup Screen first */}
        {activeTab === 'practice' && !isPracticing && (
          <DrillSetupCard onOpenRhythmLab={handleSwitchToRhythm} />
        )}

        {activeTab === 'rhythm' && !isPracticing && <RhythmLab />}

        {/* Practice Mode HUD (active during running drill) */}
        {isPracticing && (
          <PracticeHud
            onOpenSettings={() => setIsConfigOpen(true)}
            onOpenRhythmLab={handleSwitchToRhythm}
          />
        )}

        {/* Explore: what to show, phrased as one sentence */}
        {activeTab === 'explore' && !isPracticing && <SentenceBar />}

        {/* Responsive SVG Fretboard (shown in explore or while practicing) */}
        {(activeTab === 'explore' || isPracticing) && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl relative">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {isPracticing ? 'Practice Fretboard' : 'Fretboard'}
                </span>
                {viewWindow && (
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30">
                    Zoomed: Frets {viewWindow.minFret}–{viewWindow.maxFret}
                  </span>
                )}
              </div>

              {isPracticing ? (
                <div className="text-[11px] text-slate-400 font-mono">Standard tuning (E A D G B E)</div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <LensSwitcher />
                  <ViewMenu />
                </div>
              )}
            </div>

            <FretboardSvg
              matrix={matrix}
              instrument={GUITAR_6_STANDARD}
              viewWindow={viewWindow}
              userSelections={isPracticing ? userSelections : undefined}
              comparisonMap={comparisonMap}
              isInteractivePractice={canClickNotes}
              onNodeClick={handleNodeClick}
              cagedOverlay={
                effectiveViewState.filterMask.cagedOverlay &&
                effectiveViewState.filterMask.cagedOverlay.enabled
                  ? {
                      enabled: true,
                      shape: effectiveViewState.filterMask.cagedOverlay.shape,
                      // A hidden chord can't anchor the shape: fall back to the scale root
                      referenceRoot:
                        effectiveViewState.filterMask.cagedOverlay.referenceRoot === 'TARGET_ROOT' &&
                        effectiveViewState.targetLayer.enabled
                          ? effectiveViewState.targetLayer.rootPitchClass
                          : effectiveViewState.scaleLayer.rootPitchClass,
                      // Scale in time: outline the frets the position really uses, once
                      windows:
                        isPracticing && rhythmSpec
                          ? [effectiveViewState.filterMask.fretRange]
                          : undefined,
                    }
                  : undefined
              }
            />

            {!isPracticing && <ChordShapeStrip viewState={effectiveViewState} />}

            <FretboardLegend context={legendContext} />
          </div>
        )}

      </main>

      {/* Drill Settings Modal (accessible during running drill) */}
      <DrillConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onStart={() => {
          setActiveTab('practice');
          startPractice();
        }}
      />
    </div>
  );
};

export default App;
