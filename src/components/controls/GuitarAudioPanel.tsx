import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import {
  GuitarPitchInputAdapter,
  guitarPitchInput,
  type AudioInputDevice,
  type InputMonitorSnapshot,
} from '../../adapters/guitarPitchInput';
import { CHROMATIC_SHARPS, midiToPitchClass } from '../../core/musicTheory';
import { RhythmSession, type RhythmEvent } from '../../adapters/rhythm/rhythmSession';
import {
  latencyFromCalibration,
  matchToGrid,
  timingStats,
  type RhythmGrid,
} from '../../core/rhythm/rhythmMath';
import {
  getClickVolume,
  setClickVolume as saveClickVolume,
  getRhythmLatency,
  setRhythmLatency,
} from '../../adapters/rhythm/rhythmPrefs';

const MONITOR_REFRESH_MS = 60;

// ---------------------------------------------------------------------------
// Calibration constants
// ---------------------------------------------------------------------------

type CalMode = 'CALIBRATE' | 'LOOPBACK';

interface Hit {
  slot: number;
  offsetMs: number;
}

const MEASURE_HITS = 8;
const BEATS_PER_BAR = 4;

const CAL_MODES: readonly { id: CalMode; label: string; hint: string }[] = [
  {
    id: 'CALIBRATE',
    label: 'Calibrate',
    hint: `Play ${MEASURE_HITS} notes exactly on the beat. The median delay becomes your latency correction (includes your own habit of playing early/late).`,
  },
  {
    id: 'LOOPBACK',
    label: 'Loopback test',
    hint: `Don't play. Hold the mic near the speaker (no headphones): the click itself is measured over ${MEASURE_HITS} beats. That's the pure system round trip.`,
  },
];

const fmtMs = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms)} ms`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noteName = (midi: number) => CHROMATIC_SHARPS[midiToPitchClass(midi)];

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

// ---------------------------------------------------------------------------
// GuitarAudioPanel
// ---------------------------------------------------------------------------

/**
 * Single source of truth for guitar input and latency settings.
 * Hosted inside the TunerBar; every other site shows only a status line + link.
 */
export const GuitarAudioPanel: FC = () => {
  // --- shared state ---
  const inputMode = usePracticeStore((s) => s.inputMode);
  const setInputMode = usePracticeStore((s) => s.setInputMode);
  const status = usePracticeStore((s) => s.guitarInputStatus);
  const isMicOpen = status === 'LISTENING';
  const supported = GuitarPitchInputAdapter.isSupported();
  const monitor = useInputMonitor(isMicOpen);

  // --- device / sensitivity ---
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [deviceId, setDeviceId] = useState(guitarPitchInput.getDeviceId() ?? '');
  const [sensitivity, setSensitivity] = useState(guitarPitchInput.getSensitivity());

  useEffect(() => {
    if (!isMicOpen) return;
    guitarPitchInput.listInputDevices().then(setDevices).catch(() => setDevices([]));
  }, [isMicOpen]);

  const changeDevice = (id: string) => {
    setDeviceId(id);
    guitarPitchInput.setDevice(id).catch(() => {});
  };

  const changeSensitivity = (value: number) => {
    setSensitivity(value);
    guitarPitchInput.setSensitivity(value);
  };

  // --- latency calibration ---
  const currentLatencyMs = () => getRhythmLatency(guitarPitchInput.getDeviceId()) ?? 0;
  const saveLatency = (ms: number) =>
    setRhythmLatency(guitarPitchInput.getDeviceId(), ms === 0 ? null : ms);

  const [latencyMs, setLatencyMs] = useState(currentLatencyMs);

  // --- calibration session ---
  const session = useRef<RhythmSession | null>(null);
  const grid = useRef<RhythmGrid | null>(null);
  const clicks = useRef<Extract<RhythmEvent, { type: 'click' }>[]>([]);

  const [calMode, setCalMode] = useState<CalMode>('CALIBRATE');
  const [calRunning, setCalRunning] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [calHits, setCalHits] = useState<Hit[]>([]);
  const [calCurrentSlot, setCalCurrentSlot] = useState<number | null>(null);
  const [calMeasurement, setCalMeasurement] = useState<{
    mode: CalMode;
    medianMs: number;
    spreadMs: number;
  } | null>(null);
  const [calClickVolume, setCalClickVolume] = useState(getClickVolume);
  const [calDiagnostics, setCalDiagnostics] = useState<string | null>(null);

  const stopCal = useCallback(() => {
    session.current?.close();
    session.current = null;
    grid.current = null;
    clicks.current = [];
    setCalRunning(false);
    setCalCurrentSlot(null);
  }, []);

  useEffect(() => stopCal, [stopCal]);

  const startCal = async () => {
    setCalError(null);
    setCalHits([]);
    setCalMeasurement(null);
    const s = new RhythmSession();
    try {
      await s.open();
    } catch (err) {
      setCalError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.'
          : err instanceof Error
          ? err.message
          : 'Could not open the audio input.'
      );
      s.close();
      return;
    }
    session.current = s;
    s.setClickVolume(calClickVolume);
    s.setRequirePitch(calMode !== 'LOOPBACK');
    const sampleRate = s.sampleRate;
    const out = s.reportedOutputLatencyMs();
    setCalDiagnostics(
      `${sampleRate ? `${sampleRate / 1000} kHz` : ''}${out !== null ? ` · browser-reported output latency ${out} ms` : ''}`
    );

    s.onEvent((e) => {
      if (e.type === 'click') {
        clicks.current = [...clicks.current.slice(-64), e];
        return;
      }
      const g = grid.current;
      if (!g) return;
      const hit = matchToGrid(e.time, g, 0);
      if (!hit) return;
      setCalHits((prev) => [...prev, { slot: hit.slot, offsetMs: hit.offsetMs }]);
    });

    grid.current = s.startMetronome({
      bpm: 80,
      subdivision: 1,
      beatsPerBar: BEATS_PER_BAR,
      countInBars: 1,
      clickSubdivisions: false,
    });
    setCalRunning(true);
  };

  // Beat lights for calibration
  useEffect(() => {
    if (!calRunning) return;
    let raf = 0;
    const tick = () => {
      const now = session.current?.now() ?? 0;
      const past = clicks.current.filter((c) => c.time <= now);
      setCalCurrentSlot(past.length ? past[past.length - 1].slot : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [calRunning]);

  // Auto-finish calibration after enough hits
  useEffect(() => {
    if (!calRunning || calHits.length < MEASURE_HITS) return;
    const offsets = calHits.slice(0, MEASURE_HITS).map((h) => h.offsetMs);
    const median = latencyFromCalibration(offsets);
    const stats = timingStats(offsets);
    stopCal();
    if (median === null || !stats) return;
    setCalMeasurement({ mode: calMode, medianMs: median, spreadMs: stats.spreadMs });
    if (calMode === 'CALIBRATE') {
      setLatencyMs(median);
      saveLatency(median);
    }
  }, [calHits, calMode, calRunning, stopCal]);

  const changeCalClickVolume = (volume: number) => {
    setCalClickVolume(volume);
    session.current?.setClickVolume(volume);
    saveClickVolume(volume);
  };

  const applyLatency = (ms: number) => {
    setLatencyMs(ms);
    saveLatency(ms);
  };

  const calStats = timingStats(calHits.map((h) => h.offsetMs));
  const beatInBar =
    calCurrentSlot === null
      ? null
      : ((calCurrentSlot % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  const isCountIn = calCurrentSlot !== null && calCurrentSlot < 0;

  // --- answer mode toggle ---
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

  const statusLine =
    status === 'STARTING' ? (
      <span className="text-xs text-amber-300 font-mono">Waiting for microphone permission…</span>
    ) : status === 'ERROR' ? (
      <span className="text-xs text-rose-300">
        {usePracticeStore.getState().guitarInputError}{' '}
        <button
          onClick={() => setInputMode('GUITAR')}
          className="underline cursor-pointer hover:text-rose-200"
        >
          Retry
        </button>
      </span>
    ) : null;

  // --- level meter ---
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
        {monitor?.midiNote != null ? noteName(monitor.midiNote) : '—'}
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

  return (
    <div className="flex flex-col gap-3">
      {/* Answer by toggle */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Answer drills by</span>
          {toggle}
        </div>
        {statusLine}
      </div>

      {!supported && (
        <p className="text-xs text-slate-400">
          This browser doesn’t support audio input. Use a recent Chrome, Edge, Firefox or Safari.
        </p>
      )}

      {/* Level meter + input device controls (only when mic is open and guitar mode) */}
      {inputMode === 'GUITAR' && isMicOpen && (
        <div className="flex flex-wrap items-center gap-4">
          {meter}
          <GuitarInputDeviceSection
            active={isMicOpen}
            devices={devices}
            deviceId={deviceId}
            sensitivity={sensitivity}
            onChangeDevice={changeDevice}
            onChangeSensitivity={changeSensitivity}
          />
        </div>
      )}

      {/* Latency calibration */}
      <div className="flex flex-col gap-3 pt-2.5 border-t border-slate-800/80">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Latency calibration
          </h3>
          <span className="text-[11px] text-slate-500">
            {latencyMs > 0
              ? `corrected by ${latencyMs} ms`
              : 'not calibrated'}
          </span>
          {latencyMs !== 0 && (
            <button
              onClick={() => applyLatency(0)}
              disabled={calRunning}
              className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer disabled:opacity-50"
            >
              reset
            </button>
          )}
        </div>

        {/* Mode chips */}
        <div className="flex flex-wrap gap-2">
          {CAL_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setCalMode(m.id)}
              disabled={calRunning}
              aria-pressed={calMode === m.id}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap disabled:cursor-not-allowed ${
                calMode === m.id
                  ? 'bg-sky-600 text-white ring-1 ring-sky-400'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {CAL_MODES.find((m) => m.id === calMode)?.hint}
        </p>

        {/* Click volume */}
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          Click volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={calClickVolume}
            onChange={(e) => changeCalClickVolume(Number(e.target.value))}
            aria-label="Click volume"
            className="w-28 accent-amber-500 cursor-pointer"
          />
          <span className="font-mono w-8">{Math.round(calClickVolume * 100)}%</span>
        </label>

        {/* Transport + beat lights */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={calRunning ? stopCal : startCal}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
              calRunning
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 text-white shadow-lg shadow-rose-600/25'
            }`}
          >
            {calRunning
              ? '■ Stop'
              : `▶ Start ${CAL_MODES.find((m) => m.id === calMode)?.label.toLowerCase()}`}
          </button>
          {calRunning && (
            <div className="flex items-center gap-2">
              {Array.from({ length: BEATS_PER_BAR }, (_, i) => (
                <span
                  key={i}
                  className={`w-3 h-3 rounded-full border transition-colors duration-75 ${
                    beatInBar === i
                      ? isCountIn
                        ? 'bg-sky-400 border-sky-200'
                        : i === 0
                        ? 'bg-rose-500 border-rose-200'
                        : 'bg-amber-400 border-amber-100'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                />
              ))}
              <span className="text-xs font-mono text-slate-400">
                {isCountIn
                  ? 'count-in…'
                  : `${Math.min(calHits.length, MEASURE_HITS)}/${MEASURE_HITS}`}
              </span>
            </div>
          )}
          {calError && <span className="text-xs text-rose-300">{calError}</span>}
        </div>

        {/* Measurement result */}
        {calMeasurement && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 flex flex-wrap items-center gap-3">
            {calMeasurement.mode === 'CALIBRATE' ? (
              <span>
                Calibrated: <strong className="font-mono">{calMeasurement.medianMs} ms</strong>{' '}
                is now subtracted from every pluck. Spread while calibrating: ±
                {Math.round(calMeasurement.spreadMs)} ms.
              </span>
            ) : (
              <>
                <span>
                  Round trip (speaker → mic):{' '}
                  <strong className="font-mono">{calMeasurement.medianMs} ms</strong>,
                  spread ±{Math.round(calMeasurement.spreadMs)} ms. That spread is the
                  system’s own timing noise.
                </span>
                <button
                  onClick={() => applyLatency(calMeasurement.medianMs)}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Use as latency correction
                </button>
              </>
            )}
          </div>
        )}

        {/* Hits summary */}
        {(calHits.length > 0 || calRunning) && (
          <div className="grid grid-cols-3 gap-2">
            <CalStat label="Notes" value={String(calHits.length)} />
            <CalStat
              label="On average"
              value={
                calStats
                  ? fmtMs(calStats.meanMs)
                  : '—'
              }
              hint={
                calStats
                  ? Math.abs(calStats.meanMs) < 5
                    ? 'centred'
                    : calStats.meanMs < 0
                    ? 'early'
                    : 'late'
                  : undefined
              }
            />
            <CalStat
              label="Spread"
              value={calStats ? `±${Math.round(calStats.spreadMs)} ms` : '—'}
              emphasis
            />
          </div>
        )}

        {calDiagnostics && (
          <p className="text-[11px] font-mono text-slate-500">{calDiagnostics}</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Device picker + sensitivity slider, extracted so it can be used inline. */
const GuitarInputDeviceSection: FC<{
  active: boolean;
  devices: AudioInputDevice[];
  deviceId: string;
  sensitivity: number;
  onChangeDevice: (id: string) => void;
  onChangeSensitivity: (value: number) => void;
}> = ({ devices, deviceId, sensitivity, onChangeDevice, onChangeSensitivity }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label
      className="flex items-center gap-2 text-[11px] text-slate-400"
      title="Raise it if plucked notes aren't picked up, lower it if notes appear while you're not playing"
    >
      Sensitivity
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={sensitivity}
        onChange={(e) => onChangeSensitivity(Number(e.target.value))}
        className="w-24 accent-sky-500"
      />
    </label>

    {devices.length > 1 && (
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        Input
        <select
          value={deviceId}
          onChange={(e) => onChangeDevice(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 max-w-[14rem]"
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
  </div>
);

const CalStat: FC<{
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}> = ({ label, value, hint, emphasis }) => (
  <div
    className={`rounded-xl px-3 py-2 border ${
      emphasis
        ? 'bg-sky-500/10 border-sky-500/40'
        : 'bg-slate-950/70 border-slate-800'
    }`}
  >
    <div className="text-[10px] uppercase tracking-wider text-slate-500">
      {label}
    </div>
    <div className="text-base font-black font-mono text-white">{value}</div>
    {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// GuitarInputStatus — short status line + link for use outside the panel
// ---------------------------------------------------------------------------

/** A one-line summary of the current guitar setup, with a link to open the full panel. */
export const GuitarInputStatusLine: FC<{ onOpenTuner?: () => void }> = ({ onOpenTuner }) => {
  const inputMode = usePracticeStore((s) => s.inputMode);
  const deviceId = guitarPitchInput.getDeviceId();
  const latency = getRhythmLatency(deviceId);
  const status = usePracticeStore((s) => s.guitarInputStatus);

  if (!onOpenTuner) return null;

  const deviceLabel = deviceId ? 'custom input' : 'default input';

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