import { type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { TriadInversion } from '../../core/models';

export interface DrillConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart?: () => void;
}

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

export const DrillConfigModal: FC<DrillConfigModalProps> = ({
  isOpen,
  onClose,
  onStart,
}) => {
  const config = usePracticeStore((s) => s.config);
  const updateConfig = usePracticeStore((s) => s.updateConfig);
  const startPractice = usePracticeStore((s) => s.startPractice);

  if (!isOpen) return null;

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
      if (config.inversions.length <= 1) return;
      updateConfig({
        inversions: config.inversions.filter((i) => i !== inv),
      });
    } else {
      updateConfig({
        inversions: [...config.inversions, inv],
      });
    }
  };

  const handleStart = () => {
    onClose();
    if (onStart) {
      onStart();
    } else {
      startPractice();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🎯</span> Triad Inversion Drill Setup
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure parameters for the hands-free practice trainer
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Challenge Type Selection */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            Practice Challenge Type:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateConfig({ exerciseType: 'TRIAD_INVERSION_HUNTER' })}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border transition cursor-pointer text-center ${
                config.exerciseType !== 'TRIAD_ALL_INVERSIONS'
                  ? 'bg-rose-600/30 border-rose-500 text-white font-bold'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              Single Inversion
            </button>
            <button
              onClick={() => updateConfig({ exerciseType: 'TRIAD_ALL_INVERSIONS' })}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border transition cursor-pointer text-center ${
                config.exerciseType === 'TRIAD_ALL_INVERSIONS'
                  ? 'bg-rose-600/30 border-rose-500 text-white font-bold'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              All 3 Inversions
            </button>
          </div>
        </div>

        {/* 1. Target Inversions (only if Single Inversion mode) */}
        {config.exerciseType !== 'TRIAD_ALL_INVERSIONS' && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Target Inversions to Drill:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_INVERSIONS.map((inv) => {
                const isSelected = config.inversions.includes(inv.id);
                return (
                  <button
                    key={inv.id}
                    onClick={() => toggleInversion(inv.id)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl transition cursor-pointer text-center ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    {inv.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. String Sets */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            String Sets:
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
                      ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-400'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Timers */}
        {/* 3. Advance Mode & Reveal Time */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
            Session Mode:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateConfig({ autoAdvance: true })}
              className={`p-3 rounded-xl text-left transition cursor-pointer border ${
                config.autoAdvance
                  ? 'bg-slate-800 border-sky-500 text-white ring-1 ring-sky-500'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400'
              }`}
            >
              <div className="text-xs font-bold">Auto-Loop Mode</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Continuous timed countdown loop
              </div>
            </button>

            <button
              onClick={() => updateConfig({ autoAdvance: false })}
              className={`p-3 rounded-xl text-left transition cursor-pointer border ${
                !config.autoAdvance
                  ? 'bg-slate-800 border-sky-500 text-white ring-1 ring-sky-500'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400'
              }`}
            >
              <div className="text-xs font-bold">Self-Grade Mode</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Solution stays until you grade recall
              </div>
            </button>
          </div>

          {config.autoAdvance && (
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Reveal Verification Time:
                </label>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {config.revealDurationMs / 1000}s
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={config.revealDurationMs / 1000}
                onChange={(e) =>
                  updateConfig({ revealDurationMs: Number(e.target.value) * 1000 })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* 4. Thinking Time (max 60 seconds) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Think / Play Time:
            </label>
            <span className="text-sm font-mono font-bold text-amber-400">
              {config.promptDurationMs / 1000 === 60 ? '60s (1 min)' : `${config.promptDurationMs / 1000}s`}
            </span>
          </div>
          <input
            type="range"
            min="3"
            max="60"
            step="1"
            value={config.promptDurationMs / 1000}
            onChange={(e) =>
              updateConfig({ promptDurationMs: Number(e.target.value) * 1000 })
            }
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        {/* 5. Audio Options */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-medium text-slate-300">
              Web Audio Root Drone Pad (Warm synth background)
            </span>
            <input
              type="checkbox"
              checked={config.playDrone}
              onChange={(e) => updateConfig({ playDrone: e.target.checked })}
              className="accent-rose-500 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-medium text-slate-300">
              Audio Triad Strum Verification on Reveal
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

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="px-6 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg hover:brightness-110 transition cursor-pointer"
          >
            ▶ Start Practice Session
          </button>
        </div>
      </div>
    </div>
  );
};
