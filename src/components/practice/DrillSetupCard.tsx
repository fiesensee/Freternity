import { useState, type FC } from 'react';
import { usePracticeStore, type PracticeInputMode } from '../../store/usePracticeStore';
import { GuitarInputStatusLine } from './GuitarInputPanel';
import {
  DrillOptions,
  DrillTypePicker,
  KeyPicker,
  SettingsSection,
  ThinkTimePicker,
  describeKey,
  hasThinkTime,
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
export const DrillSetupCard: FC<{ onOpenTuner?: () => void }> = ({ onOpenTuner }) => {
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
        <h2 className="text-xl sm:text-2xl font-black text-white">Practice</h2>
        <p className="text-sm text-slate-400 mt-1">
          Find chords on the neck, or play scales in time. Pick a drill and a key and go.
        </p>
      </div>

      <SettingsSection title="Drill">
        <DrillTypePicker />
      </SettingsSection>

      <SettingsSection title="Key">
        <KeyPicker />
      </SettingsSection>

      {hasThinkTime(config.exerciseType) ? (
        <>
          <SettingsSection title="Time to find it">
            <ThinkTimePicker />
          </SettingsSection>
          <SettingsSection title="Answer with" hint="how you respond during the drill">
            <InputModeToggle />
            <GuitarInputStatusLine onOpenTuner={onOpenTuner} />
          </SettingsSection>
        </>
      ) : (
        <SettingsSection title="Your guitar" hint="input device & timing calibration">
          <InputModeToggle />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Listens through your mic or interface. Pick single notes; headphones keep the click out of the
            mic.
          </p>
          <GuitarInputStatusLine onOpenTuner={onOpenTuner} />
        </SettingsSection>
      )}

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

/** Small inline toggle: play guitar or click the fretboard. */
const InputModeToggle: FC = () => {
  const inputMode = usePracticeStore((s) => s.inputMode);
  const setInputMode = usePracticeStore((s) => s.setInputMode);
  const error = usePracticeStore((s) => s.guitarInputError);

  const chip = (mode: PracticeInputMode, label: string) => (
    <button
      onClick={() => setInputMode(mode)}
      aria-pressed={inputMode === mode}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
        inputMode === mode
          ? 'bg-sky-600 text-white ring-1 ring-sky-400'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip('GUITAR', '🎸 Play guitar')}
      {chip('POINTER', '🖱 Click fretboard')}
      {error && inputMode === 'POINTER' && (
        <span className="text-[11px] text-rose-300 font-mono">
          {error.length > 50 ? error.slice(0, 50) + '…' : error}
        </span>
      )}
    </div>
  );
};