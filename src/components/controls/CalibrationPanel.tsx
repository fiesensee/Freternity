import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { RhythmSession, type RhythmEvent } from '../../adapters/rhythm/rhythmSession';
import {
  latencyFromCalibration,
  matchToGrid,
  timingStats,
  type RhythmGrid,
} from '../../core/rhythm/rhythmMath';
import { InputDeviceControls } from '../practice/GuitarInputPanel';
import {
  getClickVolume,
  setClickVolume as saveClickVolume,
} from '../../adapters/rhythm/rhythmPrefs';

type CalMode = 'CALIBRATE' | 'LOOPBACK';

interface Hit {
  slot: number;
  offsetMs: number;
}

const MEASURE_HITS = 8;
const BEATS_PER_BAR = 4;

const MODES: readonly { id: CalMode; label: string; hint: string }[] = [
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

/**
 * Latency calibration section — calibrate or loopback. Renders inside the tuner bar.
 * Takes the current latency and a save callback so the parent owns the value.
 */
export const CalibrationPanel: FC<{
  latencyMs: number;
  onLatencyChange: (ms: number) => void;
}> = ({ latencyMs, onLatencyChange }) => {
  const session = useRef<RhythmSession | null>(null);
  const grid = useRef<RhythmGrid | null>(null);
  const clicks = useRef<Extract<RhythmEvent, { type: 'click' }>[]>([]);

  const [mode, setMode] = useState<CalMode>('CALIBRATE');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [measurement, setMeasurement] = useState<{
    mode: CalMode;
    medianMs: number;
    spreadMs: number;
  } | null>(null);
  const [clickVolume, setClickVolume] = useState(getClickVolume);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const stop = useCallback(() => {
    session.current?.close();
    session.current = null;
    grid.current = null;
    clicks.current = [];
    setRunning(false);
    setCurrentSlot(null);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setError(null);
    setHits([]);
    setMeasurement(null);
    const s = new RhythmSession();
    try {
      await s.open();
    } catch (err) {
      setError(
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
    s.setClickVolume(clickVolume);
    s.setRequirePitch(mode !== 'LOOPBACK');
    const sampleRate = s.sampleRate;
    const out = s.reportedOutputLatencyMs();
    setDiagnostics(
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
      setHits((prev) => [...prev, { slot: hit.slot, offsetMs: hit.offsetMs }]);
    });

    grid.current = s.startMetronome({
      bpm: 80,
      subdivision: 1,
      beatsPerBar: BEATS_PER_BAR,
      countInBars: 1,
      clickSubdivisions: false,
    });
    setRunning(true);
  };

  // Beat lights
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const now = session.current?.now() ?? 0;
      const past = clicks.current.filter((c) => c.time <= now);
      setCurrentSlot(past.length ? past[past.length - 1].slot : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Auto-finish after enough hits
  useEffect(() => {
    if (!running || hits.length < MEASURE_HITS) return;
    const offsets = hits.slice(0, MEASURE_HITS).map((h) => h.offsetMs);
    const median = latencyFromCalibration(offsets);
    const stats = timingStats(offsets);
    stop();
    if (median === null || !stats) return;
    setMeasurement({ mode, medianMs: median, spreadMs: stats.spreadMs });
    if (mode === 'CALIBRATE') {
      onLatencyChange(median);
    }
  }, [hits, mode, running, stop, onLatencyChange]);

  const changeClickVolume = (volume: number) => {
    setClickVolume(volume);
    session.current?.setClickVolume(volume);
    saveClickVolume(volume);
  };

  const applyLatency = (ms: number) => {
    onLatencyChange(ms);
  };

  const stats = timingStats(hits.map((h) => h.offsetMs));
  const beatInBar =
    currentSlot === null
      ? null
      : ((currentSlot % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  const isCountIn = currentSlot !== null && currentSlot < 0;

  return (
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
      </div>

      {/* Mode chips */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={running}
            aria-pressed={mode === m.id}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap disabled:cursor-not-allowed ${
              mode === m.id
                ? 'bg-sky-600 text-white ring-1 ring-sky-400'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {MODES.find((m) => m.id === mode)?.hint}
      </p>

      {/* Click volume */}
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        Click volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={clickVolume}
          onChange={(e) => changeClickVolume(Number(e.target.value))}
          aria-label="Click volume"
          className="w-28 accent-amber-500 cursor-pointer"
        />
        <span className="font-mono w-8">{Math.round(clickVolume * 100)}%</span>
      </label>

      {/* Input */}
      <InputDeviceControls active={running} compact />

      {/* Latency display */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>
          Correction:{' '}
          <strong className="text-slate-200 font-mono">{latencyMs} ms</strong>
          {latencyMs === 0 && (
            <span className="text-slate-500"> (not calibrated yet)</span>
          )}
        </span>
        {latencyMs !== 0 && (
          <button
            onClick={() => applyLatency(0)}
            disabled={running}
            className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
          >
            reset
          </button>
        )}
      </div>

      {/* Transport + beat lights */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={running ? stop : start}
          className={`px-5 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
            running
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 text-white shadow-lg shadow-rose-600/25'
          }`}
        >
          {running
            ? '■ Stop'
            : `▶ Start ${MODES.find((m) => m.id === mode)?.label.toLowerCase()}`}
        </button>
        {running && (
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
                : `${Math.min(hits.length, MEASURE_HITS)}/${MEASURE_HITS}`}
            </span>
          </div>
        )}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      {/* Measurement result */}
      {measurement && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 flex flex-wrap items-center gap-3">
          {measurement.mode === 'CALIBRATE' ? (
            <span>
              Calibrated: <strong className="font-mono">{measurement.medianMs} ms</strong>{' '}
              is now subtracted from every pluck. Spread while calibrating: ±
              {Math.round(measurement.spreadMs)} ms.
            </span>
          ) : (
            <>
              <span>
                Round trip (speaker → mic):{' '}
                <strong className="font-mono">{measurement.medianMs} ms</strong>,
                spread ±{Math.round(measurement.spreadMs)} ms. That spread is the
                system’s own timing noise.
              </span>
              <button
                onClick={() => applyLatency(measurement.medianMs)}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                Use as latency correction
              </button>
            </>
          )}
        </div>
      )}

      {/* Hits summary */}
      {(hits.length > 0 || running) && (
        <div className="grid grid-cols-3 gap-2">
          <CalStat label="Notes" value={String(hits.length)} />
          <CalStat
            label="On average"
            value={
              stats
                ? fmtMs(stats.meanMs)
                : '—'
            }
            hint={
              stats
                ? Math.abs(stats.meanMs) < 5
                  ? 'centred'
                  : stats.meanMs < 0
                  ? 'early'
                  : 'late'
                : undefined
            }
          />
          <CalStat
            label="Spread"
            value={stats ? `±${Math.round(stats.spreadMs)} ms` : '—'}
            emphasis
          />
        </div>
      )}

      {diagnostics && (
        <p className="text-[11px] font-mono text-slate-500">{diagnostics}</p>
      )}
    </div>
  );
};

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