import { useEffect, type FC } from 'react';
import { NodeLabelMode } from '../../core/models';
import { useFretboardStore } from '../../store/useFretboardStore';

const LENS_OPTIONS: readonly { mode: NodeLabelMode; key: string; label: string; desc: string }[] = [
  { mode: 'NOTE_NAME', key: '1', label: 'Notes', desc: 'Enharmonically spelled note names (A, C, E)' },
  { mode: 'SCALE_DEGREE', key: '2', label: 'Degrees', desc: 'Degrees relative to Scale Root (1, 2, b3...)' },
  { mode: 'CHORD_INTERVAL', key: '3', label: 'Intervals', desc: 'Intervals relative to Target Root (R, 3, 5)' },
  { mode: 'BLIND_COLOR', key: '4', label: 'Blind', desc: 'Pure ear-training color code without text' },
];

export const LensSwitcher: FC = () => {
  const currentMode = useFretboardStore((s) => s.viewState.labelMode);
  const setLabelMode = useFretboardStore((s) => s.setLabelMode);

  // Keyboard shortcut listener (1-4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === '1') setLabelMode('NOTE_NAME');
      else if (e.key === '2') setLabelMode('SCALE_DEGREE');
      else if (e.key === '3') setLabelMode('CHORD_INTERVAL');
      else if (e.key === '4') setLabelMode('BLIND_COLOR');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setLabelMode]);

  return (
    <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl shadow-inner">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
        Lens:
      </span>
      {LENS_OPTIONS.map((opt) => {
        const isActive = currentMode === opt.mode;
        return (
          <button
            key={opt.mode}
            onClick={() => setLabelMode(opt.mode)}
            title={`${opt.desc} (Press ${opt.key})`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none ${
              isActive
                ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span>{opt.label}</span>
            <kbd
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                isActive ? 'bg-rose-700/80 text-rose-100' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {opt.key}
            </kbd>
          </button>
        );
      })}
    </div>
  );
};
