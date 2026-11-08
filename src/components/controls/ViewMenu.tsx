import { type FC } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';
import { Popover } from './Popover';

const STRINGS: readonly { num: number; note: string }[] = [
  { num: 1, note: 'E' },
  { num: 2, note: 'B' },
  { num: 3, note: 'G' },
  { num: 4, note: 'D' },
  { num: 5, note: 'A' },
  { num: 6, note: 'E' },
];

const ZOOM_PRESETS: readonly { label: string; window?: { minFret: number; maxFret: number } }[] = [
  { label: 'Whole neck', window: undefined },
  { label: 'Frets 0–5', window: { minFret: 0, maxFret: 5 } },
  { label: 'Frets 5–9', window: { minFret: 5, maxFret: 9 } },
  { label: 'Frets 8–12', window: { minFret: 8, maxFret: 12 } },
  { label: 'Frets 12–16', window: { minFret: 12, maxFret: 16 } },
];

const optionClass = (selected: boolean) =>
  `rounded-lg transition cursor-pointer ${
    selected
      ? 'bg-sky-600 text-white ring-1 ring-sky-400'
      : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white'
  }`;

/** Display-only settings for the fretboard: which strings are lit and how far it's zoomed. */
export const ViewMenu: FC = () => {
  const activeStrings = useFretboardStore((s) => s.viewState.filterMask.activeStrings);
  const viewWindow = useFretboardStore((s) => s.viewWindow);
  const setActiveStrings = useFretboardStore((s) => s.setActiveStrings);
  const setViewWindow = useFretboardStore((s) => s.setViewWindow);

  const toggleString = (num: number) => {
    if (activeStrings.includes(num)) {
      if (activeStrings.length <= 1) return; // keep at least one string
      setActiveStrings(activeStrings.filter((s) => s !== num));
    } else {
      setActiveStrings([...activeStrings, num].sort((a, b) => a - b));
    }
  };

  const isFiltered = activeStrings.length < 6 || !!viewWindow;

  return (
    <Popover
      title="Strings & zoom"
      label={
        <>
          <span>View</span>
          {isFiltered && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
          <span className="text-[10px] opacity-60">▾</span>
        </>
      }
      triggerClassName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
      panelClassName="w-72"
      align="right"
    >
      {() => (
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Strings</span>
              {activeStrings.length < 6 && (
                <button
                  type="button"
                  onClick={() => setActiveStrings([1, 2, 3, 4, 5, 6])}
                  className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {STRINGS.map(({ num, note }) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => toggleString(num)}
                  aria-pressed={activeStrings.includes(num)}
                  title={`String ${num} (${note})`}
                  className={`py-1 text-xs font-mono font-bold flex flex-col items-center ${optionClass(
                    activeStrings.includes(num)
                  )}`}
                >
                  <span>{num}</span>
                  <span className="text-[10px] opacity-70">{note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Zoom
            </span>
            <div className="grid grid-cols-2 gap-1">
              {ZOOM_PRESETS.map((preset) => {
                const selected = preset.window
                  ? viewWindow?.minFret === preset.window.minFret &&
                    viewWindow?.maxFret === preset.window.maxFret
                  : !viewWindow;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setViewWindow(preset.window)}
                    className={`py-1 text-xs ${optionClass(selected)}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
};
