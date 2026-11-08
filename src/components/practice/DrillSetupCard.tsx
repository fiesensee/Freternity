import { useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { GuitarInputPanel } from './GuitarInputPanel';
import {
  DrillOptions,
  DrillTypePicker,
  KeyPicker,
  SettingsSection,
  ThinkTimePicker,
  describeKey,
  summarizeDrillOptions,
} from './DrillSettings';

const CUSTOMIZE_OPEN_KEY = 'freternity.setupCustomizeOpen';

function readCustomizeOpen(): boolean {
  try {
    return localStorage.getItem(CUSTOMIZE_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Quick start: the three choices that matter (drill, key, input) and a Start button.
 * Everything else has sensible defaults and sits behind a one-line summary.
 */
export const DrillSetupCard: FC = () => {
  const config = usePracticeStore((s) => s.config);
  const startPractice = usePracticeStore((s) => s.startPractice);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(readCustomizeOpen);

  const toggleCustomize = () => {
    const next = !isCustomizeOpen;
    setIsCustomizeOpen(next);
    try {
      localStorage.setItem(CUSTOMIZE_OPEN_KEY, next ? '1' : '0');
    } catch {
      // per-viewer convenience only
    }
  };

  const summary = summarizeDrillOptions(config);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-3xl mx-auto w-full flex flex-col gap-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white">Triad Practice</h2>
        <p className="text-sm text-slate-400 mt-1">
          You get a chord, you find it on the neck. Pick a drill and a key and go.
        </p>
      </div>

      <SettingsSection title="Drill">
        <DrillTypePicker />
      </SettingsSection>

      <SettingsSection title="Key">
        <KeyPicker />
      </SettingsSection>

      <SettingsSection title="Time to find it">
        <ThinkTimePicker />
      </SettingsSection>

      <GuitarInputPanel />

      <button
        onClick={() => startPractice()}
        className="w-full py-4 rounded-2xl text-base font-black bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:brightness-110 text-white shadow-xl shadow-rose-600/25 transition cursor-pointer"
      >
        ▶ Start: {describeKey(config.scaleContext)}
      </button>

      {/* Everything else, collapsed to one line by default */}
      <div className="border-t border-slate-800 pt-4">
        <button
          onClick={toggleCustomize}
          aria-expanded={isCustomizeOpen}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
        >
          <span className="text-xs text-slate-400 leading-relaxed">{summary.join(' · ')}</span>
          <span className="text-xs font-semibold text-sky-400 group-hover:text-sky-300 whitespace-nowrap">
            {isCustomizeOpen ? 'Hide options ▴' : 'Customize ▾'}
          </span>
        </button>

        {isCustomizeOpen && (
          <div className="mt-5">
            <DrillOptions />
          </div>
        )}
      </div>
    </div>
  );
};
