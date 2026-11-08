import { useState, type FC, type ReactNode } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { DrillConfig, PitchClass, TriadInversion } from '../../core/models';
import { DIATONIC_MODES, SCALE_MAP } from '../../core/constants';
import {
  getScaleShortName,
  isFlatKeySignature,
  resolveRootNoteName,
} from '../../core/musicTheory';

/**
 * Building blocks for drill settings, shared by the setup screen and the in-drill
 * settings dialog so both always offer the same options with the same wording.
 */

const STRING_SETS: readonly { label: string; strings: readonly number[] }[] = [
  { label: '1-2-3 (high)', strings: [1, 2, 3] },
  { label: '2-3-4', strings: [2, 3, 4] },
  { label: '3-4-5', strings: [3, 4, 5] },
  { label: '4-5-6 (low)', strings: [4, 5, 6] },
];

const INVERSIONS: readonly { id: TriadInversion; label: string; short: string }[] = [
  { id: 'ROOT', label: 'Root position', short: 'root pos' },
  { id: 'FIRST', label: '1st inversion', short: '1st inv' },
  { id: 'SECOND', label: '2nd inversion', short: '2nd inv' },
];

const THINK_PRESETS = [60, 45, 30] as const;
const THINK_CUSTOM_RANGE = { min: 3, max: 120 };

const REVEAL_PRESETS = [2, 4, 6, 10] as const;

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------------------
// Small UI primitives
// ---------------------------------------------------------------------------

export const SettingsSection: FC<{ title: string; hint?: string; children: ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-baseline gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
    {children}
  </section>
);

const Chip: FC<{
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}> = ({ selected, onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    aria-pressed={selected}
    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
      selected
        ? 'bg-sky-600 text-white ring-1 ring-sky-400'
        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

const selectClass =
  'bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500';

// ---------------------------------------------------------------------------
// Drill type
// ---------------------------------------------------------------------------

const DRILL_TYPES: readonly {
  id: DrillConfig['exerciseType'];
  title: string;
  description: string;
}[] = [
  {
    id: 'TRIAD_INVERSION_HUNTER',
    title: 'Find one inversion',
    description: 'You get a chord and an inversion, e.g. “Dm, 1st inversion”. Find it on the given strings.',
  },
  {
    id: 'TRIAD_ALL_INVERSIONS',
    title: 'Find all three inversions',
    description: 'You get a chord. Find root position, 1st and 2nd inversion on the given strings.',
  },
];

export const DrillTypePicker: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const exerciseType = usePracticeStore((s) => s.config.exerciseType);
  const updateConfig = usePracticeStore((s) => s.updateConfig);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {DRILL_TYPES.map((d) => (
          <Chip
            key={d.id}
            selected={exerciseType === d.id}
            onClick={() => updateConfig({ exerciseType: d.id })}
            title={d.description}
          >
            {d.title}
          </Chip>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {DRILL_TYPES.map((d) => {
        const selected = exerciseType === d.id;
        return (
          <button
            key={d.id}
            onClick={() => updateConfig({ exerciseType: d.id })}
            aria-pressed={selected}
            className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
              selected
                ? 'bg-rose-600/20 border-rose-500/60 ring-1 ring-rose-500/40'
                : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
            }`}
          >
            <span className={`font-bold text-sm ${selected ? 'text-white' : 'text-slate-300'}`}>
              {d.title}
            </span>
            <span className="text-xs text-slate-400 leading-relaxed">{d.description}</span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

export const KeyPicker: FC = () => {
  const scaleContext = usePracticeStore((s) => s.config.scaleContext);
  const updateConfig = usePracticeStore((s) => s.updateConfig);
  const update = (patch: Partial<DrillConfig['scaleContext']>) =>
    updateConfig({ scaleContext: { ...scaleContext, ...patch } });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Root note"
        value={scaleContext.rootPitchClass}
        onChange={(e) => update({ rootPitchClass: Number(e.target.value) as PitchClass })}
        className={selectClass}
      >
        {Array.from({ length: 12 }, (_, pc) => (
          <option key={pc} value={pc}>
            {resolveRootNoteName(pc as PitchClass, isFlatKeySignature(pc as PitchClass, scaleContext.preferFlats))}
          </option>
        ))}
      </select>
      <select
        aria-label="Mode"
        value={scaleContext.scaleId}
        onChange={(e) => update({ scaleId: e.target.value })}
        className={selectClass}
      >
        {DIATONIC_MODES.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {getScaleShortName(mode)}
          </option>
        ))}
      </select>
      <button
        onClick={() => update({ preferFlats: !scaleContext.preferFlats })}
        title="Spell black keys as flats or sharps"
        className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:text-white cursor-pointer"
      >
        {scaleContext.preferFlats ? '♭ flats' : '♯ sharps'}
      </button>
      <span className="text-[11px] text-slate-500">Chords are taken from this key.</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Time to find it
// ---------------------------------------------------------------------------

export const ThinkTimePicker: FC = () => {
  const promptDurationMs = usePracticeStore((s) => s.config.promptDurationMs);
  const updateConfig = usePracticeStore((s) => s.updateConfig);
  const seconds = Math.round(promptDurationMs / 1000);
  const [isCustom, setIsCustom] = useState(
    !THINK_PRESETS.some((preset) => preset === seconds)
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {THINK_PRESETS.map((preset) => (
          <Chip
            key={preset}
            selected={!isCustom && seconds === preset}
            onClick={() => {
              setIsCustom(false);
              updateConfig({ promptDurationMs: preset * 1000 });
            }}
          >
            {preset}s
          </Chip>
        ))}
        <Chip selected={isCustom} onClick={() => setIsCustom(true)}>
          Custom{isCustom ? ` · ${seconds}s` : ''}
        </Chip>
      </div>
      {isCustom && (
        <input
          type="range"
          min={THINK_CUSTOM_RANGE.min}
          max={THINK_CUSTOM_RANGE.max}
          step={1}
          value={seconds}
          aria-label="Time to find it in seconds"
          onChange={(e) => updateConfig({ promptDurationMs: Number(e.target.value) * 1000 })}
          className="w-full max-w-md accent-amber-500 cursor-pointer"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Everything else ("Customize")
// ---------------------------------------------------------------------------

export const DrillOptions: FC = () => {
  const config = usePracticeStore((s) => s.config);
  const updateConfig = usePracticeStore((s) => s.updateConfig);
  const revealSeconds = Math.round(config.revealDurationMs / 1000);

  const toggleStringSet = (set: readonly number[]) => {
    const exists = config.stringSets.some((s) => sameSet(s, set));
    if (exists) {
      if (config.stringSets.length <= 1) return; // keep at least one
      updateConfig({ stringSets: config.stringSets.filter((s) => !sameSet(s, set)) });
    } else {
      updateConfig({ stringSets: [...config.stringSets, set] });
    }
  };

  const toggleInversion = (inv: TriadInversion) => {
    if (config.inversions.includes(inv)) {
      if (config.inversions.length <= 1) return;
      updateConfig({ inversions: config.inversions.filter((i) => i !== inv) });
    } else {
      updateConfig({ inversions: [...config.inversions, inv] });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {config.exerciseType !== 'TRIAD_ALL_INVERSIONS' && (
        <SettingsSection title="Inversions" hint="picked at random from these">
          <div className="flex flex-wrap gap-2">
            {INVERSIONS.map((inv) => (
              <Chip
                key={inv.id}
                selected={config.inversions.includes(inv.id)}
                onClick={() => toggleInversion(inv.id)}
              >
                {inv.label}
              </Chip>
            ))}
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Strings" hint="picked at random from these">
        <div className="flex flex-wrap gap-2">
          {STRING_SETS.map((set) => (
            <Chip
              key={set.label}
              selected={config.stringSets.some((s) => sameSet(s, set.strings))}
              onClick={() => toggleStringSet(set.strings)}
            >
              {set.label}
            </Chip>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="After each challenge">
        <div className="flex flex-wrap gap-2">
          <Chip selected={config.autoAdvance} onClick={() => updateConfig({ autoAdvance: true })}>
            Continue automatically
          </Chip>
          <Chip selected={!config.autoAdvance} onClick={() => updateConfig({ autoAdvance: false })}>
            I grade myself
          </Chip>
        </div>
        {config.autoAdvance ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400">Show the solution for</span>
            {REVEAL_PRESETS.map((s) => (
              <Chip
                key={s}
                selected={revealSeconds === s}
                onClick={() => updateConfig({ revealDurationMs: s * 1000 })}
              >
                {s}s
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            The solution stays until you press Got it or Missed.
          </p>
        )}
      </SettingsSection>

      <SettingsSection title="Sound">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-slate-300">Drone on the key’s root note</span>
          <input
            type="checkbox"
            checked={config.playDrone}
            onChange={(e) => updateConfig({ playDrone: e.target.checked })}
            className="accent-sky-500 w-4 h-4 cursor-pointer"
          />
        </label>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-slate-300">Play the solution when it’s shown</span>
          <input
            type="checkbox"
            checked={config.playSolutionAudioOnReveal}
            onChange={(e) => updateConfig({ playSolutionAudioOnReveal: e.target.checked })}
            className="accent-sky-500 w-4 h-4 cursor-pointer"
          />
        </label>
      </SettingsSection>
    </div>
  );
};

/** One-line description of the settings behind "Customize" (the collapsed setup summary). */
export function summarizeDrillOptions(config: DrillConfig): string[] {
  const strings = config.stringSets.map((s) => s.join('-')).join(', ');
  const inversions =
    config.exerciseType === 'TRIAD_ALL_INVERSIONS' || config.inversions.length === 3
      ? 'all inversions'
      : INVERSIONS.filter((i) => config.inversions.includes(i.id))
          .map((i) => i.short)
          .join(' & ');
  const after = config.autoAdvance
    ? `next after ${Math.round(config.revealDurationMs / 1000)}s`
    : 'self-graded';

  return [
    `strings ${strings}`,
    inversions,
    after,
    config.playDrone ? 'drone on' : 'drone off',
  ];
}

export function describeKey(scaleContext: DrillConfig['scaleContext']): string {
  const scaleDef = SCALE_MAP[scaleContext.scaleId] ?? SCALE_MAP['ionian'];
  const root = resolveRootNoteName(
    scaleContext.rootPitchClass,
    isFlatKeySignature(scaleContext.rootPitchClass, scaleContext.preferFlats)
  );
  return `${root} ${getScaleShortName(scaleDef)}`;
}
