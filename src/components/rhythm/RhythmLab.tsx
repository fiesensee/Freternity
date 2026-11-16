import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { RhythmSession, type RhythmEvent } from '../../adapters/rhythm/rhythmSession';
import {
  gradeOffset,
  latencyFromCalibration,
  matchToGrid,
  timingStats,
  type RhythmGrid,
  type Subdivision,
  type TimingGrade,
} from '../../core/rhythm/rhythmMath';
import { CHROMATIC_SHARPS, midiToOctave, midiToPitchClass } from '../../core/musicTheory';
import { InputDeviceControls } from '../practice/GuitarInputPanel';

/**
 * Rhythm prototype: a metronome plus sample-accurate pluck timing, to find out how precisely
 * plucks can be judged on a real setup before building a full rhythm exercise.
 */

type LabMode = 'PLAY' | 'CALIBRATE' | 'LOOPBACK';

interface Hit {
  slot: number;
  offsetMs: number;
  midiNote: MidiOrNull;
}
type MidiOrNull = number | null;

const LATENCY_KEY = 'freternity.rhythmLatencyMs';
const CLICK_VOLUME_KEY = 'freternity.rhythmClickVolume';
const DEFAULT_CLICK_VOLUME = 0.7;
const MEASURE_HITS = 8;
/** Most recent plucks shown in the dot plot */
const PLOTTED_HITS = 64;
const BEATS_PER_BAR = 4;

const SUBDIVISIONS: readonly { id: Subdivision; label: string }[] = [
  { id: 1, label: 'Quarters' },
  { id: 2, label: 'Eighths' },
  { id: 4, label: 'Sixteenths' },
];

const MODES: readonly { id: LabMode; label: string; hint: string }[] = [
  {
    id: 'PLAY',
    label: 'Play along',
    hint: 'Play single notes (a scale, one string, anything) on the clicks. Each pluck is snapped to the nearest slot and timed.',
  },
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

function readLatency(): number {
  try {
    return Number(localStorage.getItem(LATENCY_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function readClickVolume(): number {
  try {
    const stored = localStorage.getItem(CLICK_VOLUME_KEY);
    return stored === null ? DEFAULT_CLICK_VOLUME : Math.min(1, Math.max(0, Number(stored) || 0));
  } catch {
    return DEFAULT_CLICK_VOLUME;
  }
}

function writeLatency(ms: number): void {
  try {
    localStorage.setItem(LATENCY_KEY, String(ms));
  } catch {
    // per-viewer convenience only
  }
}

const gradeColor: Record<TimingGrade, string> = {
  tight: 'bg-emerald-400',
  ok: 'bg-amber-400',
  off: 'bg-rose-400',
};
const gradeText: Record<TimingGrade, string> = {
  tight: 'text-emerald-300',
  ok: 'text-amber-300',
  off: 'text-rose-300',
};

const fmtMs = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms)} ms`;
const noteLabel = (midi: number) => `${CHROMATIC_SHARPS[midiToPitchClass(midi)]}${midiToOctave(midi)}`;

export const RhythmLab: FC = () => {
  const session = useRef<RhythmSession | null>(null);
  const grid = useRef<RhythmGrid | null>(null);
  const clicks = useRef<Extract<RhythmEvent, { type: 'click' }>[]>([]);

  const [mode, setMode] = useState<LabMode>('PLAY');
  const [bpm, setBpm] = useState(80);
  const [subdivision, setSubdivision] = useState<Subdivision>(2);
  const [clickSubdivisions, setClickSubdivisions] = useState(false);
  const [latencyMs, setLatencyMs] = useState(readLatency);
  const [clickVolume, setClickVolume] = useState(readClickVolume);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [measurement, setMeasurement] = useState<{ mode: LabMode; medianMs: number; spreadMs: number } | null>(
    null
  );
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  // Settings that are fixed while measuring
  const effectiveSubdivision: Subdivision = mode === 'PLAY' ? subdivision : 1;
  const effectiveLatency = mode === 'PLAY' ? latencyMs : 0;

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
      const hit = matchToGrid(e.time, g, effectiveLatency);
      if (!hit) return; // during the count-in
      setHits((prev) => [...prev, { ...hit, midiNote: e.midiNote }]);
    });

    grid.current = s.startMetronome({
      bpm,
      subdivision: effectiveSubdivision,
      beatsPerBar: BEATS_PER_BAR,
      countInBars: 1,
      clickSubdivisions: mode === 'PLAY' && clickSubdivisions,
    });
    setRunning(true);
  };

  // Beat lights: follow the audio clock, not timers
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

  // Calibration / loopback finish on their own after enough hits
  useEffect(() => {
    if (mode === 'PLAY' || !running || hits.length < MEASURE_HITS) return;
    const offsets = hits.slice(0, MEASURE_HITS).map((h) => h.offsetMs);
    const median = latencyFromCalibration(offsets);
    const stats = timingStats(offsets);
    stop();
    if (median === null || !stats) return;
    setMeasurement({ mode, medianMs: median, spreadMs: stats.spreadMs });
    if (mode === 'CALIBRATE') {
      setLatencyMs(median);
      writeLatency(median);
    }
  }, [hits, mode, running, stop]);

  const changeClickVolume = (volume: number) => {
    setClickVolume(volume);
    session.current?.setClickVolume(volume);
    try {
      localStorage.setItem(CLICK_VOLUME_KEY, String(volume));
    } catch {
      // per-viewer convenience only
    }
  };

  const applyLatency = (ms: number) => {
    setLatencyMs(ms);
    writeLatency(ms);
  };

  const stats = timingStats(hits.map((h) => h.offsetMs));
  const slotsPerBar = BEATS_PER_BAR * effectiveSubdivision;
  const beatInBar =
    currentSlot === null
      ? null
      : Math.floor((((currentSlot % slotsPerBar) + slotsPerBar) % slotsPerBar) / effectiveSubdivision);
  const isCountIn = currentSlot !== null && currentSlot < 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-4xl mx-auto w-full flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-black text-white">Rhythm Lab</h2>
          <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
            prototype
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Measures how precisely your plucks can be timed against a click on your setup. The number that
          matters most is the <strong className="text-slate-200">spread</strong>: a constant delay can be
          calibrated away, wobble can’t.
        </p>
      </div>

      {/* Mode */}
      <Section title="Mode">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <Chip key={m.id} selected={mode === m.id} disabled={running} onClick={() => setMode(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{MODES.find((m) => m.id === mode)?.hint}</p>
      </Section>

      {/* Tempo & grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Section title={`Tempo · ${bpm} bpm`}>
          <input
            type="range"
            min={40}
            max={200}
            value={bpm}
            disabled={running}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="Tempo in beats per minute"
            className="w-full accent-amber-500 cursor-pointer disabled:opacity-50"
          />
        </Section>
        <Section title="Grid" hint={mode === 'PLAY' ? undefined : 'quarters while measuring'}>
          <div className="flex flex-wrap gap-2">
            {SUBDIVISIONS.map((s) => (
              <Chip
                key={s.id}
                selected={effectiveSubdivision === s.id}
                disabled={running || mode !== 'PLAY'}
                onClick={() => setSubdivision(s.id)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
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
          {mode === 'PLAY' && subdivision > 1 && (
            <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={clickSubdivisions}
                disabled={running}
                onChange={(e) => setClickSubdivisions(e.target.checked)}
                className="accent-sky-500"
              />
              Soft ticks between the beats
            </label>
          )}
        </Section>
      </div>

      <Section title="Input" hint="applies when you press Start">
        <InputDeviceControls active={running} compact />
      </Section>

      {/* Latency correction */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>
          Latency correction:{' '}
          <strong className="text-slate-200 font-mono">{latencyMs} ms</strong>
          {latencyMs === 0 && <span className="text-slate-500"> (not calibrated yet)</span>}
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
          className={`px-6 py-3 rounded-2xl text-sm font-black transition cursor-pointer ${
            running
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 text-white shadow-lg shadow-rose-600/25'
          }`}
        >
          {running ? '■ Stop' : `▶ Start ${MODES.find((m) => m.id === mode)?.label.toLowerCase()}`}
        </button>
        {running && (
          <div className="flex items-center gap-2">
            {Array.from({ length: BEATS_PER_BAR }, (_, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full border transition-colors duration-75 ${
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
              {isCountIn ? 'count-in…' : mode === 'PLAY' ? 'play!' : `${Math.min(hits.length, MEASURE_HITS)}/${MEASURE_HITS}`}
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
              Calibrated: <strong className="font-mono">{measurement.medianMs} ms</strong> is now subtracted from
              every pluck. Spread while calibrating: ±{Math.round(measurement.spreadMs)} ms.
            </span>
          ) : (
            <>
              <span>
                Round trip (speaker → mic): <strong className="font-mono">{measurement.medianMs} ms</strong>, spread ±
                {Math.round(measurement.spreadMs)} ms. That spread is the system’s own timing noise.
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

      {/* Results */}
      {(hits.length > 0 || running) && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Notes" value={String(hits.length)} />
            <Stat
              label="On average"
              value={stats ? fmtMs(stats.meanMs) : '—'}
              hint={stats ? (Math.abs(stats.meanMs) < 5 ? 'centred' : stats.meanMs < 0 ? 'early' : 'late') : undefined}
            />
            <Stat label="Spread" value={stats ? `±${Math.round(stats.spreadMs)} ms` : '—'} emphasis />
            <Stat label="Within ±25 ms" value={stats ? `${Math.round(stats.within25 * 100)}%` : '—'} />
            <Stat label="Within ±50 ms" value={stats ? `${Math.round(stats.within50 * 100)}%` : '—'} />
          </div>

          {/* Distribution: every pluck on a −100 … +100 ms axis */}
          <div className="flex flex-col gap-1">
            <div className="relative h-10 rounded-lg bg-slate-950/70 border border-slate-800 overflow-hidden">
              <div className="absolute top-0 bottom-0 bg-emerald-500/10" style={{ left: '37.5%', width: '25%' }} />
              <div className="absolute top-0 bottom-0 bg-amber-500/5" style={{ left: '25%', width: '50%' }} />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500" />
              {hits.slice(-PLOTTED_HITS).map((h, i, shown) => {
                // Everything keyed on the pluck's overall number, not its place in the
                // window, so dots stay put when the window slides on
                const hitNumber = hits.length - shown.length + i;
                const isLatest = hitNumber === hits.length - 1;
                const age = hits.length - 1 - hitNumber;
                const x = 50 + Math.max(-100, Math.min(100, h.offsetMs)) / 2;
                return (
                  <span
                    key={hitNumber}
                    title={fmtMs(h.offsetMs)}
                    className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${
                      gradeColor[gradeOffset(h.offsetMs)]
                    } ${isLatest ? 'w-3.5 h-3.5 ring-2 ring-white z-10 shadow-lg' : 'w-2 h-2'}`}
                    style={{
                      left: `${x}%`,
                      top: `${20 + ((hitNumber * 37) % 60)}%`,
                      opacity: isLatest ? 1 : Math.max(0.2, 0.85 - age / 40),
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>−100 ms early</span>
              <span>on the click</span>
              <span>late +100 ms</span>
            </div>
          </div>

          {/* Last plucks */}
          {hits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hits.slice(-12).map((h, i, shown) => {
                const grade = gradeOffset(h.offsetMs);
                const hitNumber = hits.length - shown.length + i;
                const isLatest = hitNumber === hits.length - 1;
                return (
                  <span
                    key={hitNumber}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 border ${
                      isLatest
                        ? 'bg-slate-800 border-white/80 ring-1 ring-white/30'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    {h.midiNote !== null && <strong className="text-slate-200">{noteLabel(h.midiNote)}</strong>}
                    <span className={gradeText[grade]}>{fmtMs(h.offsetMs)}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {diagnostics && <p className="text-[11px] font-mono text-slate-500">{diagnostics}</p>}
    </div>
  );
};

const Section: FC<{ title: string; hint?: string; children: ReactNode }> = ({ title, hint, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-baseline gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
    {children}
  </section>
);

const Chip: FC<{ selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }> = ({
  selected,
  disabled,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-pressed={selected}
    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap disabled:cursor-not-allowed ${
      selected
        ? 'bg-sky-600 text-white ring-1 ring-sky-400'
        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50'
    }`}
  >
    {children}
  </button>
);

const Stat: FC<{ label: string; value: string; hint?: string; emphasis?: boolean }> = ({
  label,
  value,
  hint,
  emphasis,
}) => (
  <div
    className={`rounded-xl px-3 py-2 border ${
      emphasis ? 'bg-sky-500/10 border-sky-500/40' : 'bg-slate-950/70 border-slate-800'
    }`}
  >
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-lg font-black font-mono text-white">{value}</div>
    {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
  </div>
);
