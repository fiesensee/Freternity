import { useMemo, useState, type FC } from 'react';
import { useFretboardStore } from './store/useFretboardStore';
import { usePracticeStore } from './store/usePracticeStore';
import { GUITAR_6_STANDARD } from './core/constants';
import { projectFretboard } from './core/fretboardProjector';
import { ComputedFretNode } from './core/models';
import { FretboardLegend, type LegendContext } from './components/fretboard';
import { FretboardSvg } from './components/fretboard';
import { audioSynthAdapter } from './adapters/audioSynth';
import { APP_VERSION } from './version';
import { LensSwitcher, SentenceBar, ViewMenu } from './components/controls';
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

  const [activeTab, setActiveTab] = useState<'explore' | 'practice'>('explore');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isPracticing = practicePhase !== 'IDLE';

  const handleSwitchToExplore = () => {
    if (isPracticing) {
      stopPractice();
    }
    // Don't keep the microphone open outside of practice
    setInputMode('POINTER');
    setActiveTab('explore');
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
    if (isPracticing && practicePhase === 'PROMPTING' && liveEvaluation) {
      const live: Record<string, 'CORRECT' | 'WRONG'> = {};
      liveEvaluation.correctPositions.forEach((p) => {
        live[`${p.stringIndex}-${p.fret}`] = 'CORRECT';
      });
      liveEvaluation.wrongPositions.forEach((p) => {
        live[`${p.stringIndex}-${p.fret}`] = 'WRONG';
      });
      return live;
    }
    if (!isPracticing || practicePhase !== 'REVEALING' || !evaluation) {
      return undefined;
    }
    const map: Record<string, 'CORRECT' | 'WRONG' | 'MISSED'> = {};
    evaluation.correctPositions.forEach((p) => {
      map[`${p.stringIndex}-${p.fret}`] = 'CORRECT';
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
      }
    : { kind: 'prompt', inputMode };

  const handleNodeClick = (node: ComputedFretNode) => {
    if (isPracticing && practicePhase === 'PROMPTING' && inputMode === 'POINTER') {
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
          </div>

          <div className="flex items-center gap-2">
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
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Practice Mode: If not practicing, display the dedicated Setup Screen first */}
        {activeTab === 'practice' && !isPracticing && (
          <DrillSetupCard />
        )}

        {/* Practice Mode HUD (active during running drill) */}
        {isPracticing && (
          <PracticeHud onOpenSettings={() => setIsConfigOpen(true)} />
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
              isInteractivePractice={
                isPracticing && practicePhase === 'PROMPTING' && inputMode === 'POINTER'
              }
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
                    }
                  : undefined
              }
            />

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
