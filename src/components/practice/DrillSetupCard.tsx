import { useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { GuitarInputPanel, InputDeviceControls } from './GuitarInputPanel';
import { guitarPitchInput } from '../../adapters/guitarPitchInput';
import { getRhythmLatency } from '../../adapters/rhythm/rhythmPrefs';
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
/** Scale-in-time listens to the guitar itself: which input, and is its timing calibrated? */
const RhythmInputNotice: FC<{ onOpenRhythmLab?: () => void }> = ({ onOpenRhythmLab }) => {
  const latency = getRhythmLatency(guitarPitchInput.getDeviceId());
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Your guitar</h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Listens through your mic or interface. Pick single notes; headphones keep the click out of the
        mic.
      </p>
      <InputDeviceControls active compact />
      <p className="text-[11px] text-slate-400">
        {latency !== null ? (
          <>
            Timing calibrated for this input: <strong className="text-slate-200 font-mono">{latency} ms</strong>{' '}
            is subtracted.{' '}
          </>
        ) : (
          <span className="text-amber-300/90">This input isn’t calibrated yet, so timings include your system’s delay. </span>
        )}
        {onOpenRhythmLab && (
          <button onClick={onOpenRhythmLab} className="text-sky-400 hover:text-sky-300 underline cursor-pointer">
            {latency !== null ? 'Recalibrate' : 'Calibrate'} in the Rhythm Lab
          </button>
        )}
      </p>
    </section>
  );
};

export const DrillSetupCard: FC<{ onOpenRhythmLab?: () => void }> = ({ onOpenRhythmLab }) => {
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
          <GuitarInputPanel />
        </>
      ) : (
        <RhythmInputNotice onOpenRhythmLab={onOpenRhythmLab} />
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
