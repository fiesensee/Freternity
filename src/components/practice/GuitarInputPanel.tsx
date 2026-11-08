import { useEffect, useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import {
  GuitarPitchInputAdapter,
  guitarPitchInput,
  type AudioInputDevice,
  type InputMonitorSnapshot,
} from '../../adapters/guitarPitchInput';
import { CHROMATIC_SHARPS, midiToOctave, midiToPitchClass } from '../../core/musicTheory';

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
  /**
   * full: setup screen section · toggle: just the input switch (drill menu) ·
   * status: just the level meter / errors while a drill runs
   */
  variant?: 'full' | 'toggle' | 'status';
}

export const GuitarInputPanel: FC<GuitarInputPanelProps> = ({ variant = 'full' }) => {
  const inputMode = usePracticeStore((s) => s.inputMode);
  const status = usePracticeStore((s) => s.guitarInputStatus);
  const error = usePracticeStore((s) => s.guitarInputError);
  const setInputMode = usePracticeStore((s) => s.setInputMode);

  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [deviceId, setDeviceId] = useState(guitarPitchInput.getDeviceId() ?? '');
  const [sensitivity, setSensitivity] = useState(guitarPitchInput.getSensitivity());

  const isListening = status === 'LISTENING';
  const monitor = useInputMonitor(isListening);
  const supported = GuitarPitchInputAdapter.isSupported();

  // Labels only become available after permission, so refresh once listening starts.
  useEffect(() => {
    if (!isListening) return;
    guitarPitchInput.listInputDevices().then(setDevices).catch(() => setDevices([]));
  }, [isListening]);

  const changeDevice = (id: string) => {
    setDeviceId(id);
    guitarPitchInput.setDevice(id).catch(() => {});
  };

  const changeSensitivity = (value: number) => {
    setSensitivity(value);
    guitarPitchInput.setSensitivity(value);
  };

  const modeButton = (mode: 'POINTER' | 'GUITAR', label: string) => (
    <button
      onClick={() => setInputMode(mode)}
      disabled={mode === 'GUITAR' && !supported}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        inputMode === mode
          ? 'bg-sky-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  const toggle = (
    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
      {modeButton('POINTER', '🖱 Click Fretboard')}
      {modeButton('GUITAR', '🎤 Play My Guitar')}
    </div>
  );

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

  if (variant === 'toggle') {
    return (
      <div className="flex flex-col gap-2">
        {toggle}
        {statusLine}
      </div>
    );
  }

  if (variant === 'status') {
    if (inputMode !== 'GUITAR') return null;
    return (
      <div className="flex flex-wrap items-center gap-3">
        {isListening && meter}
        {statusLine}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Answer with</h3>
      {toggle}

      {!supported && (
        <p className="text-xs text-slate-400">
          This browser doesn’t support audio input. Use a recent Chrome, Edge, Firefox or Safari.
        </p>
      )}

      {inputMode === 'GUITAR' && (
        <div className="flex flex-col gap-3">
          {statusLine}

          {isListening && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                {meter}
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  Sensitivity
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={sensitivity}
                    onChange={(e) => changeSensitivity(Number(e.target.value))}
                    className="w-24 accent-sky-500"
                  />
                </label>
              </div>

              {devices.length > 1 && (
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  Input
                  <select
                    value={deviceId}
                    onChange={(e) => changeDevice(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 max-w-xs"
                  >
                    <option value="">System default</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <ul className="text-[11px] text-slate-400 leading-relaxed list-disc pl-4">
            <li>
              Pick the triad <strong className="text-slate-200">one note at a time</strong>, so each note
              is detected. Strummed chords aren’t recognised.
            </li>
            <li>
              All Inversions Sprint: play the three shapes{' '}
              <strong className="text-slate-200">in order from the nut up towards the 12th fret</strong>.
              Each note is checked against the shape that comes next.
            </li>
            <li>
              Exact pitches are checked, octave included, so the right shape in the wrong place counts
              as wrong. The solution is revealed as soon as you’ve played it correctly.
            </li>
            <li>
              Pluck a string: the meter should turn green and show the note. If it doesn’t, raise the
              sensitivity. If notes show up while you’re not playing, lower it.
            </li>
            <li>The drone stays muted while listening so the mic doesn’t pick it up.</li>
          </ul>
        </div>
      )}
    </section>
  );
};
