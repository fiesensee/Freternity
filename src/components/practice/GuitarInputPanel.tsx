import { useEffect, useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import {
  guitarPitchInput,
  type InputMonitorSnapshot,
} from '../../adapters/guitarPitchInput';
import { CHROMATIC_SHARPS, midiToOctave, midiToPitchClass } from '../../core/musicTheory';
import { getRhythmLatency } from '../../adapters/rhythm/rhythmPrefs';

const MONITOR_REFRESH_MS = 60;

export const midiToLabel = (midi: number) =>
  `${CHROMATIC_SHARPS[midiToPitchClass(midi)]}${midiToOctave(midi)}`;

function useInputMonitor(active: boolean): InputMonitorSnapshot | null {
  const [snapshot, setSnapshot] = useState<InputMonitorSnapshot | null>(null);
  useEffect(() => {
    if (!active) {
      setSnapshot(null);
      return;
    }
    const id = setInterval(() => setSnapshot(guitarPitchInput.getMonitorSnapshot()), MONITOR_REFRESH_MS);
    return () => clearInterval(id);
  }, [active]);
  return snapshot;
}

export interface GuitarInputPanelProps {
  /** Just the level meter / errors while a drill runs */
  variant?: 'status';
  // No other variants — all configuration moved to GuitarAudioPanel
}

/**
 * Minimal guitar input display: the level meter, note name, and error line shown during
 * a running drill. All configuration happens in the GuitarAudioPanel (TunerBar).
 */
export const GuitarInputPanel: FC<GuitarInputPanelProps> = () => {
  const inputMode = usePracticeStore((s) => s.inputMode);
  const status = usePracticeStore((s) => s.guitarInputStatus);
  const error = usePracticeStore((s) => s.guitarInputError);
  const setInputMode = usePracticeStore((s) => s.setInputMode);

  const isListening = status === 'LISTENING';
  const monitor = useInputMonitor(isListening);

  const meter = (
    <div className="flex items-center gap-3">
      <div
        className="w-24 sm:w-32 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800"
        title="Input level"
      >
        <div
          className={`h-full transition-[width] duration-75 ${
            monitor?.gateOpen ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
          style={{ width: `${Math.round((monitor?.level ?? 0) * 100)}%` }}
        />
      </div>
      <span className="font-mono text-sm font-bold text-white w-10">
        {monitor?.midiNote != null ? midiToLabel(monitor.midiNote) : '—'}
      </span>
      {monitor?.midiNote != null && (
        <span
          className={`font-mono text-[11px] w-12 ${
            Math.abs(monitor.cents) <= 15 ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {monitor.cents > 0 ? '+' : ''}
          {monitor.cents}¢
        </span>
      )}
    </div>
  );

  const statusLine =
    status === 'STARTING' ? (
      <span className="text-xs text-amber-300 font-mono">Waiting for microphone permission…</span>
    ) : status === 'ERROR' ? (
      <span className="text-xs text-rose-300">
        {error}{' '}
        <button
          onClick={() => setInputMode('GUITAR')}
          className="underline cursor-pointer hover:text-rose-200"
        >
          Retry
        </button>
      </span>
    ) : null;

  if (inputMode !== 'GUITAR') return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isListening && meter}
      {statusLine}
    </div>
  );
};

/**
 * One-line summary of guitar input status for drill setup / HUD, with a link to the
 * full GuitarAudioPanel.
 */
export const GuitarInputStatusLine: FC<{ onOpenTuner?: () => void }> = ({ onOpenTuner }) => {
  const inputMode = usePracticeStore((s) => s.inputMode);
  const status = usePracticeStore((s) => s.guitarInputStatus);
  const deviceId = guitarPitchInput.getDeviceId();
  const latency = getRhythmLatency(deviceId);

  const deviceLabel = deviceId ? 'custom input' : 'default input';

  if (!onOpenTuner) return null;

  return (
    <p className="text-[11px] text-slate-400 leading-relaxed">
      {inputMode === 'GUITAR' ? (
        <>
          Guitar: {deviceLabel}
          {latency !== null ? (
            <> · calibrated <strong className="text-slate-200 font-mono">{latency} ms</strong></>
          ) : (
            <span className="text-amber-300/90"> · not calibrated (timings include system delay)</span>
          )}
          {status === 'ERROR' && <span className="text-rose-300"> · input error</span>}
        </>
      ) : (
        'Answer by clicking the fretboard'
      )}
      {' · '}
      <button onClick={onOpenTuner} className="text-sky-400 hover:text-sky-300 underline cursor-pointer">
        Open guitar & audio settings
      </button>
    </p>
  );
};