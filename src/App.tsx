import { useMemo, useState, type FC } from 'react';
import { useFretboardStore } from './store/useFretboardStore';
import { usePracticeStore } from './store/usePracticeStore';
import { GUITAR_6_STANDARD } from './core/constants';
import { projectFretboard } from './core/fretboardProjector';
import { ComputedFretNode } from './core/models';
import { FretboardSvg } from './components/fretboard';
import { audioSynthAdapter } from './adapters/audioSynth';
import { APP_VERSION } from './version';
import {
  LayerControlPanel,
  LensSwitcher,
  StringMaskToggle,
} from './components/controls';
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
  const toggleUserSelection = usePracticeStore((s) => s.toggleUserSelection);

  const [activeTab, setActiveTab] = useState<'explore' | 'practice'>('explore');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isPracticing = practicePhase !== 'IDLE';

  const handleSwitchToExplore = () => {
    if (isPracticing) {
      stopPractice();
    }
    setActiveTab('explore');
  };

  // If practicing, project the practice board state; otherwise explore state
  const effectiveViewState = isPracticing
    ? getCurrentBoardState(exploreViewState)
    : exploreViewState;

  // Pure projection
  const matrix = projectFretboard(effectiveViewState, GUITAR_6_STANDARD);

  // Calculate comparison map during REVEALING phase
  const comparisonMap = useMemo(() => {
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
  }, [isPracticing, practicePhase, evaluation]);

  const handleNodeClick = (node: ComputedFretNode) => {
    if (isPracticing && practicePhase === 'PROMPTING') {
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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎸</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">Freternity</h1>
                <span className="text-[10px] font-mono uppercase bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
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
              title="Reset to default A Aeolian view"
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

        {/* Explore Mode Quick Controls (Lens & Strings) */}
        {activeTab === 'explore' && !isPracticing && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <LensSwitcher />
            <StringMaskToggle />
          </div>
        )}

        {/* Responsive SVG Fretboard (shown in explore or while practicing) */}
        {(activeTab === 'explore' || isPracticing) && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {isPracticing ? 'Practice Fretboard' : 'Neck Projection'}
                </span>
                {viewWindow && (
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30">
                    Zoomed: Frets {viewWindow.minFret}–{viewWindow.maxFret}
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Standard 6-String Guitar (E A D G B E)
              </div>
            </div>

            <FretboardSvg
              matrix={matrix}
              instrument={GUITAR_6_STANDARD}
              viewWindow={viewWindow}
              userSelections={isPracticing ? userSelections : undefined}
              comparisonMap={comparisonMap}
              isInteractivePractice={isPracticing && practicePhase === 'PROMPTING'}
              onNodeClick={handleNodeClick}
              cagedOverlay={
                effectiveViewState.filterMask.cagedOverlay &&
                effectiveViewState.filterMask.cagedOverlay.enabled
                  ? {
                      enabled: true,
                      shape: effectiveViewState.filterMask.cagedOverlay.shape,
                      referenceRoot:
                        effectiveViewState.filterMask.cagedOverlay.referenceRoot === 'TARGET_ROOT'
                          ? effectiveViewState.targetLayer.rootPitchClass
                          : effectiveViewState.scaleLayer.rootPitchClass,
                    }
                  : undefined
              }
            />
          </div>
        )}

        {/* Explore Mode Controls (Base Key/Mode, Target Triads, CAGED) */}
        {activeTab === 'explore' && !isPracticing && <LayerControlPanel />}

        {/* Legend */}
        {(activeTab === 'explore' || isPracticing) && (
          <footer className="py-4 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            {isPracticing ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-sky-600 border border-sky-300 inline-block" />
                  <span>Your Note Pick</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 border border-emerald-300 inline-block text-[9px] text-white flex items-center justify-center font-bold">
                    ✓
                  </span>
                  <span>Correct Pick</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-rose-300 inline-block text-[9px] text-white flex items-center justify-center font-bold">
                    ✕
                  </span>
                  <span>Wrong Pick</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-600 border border-amber-200 inline-block" />
                  <span>Target Chord Tone</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-rose-200 inline-block" />
                  <span>Target Root</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-sky-600 border border-sky-200 inline-block" />
                  <span>Target 3rd</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-600 border border-amber-200 inline-block" />
                  <span>Target 5th</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-800 border border-slate-600 inline-block opacity-45" />
                  <span>Context Base Scale</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border border-sky-400 border-dashed inline-block" />
                  <span>Active Triad Voicing</span>
                </div>
              </>
            )}
          </footer>
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
