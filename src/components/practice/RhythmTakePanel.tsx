import { useEffect, useState, type FC, type ReactNode } from 'react';
import { getRhythmClockNow, usePracticeStore } from '../../store/usePracticeStore';
import { gradeOffset, gridInterval } from '../../core/rhythm/rhythmMath';
import { PASS_NOTE_ACCURACY, PASS_WITHIN_50, type NoteOutcome } from '../../core/rhythm/takeScoring';
import { CHROMATIC_SHARPS, midiToOctave, midiToPitchClass } from '../../core/musicTheory';

const fmtMs = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms)} ms`;
const noteLabel = (midi: number) => `${CHROMATIC_SHARPS[midiToPitchClass(midi)]}${midiToOctave(midi)}`;

/** Live take status (count-in, beat, progress) and, once it's over, the results. */
export const RhythmTakePanel: FC<{ onOpenTuner?: () => void }> = ({ onOpenTuner }) => {
  const phase = usePracticeStore((s) => s.engine.phase);
  const spec = usePracticeStore((s) => s.engine.currentChallenge?.rhythm);
  const take = usePracticeStore((s) => s.rhythmTake);
  const cursor = usePracticeStore((s) => s.rhythmCursor);
  const live = usePracticeStore((s) => s.liveEvaluation?.rhythmScore);
  const result = usePracticeStore((s) => s.evaluation?.rhythmScore);
  const togglePause = usePracticeStore((s) => s.togglePause);
  const beat = useBeat(phase === 'PROMPTING' && take?.status === 'RUNNING');

  if (!spec || !take) return null;

  const uncalibrated = !take.calibrated && (
    <p className="text-[11px] text-amber-300/90">
      This input isn't calibrated, so timings include your system's delay.{' '}
      {onOpenTuner && (
        <button onClick={onOpenTuner} className="underline hover:text-amber-200 cursor-pointer">
          Calibrate
        </button>
      )}
    </p>
  );

  if (phase === 'REVEALING' && result) {
    const timing = result.timing;
    const total = spec.expected.length;
    return (
      <div className="mt-4 flex flex-col items-center gap-3">
        <span
          className={`px-3.5 py-1 rounded-full text-xs font-bold border ${
            result.passed
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {result.passed
            ? '🎉 Clean take!'
            : `To pass: ${Math.round(PASS_NOTE_ACCURACY * 100)}% right notes and ${Math.round(
                PASS_WITHIN_50 * 100
              )}% within ±50 ms`}
        </span>

        {/* What decides the take */}
        <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
          <Tile
            label="Right notes"
            value={`${result.rightNotes}/${total}`}
            sub={`${Math.round(result.noteAccuracy * 100)}% · need ${Math.round(PASS_NOTE_ACCURACY * 100)}%`}
            status={result.noteAccuracy >= PASS_NOTE_ACCURACY ? 'pass' : 'fail'}
          />
          <Tile
            label="Within ±50 ms"
            value={timing ? `${Math.round(timing.within50 * 100)}%` : '-'}
            sub={`need ${Math.round(PASS_WITHIN_50 * 100)}%`}
            status={(timing?.within50 ?? 0) >= PASS_WITHIN_50 ? 'pass' : 'fail'}
          />
        </div>

        {/* More about the timing */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
          <Tile
            compact
            label="On average"
            value={timing ? fmtMs(timing.meanMs) : '-'}
            sub={timing ? (Math.abs(timing.meanMs) < 5 ? 'centred' : timing.meanMs < 0 ? 'rushing' : 'dragging') : undefined}
          />
          <Tile compact label="Spread" value={timing ? `±${Math.round(timing.spreadMs)} ms` : '-'} />
          <Tile compact label="Within ±25 ms" value={timing ? `${Math.round(timing.within25 * 100)}%` : '-'} />
        </div>

        <OutcomeStrip outcomes={result.outcomes} expectedMidis={spec.expected.map((e) => e.midi)} />

        <div className="flex flex-wrap justify-center gap-2 text-[11px] font-mono">
          {result.wrongNotes > 0 && <Badge tone="rose">✕ {result.wrongNotes} wrong note{result.wrongNotes > 1 ? 's' : ''}</Badge>}
          {result.missed > 0 && <Badge tone="amber">! {result.missed} missed</Badge>}
          {result.extras > 0 && <Badge tone="slate">+ {result.extras} extra</Badge>}
        </div>
        {uncalibrated}
      </div>
    );
  }

  if (phase === 'REVEALING' || phase === 'IDLE') return null;

  if (take.status === 'ERROR') {
    return (
      <div className="mt-3 flex flex-col items-center gap-2 text-xs text-rose-300">
        <span>{take.error}</span>
        <button onClick={togglePause} className="underline hover:text-rose-200 cursor-pointer">
          Try again
        </button>
      </div>
    );
  }

  if (take.status === 'OPENING_MIC') {
    return <p className="mt-3 text-xs font-mono text-amber-300">Waiting for the microphone...</p>;
  }

  const isCountIn = beat !== null && beat.slot < 0;
  const played = (live?.rightNotes ?? 0) + (live?.wrongNotes ?? 0);
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: spec.countInBeats }, (_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full border transition-colors duration-75 ${
                beat?.beatInBar === i
                  ? isCountIn
                    ? 'bg-sky-400 border-sky-200'
                    : i === 0
                    ? 'bg-rose-500 border-rose-200'
                    : 'bg-amber-400 border-amber-100'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-mono text-slate-300">
          {phase === 'PAUSED'
            ? 'paused (resume starts the take over)'
            : isCountIn || beat === null
            ? `count-in... ${beat ? spec.countInBeats + Math.floor(beat.slot / spec.subdivision) + 1 : ''}`
            : `note ${Math.min(cursor + 1, spec.expected.length)} of ${spec.expected.length}`}
        </span>
      </div>
      {played > 0 && (
        <div className="flex gap-2 text-[11px] font-mono">
          <Badge tone="emerald">✓ {live?.rightNotes ?? 0}</Badge>
          {(live?.wrongNotes ?? 0) > 0 && <Badge tone="rose">✕ {live?.wrongNotes}</Badge>}
          {live?.timing && <Badge tone="slate">avg {fmtMs(live.timing.meanMs)}</Badge>}
        </div>
      )}
      {uncalibrated}
    </div>
  );
};

/** Which slot the click is on, following the audio clock (not the 50 ms drill timer). */
function useBeat(active: boolean): { slot: number; beatInBar: number } | null {
  const grid = usePracticeStore((s) => s.rhythmTake?.grid);
  const spec = usePracticeStore((s) => s.engine.currentChallenge?.rhythm);
  const [beat, setBeat] = useState<{ slot: number; beatInBar: number } | null>(null);

  useEffect(() => {
    if (!active || !grid || !spec) {
      setBeat(null);
      return;
    }
    let raf = 0;
    const interval = gridInterval(spec);
    const tick = () => {
      const elapsed = getRhythmClockNow() - grid.startTime;
      const slot = Math.floor(elapsed / interval + 1e-6);
      const countInSlots = spec.countInBeats * spec.subdivision;
      if (slot < -countInSlots) {
        setBeat(null);
      } else {
        const slotsPerBar = spec.countInBeats * spec.subdivision;
        const inBar = ((slot % slotsPerBar) + slotsPerBar) % slotsPerBar;
        const beatInBar = Math.floor(inBar / spec.subdivision);
        setBeat((prev) => (prev?.slot === slot ? prev : { slot, beatInBar }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, grid, spec]);

  return beat;
}

/** Every planned note in order: colour = how it went; hover for details. */
const OutcomeStrip: FC<{ outcomes: readonly NoteOutcome[]; expectedMidis: readonly number[] }> = ({
  outcomes,
  expectedMidis,
}) => {
  // Up and back down share the top note: gap right after it
  const firstDown = Math.floor(outcomes.length / 2) + 1;
  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="flex flex-wrap justify-center gap-[3px]">
        {outcomes.map((o, i) => {
          const look =
            o.status === 'MISSED'
              ? 'bg-transparent border border-dashed border-slate-500'
              : o.status === 'WRONG_NOTE'
              ? 'bg-rose-600 ring-1 ring-rose-300 text-white'
              : gradeOffset(o.offsetMs) === 'tight'
              ? 'bg-emerald-400'
              : gradeOffset(o.offsetMs) === 'ok'
              ? 'bg-yellow-300'
              : 'bg-orange-500';
          const detail =
            o.status === 'MISSED'
              ? 'missed'
              : o.status === 'WRONG_NOTE'
              ? `played ${o.playedMidi !== null ? noteLabel(o.playedMidi) : '?'}, ${fmtMs(o.offsetMs)}`
              : fmtMs(o.offsetMs);
          return (
            <span
              key={i}
              title={`${i + 1}. ${noteLabel(expectedMidis[i])}: ${detail}`}
              className={`w-3 h-5 rounded-sm flex items-center justify-center text-[8px] font-black leading-none ${look} ${
                i === firstDown ? 'ml-1.5' : ''
              }`}
            >
              {o.status === 'WRONG_NOTE' ? '✕' : null}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-3 text-[10px] text-slate-500">
        <span><i className="inline-block w-2 h-2 rounded-sm bg-emerald-400 mr-1" />within ±25 ms</span>
        <span><i className="inline-block w-2 h-2 rounded-sm bg-yellow-300 mr-1" />±50 ms</span>
        <span><i className="inline-block w-2 h-2 rounded-sm bg-orange-500 mr-1" />further off</span>
        <span className="flex items-center">
          <i className="inline-flex w-2.5 h-3 rounded-sm bg-rose-600 ring-1 ring-rose-300 mr-1 items-center justify-center text-[7px] not-italic font-black text-white leading-none">✕</i>
          wrong note
        </span>
        <span className="flex items-center">
          <i className="inline-block w-2 h-3 rounded-sm border border-dashed border-slate-500 mr-1" />
          missed
        </span>
        <span>· up | down</span>
      </div>
    </div>
  );
};

/** `status` marks the tiles that decide whether the take passes */
const Tile: FC<{
  label: string;
  value: string;
  sub?: string;
  status?: 'pass' | 'fail';
  /** Smaller and quieter: supporting information */
  compact?: boolean;
}> = ({ label, value, sub, status, compact = false }) => (
  <div
    className={`rounded-xl border text-left ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} ${
      status === 'pass'
        ? 'bg-emerald-500/15 border-emerald-500/60'
        : status === 'fail'
        ? 'bg-rose-500/15 border-rose-500/60'
        : 'bg-slate-950/70 border-slate-800'
    }`}
  >
    <div
      className={`text-[10px] uppercase tracking-wider flex items-center gap-1 ${
        status === 'pass' ? 'text-emerald-300' : status === 'fail' ? 'text-rose-300' : 'text-slate-500'
      }`}
    >
      {status && <span aria-hidden="true">{status === 'pass' ? '✓' : '✕'}</span>}
      {label}
    </div>
    <div className={`font-black font-mono ${compact ? 'text-sm text-slate-200' : 'text-lg text-white'}`}>
      {value}
    </div>
    {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
  </div>
);

const badgeTone = {
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  slate: 'bg-slate-900 text-slate-300 border-slate-700',
} as const;

const Badge: FC<{ tone: keyof typeof badgeTone; children: ReactNode }> = ({ tone, children }) => (
  <span className={`px-2.5 py-0.5 rounded-lg border font-semibold ${badgeTone[tone]}`}>{children}</span>
);
