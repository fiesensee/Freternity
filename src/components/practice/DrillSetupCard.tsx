import { type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { PitchClass, TriadInversion } from '../../core/models';
import { DIATONIC_MODES, SCALE_MAP } from '../../core/constants';
import { resolveRootNoteName, isFlatKeySignature } from '../../core/musicTheory';

const AVAILABLE_STRING_SETS: readonly { label: string; strings: readonly number[] }[] = [
  { label: 'Strings 1-2-3 (High)', strings: [1, 2, 3] },
  { label: 'Strings 2-3-4 (Mid)', strings: [2, 3, 4] },
  { label: 'Strings 3-4-5', strings: [3, 4, 5] },
  { label: 'Strings 4-5-6 (Low)', strings: [4, 5, 6] },
];

const AVAILABLE_INVERSIONS: readonly { id: TriadInversion; label: string }[] = [
  { id: 'ROOT', label: 'Root Position' },
  { id: 'FIRST', label: '1st Inversion' },
  { id: 'SECOND', label: '2nd Inversion' },
];

export const DrillSetupCard: FC = () => {
  const config = usePracticeStore((s) => s.config);
  const updateConfig = usePracticeStore((s) => s.updateConfig);
  const startPractice = usePracticeStore((s) => s.startPractice);

  const { scaleContext } = config;
  const scaleDef = SCALE_MAP[scaleContext.scaleId] ?? SCALE_MAP['ionian'];
  const scaleRootName = resolveRootNoteName(
    scaleContext.rootPitchClass,
    isFlatKeySignature(scaleContext.rootPitchClass, scaleContext.preferFlats)
  );

  const setScaleRoot = (root: PitchClass) => {
    updateConfig({
      scaleContext: {
        ...scaleContext,
        rootPitchClass: root,
      },
    });
  };

  const setScaleMode = (modeId: string) => {
    updateConfig({
      scaleContext: {
        ...scaleContext,
        scaleId: modeId,
      },
    });
  };

  const toggleFlats = () => {
    updateConfig({
      scaleContext: {
        ...scaleContext,
        preferFlats: !scaleContext.preferFlats,
      },
    });
  };

  const toggleStringSet = (set: readonly number[]) => {
    const exists = config.stringSets.some(
      (s) => s.length === set.length && s.every((val, i) => val === set[i])
    );
    if (exists) {
      if (config.stringSets.length <= 1) return; // Keep at least one
      updateConfig({
        stringSets: config.stringSets.filter(
          (s) => !(s.length === set.length && s.every((val, i) => val === set[i]))
        ),
      });
    } else {
      updateConfig({
        stringSets: [...config.stringSets, set],
      });
    }
  };

  const toggleInversion = (inv: TriadInversion) => {
    if (config.inversions.includes(inv)) {
      if (config.inversions.length <= 1) return; // Keep at least one
      updateConfig({
        inversions: config.inversions.filter((i) => i !== inv),
      });
    } else {
      updateConfig({
        inversions: [...config.inversions, inv],
      });
    }
  };

  const thinkSeconds = Math.round(config.promptDurationMs / 1000);
  const revealSeconds = Math.round(config.revealDurationMs / 1000);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-3xl mx-auto w-full flex flex-col gap-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎯</span>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Triad Inversion Drill Setup
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Choose your practice challenge type, key, string set, and time limits
            </p>
          </div>
        </div>
      </div>

      {/* 1. Practice Challenge Mode Selection */}
      <div className="bg-slate-950/70 border border-slate-800/80 p-4 sm:p-5 rounded-2xl flex flex-col gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          1. Practice Challenge Type:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => updateConfig({ exerciseType: 'TRIAD_INVERSION_HUNTER' })}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
              config.exerciseType !== 'TRIAD_ALL_INVERSIONS'
                ? 'bg-rose-600/20 border-rose-500/60 ring-1 ring-rose-500/40 text-white'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">Single Inversion Hunter</span>
              {config.exerciseType !== 'TRIAD_ALL_INVERSIONS' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Find a specific triad voicing (Root, 1st, or 2nd Inversion) on the target string set.
            </p>
          </button>

          <button
            onClick={() => updateConfig({ exerciseType: 'TRIAD_ALL_INVERSIONS' })}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
              config.exerciseType === 'TRIAD_ALL_INVERSIONS'
                ? 'bg-rose-600/20 border-rose-500/60 ring-1 ring-rose-500/40 text-white'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">All Inversions Sprint</span>
              {config.exerciseType === 'TRIAD_ALL_INVERSIONS' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mark all 3 inversions (Root, 1st, and 2nd) along the neck. Complete when all 3 are found!
            </p>
          </button>
        </div>
      </div>

      {/* 2. Key & Mode Selection */}
      <div className="bg-slate-950/70 border border-slate-800/80 p-4 sm:p-5 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            2. Drill Key & Scale Context:
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-400 font-mono">
              {scaleRootName} {scaleDef.name.split(' ')[0]}
            </span>
            <button
              onClick={toggleFlats}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:text-white cursor-pointer"
            >
              {scaleContext.preferFlats ? '♭ Flats' : '♯ Sharps'}
            </button>
          </div>
        </div>

        {/* Root Note Picker */}
        <div>
          <span className="text-[11px] text-slate-400 block mb-1">Root Note:</span>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
            {(Array.from({ length: 12 }, (_, i) => i as PitchClass)).map((pc) => {
              const name = resolveRootNoteName(pc, isFlatKeySignature(pc, scaleContext.preferFlats));
              const isSelected = scaleContext.rootPitchClass === pc;
              return (
                <button
                  key={pc}
                  onClick={() => setScaleRoot(pc)}
                  className={`py-1.5 text-xs font-mono font-bold rounded-lg transition cursor-pointer text-center ${
                    isSelected
                      ? 'bg-sky-500 text-white shadow ring-1 ring-sky-300'
                      : 'bg-slate-850 bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Diatonic Mode Picker */}
        <div>
          <span className="text-[11px] text-slate-400 block mb-1">Diatonic Mode:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1">
            {DIATONIC_MODES.map((mode) => {
              const isSelected = scaleContext.scaleId === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setScaleMode(mode.id)}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg truncate transition cursor-pointer text-center ${
                    isSelected
                      ? 'bg-sky-600 text-white font-bold shadow-sm'
                      : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {mode.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Grid of Inversions & Strings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Inversions */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            3. Inversions to Drill:
          </label>
          {config.exerciseType === 'TRIAD_ALL_INVERSIONS' ? (
            <div className="py-2 px-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓ All 3 Active:</span>
              <span className="text-[11px] text-slate-400">
                Root Pos, 1st Inv & 2nd Inv are all targets.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_INVERSIONS.map((inv) => {
                const isSelected = config.inversions.includes(inv.id);
                return (
                  <button
                    key={inv.id}
                    onClick={() => toggleInversion(inv.id)}
                    className={`py-2.5 px-2 text-xs font-bold rounded-xl transition cursor-pointer text-center ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-md ring-1 ring-rose-400'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    {inv.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* String Sets */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            4. String Sets:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {AVAILABLE_STRING_SETS.map((item, idx) => {
              const isSelected = config.stringSets.some(
                (s) =>
                  s.length === item.strings.length &&
                  s.every((val, i) => val === item.strings[i])
              );
              return (
                <button
                  key={idx}
                  onClick={() => toggleStringSet(item.strings)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl transition cursor-pointer text-left ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-md ring-1 ring-sky-400'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Session Mode & Reveal Time Decoupling */}
      <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            4. Session Mode:
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateConfig({ autoAdvance: true })}
              className={`p-3.5 rounded-xl text-left transition cursor-pointer border ${
                config.autoAdvance
                  ? 'bg-slate-850 bg-slate-800 border-sky-500 text-white ring-1 ring-sky-500 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span>🔄</span> Auto-Loop Mode
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Continuous timed hands-free loop with automated reveal verification
              </div>
            </button>

            <button
              onClick={() => updateConfig({ autoAdvance: false })}
              className={`p-3.5 rounded-xl text-left transition cursor-pointer border ${
                !config.autoAdvance
                  ? 'bg-slate-850 bg-slate-800 border-sky-500 text-white ring-1 ring-sky-500 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span>⭐</span> Self-Grade Mode
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Solution stays on screen until you rate your recall with Got It / Missed
              </div>
            </button>
          </div>
        </div>

        {/* Reveal Time Slider (Coupled strictly to Auto-Loop Mode) */}
        {config.autoAdvance && (
          <div className="pt-3 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>⏱</span> Auto-Loop Reveal Verification Time:
              </label>
              <span className="text-sm font-mono font-bold text-emerald-400">
                {revealSeconds} seconds
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              step="1"
              value={revealSeconds}
              onChange={(e) =>
                updateConfig({ revealDurationMs: Number(e.target.value) * 1000 })
              }
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>Quick (2s)</span>
              <span>Standard (4s)</span>
              <span>Extended (10s)</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Thinking Time (Extended to 1 Minute Max) */}
      <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            5. Think / Play Time:
          </label>
          <span className="text-sm font-mono font-bold text-amber-400">
            {thinkSeconds === 60 ? '60s (1 minute)' : `${thinkSeconds} seconds`}
          </span>
        </div>
        <input
          type="range"
          min="3"
          max="60"
          step="1"
          value={thinkSeconds}
          onChange={(e) =>
            updateConfig({ promptDurationMs: Number(e.target.value) * 1000 })
          }
          className="w-full accent-amber-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>Fast (3s)</span>
          <span>Standard (10s)</span>
          <span>Deep (30s)</span>
          <span>Max (60s / 1 min)</span>
        </div>
      </div>

      {/* 6. Audio Options */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
          6. Audio Assists:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800 p-3 rounded-xl cursor-pointer">
            <span className="text-xs text-slate-300">
              🔊 Root Drone Pad
            </span>
            <input
              type="checkbox"
              checked={config.playDrone}
              onChange={(e) => updateConfig({ playDrone: e.target.checked })}
              className="accent-rose-500 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800 p-3 rounded-xl cursor-pointer">
            <span className="text-xs text-slate-300">
              🎸 Strum Triad on Reveal
            </span>
            <input
              type="checkbox"
              checked={config.playSolutionAudioOnReveal}
              onChange={(e) =>
                updateConfig({ playSolutionAudioOnReveal: e.target.checked })
              }
              className="accent-rose-500 w-4 h-4 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Big Action Launch Button */}
      <div className="pt-2">
        <button
          onClick={() => startPractice()}
          className="w-full py-4 rounded-2xl text-base font-black bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:brightness-110 text-white shadow-xl shadow-rose-600/25 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <span>▶ Start Practice Session</span>
          <span className="text-xs bg-rose-700/60 px-2.5 py-0.5 rounded-full font-mono">
            {thinkSeconds}s think • {config.autoAdvance ? `${revealSeconds}s reveal` : 'Self-graded'}
          </span>
        </button>
      </div>
    </div>
  );
};
