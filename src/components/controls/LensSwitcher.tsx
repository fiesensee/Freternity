import { useEffect, type FC } from 'react';
import { NodeLabelMode } from '../../core/models';
import { useFretboardStore } from '../../store/useFretboardStore';

const LENS_OPTIONS: readonly { mode: NodeLabelMode; key: string; label: string; desc: string }[] = [
  { mode: 'NOTE_NAME', key: '1', label: 'Note names', desc: 'Show note names, e.g. A, C, E' },
  { mode: 'SCALE_DEGREE', key: '2', label: 'Scale degrees', desc: 'Show each note’s position in the scale, e.g. 1, 2, b3' },
  { mode: 'CHORD_INTERVAL', key: '3', label: 'Chord tones', desc: 'Show root, 3rd and 5th of the highlighted chord' },
  { mode: 'BLIND_COLOR', key: '4', label: 'Colours only', desc: 'No text, just the colours, to test yourself' },
];

export const LensSwitcher: FC = () => {
  const currentMode = useFretboardStore((s) => s.viewState.labelMode);
  const setLabelMode = useFretboardStore((s) => s.setLabelMode);
  const hasChord = useFretboardStore((s) => s.viewState.targetLayer.enabled);

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
      else if (e.key === '3' && hasChord) setLabelMode('CHORD_INTERVAL');
      else if (e.key === '4') setLabelMode('BLIND_COLOR');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setLabelMode, hasChord]);

  return (
    <div className="flex flex-wrap items-center gap-1 bg-slate-950/60 border border-slate-800 p-1 rounded-xl">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
        Labels:
      </span>
      {LENS_OPTIONS.map((opt) => {
        const isActive = currentMode === opt.mode;
        const isUnavailable = opt.mode === 'CHORD_INTERVAL' && !hasChord;
        return (
          <button
            key={opt.mode}
            onClick={() => setLabelMode(opt.mode)}
            disabled={isUnavailable}
            title={
              isUnavailable
                ? 'Highlight a chord first to see its chord tones'
                : `${opt.desc} (shortcut: ${opt.key})`
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
