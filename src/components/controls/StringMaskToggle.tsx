import { type FC } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';

const STRINGS: readonly { num: number; note: string }[] = [
  { num: 1, note: 'E' },
  { num: 2, note: 'B' },
  { num: 3, note: 'G' },
  { num: 4, note: 'D' },
  { num: 5, note: 'A' },
  { num: 6, note: 'E' },
];

export const StringMaskToggle: FC = () => {
  const activeStrings = useFretboardStore((s) => s.viewState.filterMask.activeStrings);
  const setActiveStrings = useFretboardStore((s) => s.setActiveStrings);

  const toggleString = (num: number) => {
    if (activeStrings.includes(num)) {
      if (activeStrings.length <= 1) return; // Keep at least one string active
      setActiveStrings(activeStrings.filter((s) => s !== num));
    } else {
      setActiveStrings([...activeStrings, num].sort((a, b) => a - b));
    }
  };

  return (
    <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl shadow-inner">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
        Strings:
      </span>
      <div className="flex items-center gap-1.5">
        {STRINGS.map(({ num, note }) => {
          const isActive = activeStrings.includes(num);
          return (
            <button
              key={num}
              onClick={() => toggleString(num)}
              title={`Toggle String ${num} (${note})`}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer select-none ${
                isActive
                  ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-300'
                  : 'bg-slate-800/80 text-slate-500 hover:bg-slate-800 hover:text-slate-300 border border-slate-800'
              }`}
            >
              <span>{num}</span>
              <span className={`text-[10px] ${isActive ? 'text-sky-200' : 'text-slate-600'}`}>
                {note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
