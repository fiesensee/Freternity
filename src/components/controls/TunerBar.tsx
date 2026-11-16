import { useEffect, useRef, useState, type FC } from 'react';
import { guitarPitchInput, GuitarPitchInputAdapter } from '../../adapters/guitarPitchInput';
import { usePracticeStore } from '../../store/usePracticeStore';
import { IN_TUNE_CENTS, readTuning, smoothFrequency, type TuningReading } from '../../core/pitch/tuner';
import { GUITAR_6_STANDARD } from '../../core/constants';
import { CHROMATIC_SHARPS, midiToOctave, midiToPitchClass } from '../../core/musicTheory';
import { toDisplayStringNumber } from '../../core/stringNumbering';
import { GuitarInputPanel, InputDeviceControls } from '../practice/GuitarInputPanel';

const REFRESH_MS = 50;
/** Pitch estimates the needle is smoothed over (~250 ms) */
const SMOOTHING_SAMPLES = 5;
/** Keep showing the last note this long after the string stops ringing */
const HOLD_MS = 1200;

type MicStatus = 'STARTING' | 'LISTENING' | 'ERROR';

// Low E → high E, internal string indices
const OPEN_STRINGS = [6, 5, 4, 3, 2, 1].map((stringIndex) => ({
  stringIndex,
  midi: GUITAR_6_STANDARD.tuningMidi[stringIndex - 1],
}));

const noteName = (midi: number) => CHROMATIC_SHARPS[midiToPitchClass(midi)];

/** Tuning fork, drawn inline (there's no emoji for one) so it renders on every system. */
export const TuningForkIcon: FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M8 2v7a4 4 0 0 0 8 0V2" />
    <path d="M12 13v9" />
  </svg>
);

/**
 * Chromatic tuner strip. Uses the same input as the practice guitar mode: it starts the mic
 * if nothing else is using it, and only stops it again if the practice drill doesn't need it.
 */
export const TunerBar: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState<MicStatus>('STARTING');
  const [reading, setReading] = useState<TuningReading | null>(null);
  const [level, setLevel] = useState(0);
  const recent = useRef<number[]>([]);
  const lastHeardAt = useRef(0);
  const isRestarting = useRef(false);

  // Mic lifecycle
  useEffect(() => {
    let cancelled = false;
    const startedByTuner = !guitarPitchInput.isRunning;

    if (!GuitarPitchInputAdapter.isSupported()) {
      setStatus('ERROR');
      return;
    }
    guitarPitchInput
      .start()
      .then(() => !cancelled && setStatus('LISTENING'))
      .catch(() => !cancelled && setStatus('ERROR'));

    return () => {
      cancelled = true;
      const practiceNeedsMic = usePracticeStore.getState().inputMode === 'GUITAR';
      if (startedByTuner && !practiceNeedsMic) guitarPitchInput.stop();
    };
  }, []);

  // Needle updates
  useEffect(() => {
    if (status !== 'LISTENING') return;
    const id = setInterval(() => {
      // Practice may have switched the mic off underneath us: take it back
      if (!guitarPitchInput.isRunning) {
        if (!isRestarting.current) {
          isRestarting.current = true;
          guitarPitchInput
            .start()
            .catch(() => setStatus('ERROR'))
            .finally(() => (isRestarting.current = false));
        }
        return;
      }
      const snapshot = guitarPitchInput.getMonitorSnapshot();
      setLevel(snapshot.level);
      const now = performance.now();
      if (snapshot.frequencyHz !== null) {
        recent.current = [...recent.current, snapshot.frequencyHz].slice(-SMOOTHING_SAMPLES);
        lastHeardAt.current = now;
        const smoothed = smoothFrequency(recent.current);
        if (smoothed !== null) setReading(readTuning(smoothed));
      } else if (now - lastHeardAt.current > HOLD_MS) {
        recent.current = [];
        setReading(null);
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [status]);

  // Escape closes the tuner (but don't also exit a running drill)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const cents = reading?.cents ?? 0;
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  const tone = !reading
    ? 'text-slate-500'
    : inTune
    ? 'text-emerald-400'
    : Math.abs(cents) <= 15
    ? 'text-amber-400'
    : 'text-rose-400';
  const needleColor = !reading
    ? 'bg-slate-600'
    : inTune
    ? 'bg-emerald-400'
    : Math.abs(cents) <= 15
    ? 'bg-amber-400'
    : 'bg-rose-400';

  return (
    <div className="max-w-7xl mx-auto px-4 pb-3">
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-col gap-2.5">
        <div
          role="region"
          aria-label="Tuner"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          {/* Note */}
          <div className="flex items-baseline gap-1 w-16" aria-live="polite">
            <span className={`text-2xl font-black font-mono ${tone}`}>
              {reading ? noteName(reading.midiNote) : '—'}
            </span>
            {reading && (
              <span className="text-[11px] font-mono text-slate-500">{midiToOctave(reading.midiNote)}</span>
            )}
          </div>

          {/* Needle: −50 … +50 cents */}
          <div className="flex-1 min-w-[12rem] flex flex-col gap-1">
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700" />
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/15 rounded"
                style={{ left: `${50 - IN_TUNE_CENTS}%`, width: `${IN_TUNE_CENTS * 2}%` }}
              />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500" />
              <div
                className={`absolute top-0 bottom-0 w-1 -ml-0.5 rounded-full transition-[left] duration-100 ${needleColor}`}
                style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>♭ flat</span>
              <span className={tone}>
                {status === 'STARTING'
                  ? 'waiting for the microphone…'
                  : status === 'ERROR'
                  ? 'no audio input, allow the microphone and reopen'
                  : !reading
                  ? level > 0.02
                    ? 'listening…'
                    : 'play a string'
                  : inTune
                  ? 'in tune'
                  : `${cents > 0 ? '+' : ''}${cents.toFixed(0)}¢`}
              </span>
              <span>sharp ♯</span>
            </div>
          </div>

          {/* Standard tuning reference: lights up the string being tuned */}
          <div className="flex items-center gap-1" title="Standard tuning, low to high">
            {OPEN_STRINGS.map(({ stringIndex, midi }) => {
              const active = reading?.openStringIndex === stringIndex;
              return (
                <span
                  key={stringIndex}
                  title={`String ${toDisplayStringNumber(stringIndex)}: ${noteName(midi)}${midiToOctave(midi)}`}
                  className={`w-7 py-0.5 rounded-md text-center text-xs font-mono font-bold border transition ${
                    active
                      ? inTune
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'border-slate-800 text-slate-500'
                  }`}
                >
                  {noteName(midi)}
                </span>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close tuner"
            className="text-slate-500 hover:text-white text-sm px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Guitar input settings: which input, how sensitive, and whether drills listen to it */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2.5 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Answer drills by</span>
            <GuitarInputPanel variant="toggle" />
          </div>
          <InputDeviceControls active={status === 'LISTENING'} compact />
        </div>
      </div>
    </div>
  );
};
