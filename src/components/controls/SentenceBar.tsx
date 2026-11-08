import { useState, type FC, type ReactNode } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';
import { SCALE_MAP } from '../../core/constants';
import {
  CHROMATIC_FLATS,
  CHROMATIC_SHARPS,
  getDiatonicScaleSpelling,
  getDiatonicTriads,
  getParentMajorRoot,
  getScaleShortName,
  isFlatKeySignature,
  resolveRootNoteName,
} from '../../core/musicTheory';
import { CagedShapeId, PitchClass, TriadInversion } from '../../core/models';
import { Popover } from './Popover';

/**
 * Explore controls phrased as one sentence:
 *   Show [A Minor] · highlight [Dm] [1st inversion] · in [the E shape]
 * Each underlined part opens a small menu with the choices for that part.
 */

interface ModeDetail {
  id: string;
  quality: 'Major' | 'Minor' | 'Diminished';
  formula: string;
  characteristic: string;
  semitonesFromParent: number;
}

const MODES: readonly ModeDetail[] = [
  { id: 'ionian', quality: 'Major', formula: '1 2 3 4 5 6 7', characteristic: 'the major scale', semitonesFromParent: 0 },
  { id: 'dorian', quality: 'Minor', formula: '1 2 ♭3 4 5 6 ♭7', characteristic: 'minor with a bright 6', semitonesFromParent: 2 },
  { id: 'phrygian', quality: 'Minor', formula: '1 ♭2 ♭3 4 5 ♭6 ♭7', characteristic: 'minor with a dark ♭2', semitonesFromParent: 4 },
  { id: 'lydian', quality: 'Major', formula: '1 2 3 ♯4 5 6 7', characteristic: 'major with a floating ♯4', semitonesFromParent: 5 },
  { id: 'mixolydian', quality: 'Major', formula: '1 2 3 4 5 6 ♭7', characteristic: 'major with a bluesy ♭7', semitonesFromParent: 7 },
  { id: 'aeolian', quality: 'Minor', formula: '1 2 ♭3 4 5 ♭6 ♭7', characteristic: 'the natural minor scale', semitonesFromParent: 9 },
  { id: 'locrian', quality: 'Diminished', formula: '1 ♭2 ♭3 4 ♭5 ♭6 ♭7', characteristic: 'unstable, ♭2 and ♭5', semitonesFromParent: 11 },
];

const INVERSIONS: readonly { id: TriadInversion | undefined; label: string; hint: string }[] = [
  { id: undefined, label: 'All chord notes', hint: 'every chord tone across the neck' },
  { id: 'ROOT', label: 'Root position', hint: 'root in the bass' },
  { id: 'FIRST', label: '1st inversion', hint: '3rd in the bass' },
  { id: 'SECOND', label: '2nd inversion', hint: '5th in the bass' },
];

const TRIAD_STRING_SETS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [2, 3, 4],
  [3, 4, 5],
  [4, 5, 6],
];

const CAGED_SHAPES: readonly CagedShapeId[] = ['C', 'A', 'G', 'E', 'D'];

const sameStrings = (a: readonly number[], b: readonly number[]) => {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const pillClass =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const Pill: FC<{ children: ReactNode }> = ({ children }) => (
  <>
    {children}
    <span className="text-[10px] opacity-60">▾</span>
  </>
);

const toneClass = {
  scale: 'bg-sky-500/15 border-sky-500/40 text-sky-200 hover:bg-sky-500/25',
  chord: 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25',
  muted: 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700',
  area: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25',
} as const;

const MenuHeading: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{children}</div>
);

const Option: FC<{
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}> = ({ selected, onClick, children, className = '', title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={selected}
    className={`rounded-lg transition cursor-pointer ${
      selected
        ? 'bg-sky-600 text-white ring-1 ring-sky-400'
        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
    } ${className}`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

export const SentenceBar: FC = () => {
  const viewState = useFretboardStore((s) => s.viewState);
  const { scaleLayer, targetLayer, filterMask } = viewState;

  const scaleDef = SCALE_MAP[scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const spelling = getDiatonicScaleSpelling(scaleLayer.rootPitchClass, scaleDef, scaleLayer.preferFlats);
  const noteName = (pc: PitchClass) =>
    spelling[pc] ?? (scaleLayer.preferFlats ? CHROMATIC_FLATS[pc] : CHROMATIC_SHARPS[pc]);

  const triads = getDiatonicTriads(scaleLayer.rootPitchClass, scaleDef).map((t) => ({
    ...t,
    label: `${noteName(t.rootPitch)}${t.chordId === 'maj' ? '' : t.chordId === 'dim' ? '°' : 'm'}`,
  }));
  const currentTriad = triads.find(
    (t) => t.rootPitch === targetLayer.rootPitchClass && t.chordId === targetLayer.chordId
  );

  const scaleLabel = `${noteName(scaleLayer.rootPitchClass)} ${getScaleShortName(scaleDef)}`;
  const chordLabel = targetLayer.enabled && currentTriad ? currentTriad.label : 'nothing';
  const inversionLabel =
    INVERSIONS.find((i) => i.id === (targetLayer.activeInversion ?? undefined))?.label ?? 'All chord notes';
  const caged = filterMask.cagedOverlay;
  const areaLabel = caged?.enabled ? `the ${caged.shape} shape` : 'the whole neck';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-400">
      <span>Show</span>
      <Popover
        title="Change scale"
        label={<Pill>{scaleLabel}</Pill>}
        triggerClassName={`${pillClass} ${toneClass.scale}`}
        panelClassName="w-[26rem]"
      >
        {() => <ScaleMenu />}
      </Popover>

      <span className="text-slate-600">·</span>
      <span>highlight</span>
      <Popover
        title="Highlight a chord"
        label={<Pill>{chordLabel}</Pill>}
        triggerClassName={`${pillClass} ${targetLayer.enabled ? toneClass.chord : toneClass.muted}`}
        panelClassName="w-80"
      >
        {(close) => <ChordMenu triads={triads} scaleLabel={scaleLabel} onDone={close} />}
      </Popover>

      {targetLayer.enabled && (
        <Popover
          title="Show one inversion"
          label={<Pill>{inversionLabel.toLowerCase()}</Pill>}
          triggerClassName={`${pillClass} ${toneClass.chord}`}
          panelClassName="w-80"
        >
          {() => <InversionMenu />}
        </Popover>
      )}

      <span className="text-slate-600">·</span>
      <span>in</span>
      <Popover
        title="Focus on one area of the neck"
        label={<Pill>{areaLabel}</Pill>}
        triggerClassName={`${pillClass} ${caged?.enabled ? toneClass.area : toneClass.muted}`}
        panelClassName="w-72"
      >
        {() => <AreaMenu />}
      </Popover>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

const ScaleMenu: FC = () => {
  const scaleLayer = useFretboardStore((s) => s.viewState.scaleLayer);
  const setScaleLayer = useFretboardStore((s) => s.setScaleLayer);
  const setBaseScaleRoot = useFretboardStore((s) => s.setBaseScaleRoot);
  const pivotRelativeMode = useFretboardStore((s) => s.pivotRelativeMode);
  const [keep, setKeep] = useState<'notes' | 'root'>('root');

  const scaleDef = SCALE_MAP[scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const parentMajorRoot = getParentMajorRoot(scaleLayer.rootPitchClass, scaleDef);
  const parentSpelling = getDiatonicScaleSpelling(parentMajorRoot, SCALE_MAP['ionian'], scaleLayer.preferFlats);
  const rootName = (pc: PitchClass) =>
    resolveRootNoteName(pc, isFlatKeySignature(pc, scaleLayer.preferFlats));

  const selectMode = (modeId: string) =>
    keep === 'notes' ? pivotRelativeMode(modeId) : setScaleLayer({ scaleId: modeId });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between">
          <MenuHeading>Root note</MenuHeading>
          <button
            type="button"
            onClick={() => setScaleLayer({ preferFlats: !scaleLayer.preferFlats })}
            title="Spell black keys as flats or sharps"
            className="text-[11px] font-mono px-2 py-0.5 mb-1.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:text-white cursor-pointer"
          >
            {scaleLayer.preferFlats ? '♭ flats' : '♯ sharps'}
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 12 }, (_, i) => i as PitchClass).map((pc) => (
            <Option
              key={pc}
              selected={scaleLayer.rootPitchClass === pc}
              onClick={() => setBaseScaleRoot(pc)}
              className="py-1 text-xs font-mono font-bold text-center"
            >
              {rootName(pc)}
            </Option>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <MenuHeading>Mode</MenuHeading>
          <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1.5">
            <span>switching keeps</span>
            {(['root', 'notes'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKeep(k)}
                title={
                  k === 'root'
                    ? 'E.g. A Minor → A Dorian: same root, different notes'
                    : 'E.g. A Minor → C Major: same notes, new root'
                }
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  keep === k ? 'bg-sky-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                the {k}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
          {MODES.map((mode) => {
            const def = SCALE_MAP[mode.id];
            const resultingRoot =
              keep === 'notes'
                ? parentSpelling[((parentMajorRoot + mode.semitonesFromParent) % 12) as PitchClass] ?? ''
                : rootName(scaleLayer.rootPitchClass);
            return (
              <Option
                key={mode.id}
                selected={scaleLayer.scaleId === mode.id}
                onClick={() => selectMode(mode.id)}
                title={mode.formula}
                className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-left"
              >
                <span>
                  <span className="text-xs font-bold">
                    {resultingRoot} {getScaleShortName(def)}
                  </span>
                  <span className="block text-[11px] opacity-70">{mode.characteristic}</span>
                </span>
                <span className="text-[10px] font-mono opacity-60 whitespace-nowrap">{mode.formula}</span>
              </Option>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ChordMenu: FC<{
  triads: ReadonlyArray<{ rootPitch: PitchClass; chordId: string; romanNumeral: string; label: string }>;
  scaleLabel: string;
  onDone: () => void;
}> = ({ triads, scaleLabel, onDone }) => {
  const targetLayer = useFretboardStore((s) => s.viewState.targetLayer);
  const setTargetLayer = useFretboardStore((s) => s.setTargetLayer);
  const setTargetChord = useFretboardStore((s) => s.setTargetChord);

  return (
    <div className="flex flex-col gap-2">
      <Option
        selected={!targetLayer.enabled}
        onClick={() => {
          setTargetLayer({ enabled: false });
          onDone();
        }}
        className="px-3 py-1.5 text-xs font-semibold text-left"
      >
        Nothing: show the whole scale
      </Option>
      <MenuHeading>Chords in {scaleLabel}</MenuHeading>
      <div className="grid grid-cols-7 gap-1">
        {triads.map((t) => (
          <Option
            key={t.romanNumeral}
            selected={
              targetLayer.enabled &&
              targetLayer.rootPitchClass === t.rootPitch &&
              targetLayer.chordId === t.chordId
            }
            onClick={() => {
              setTargetChord(t.rootPitch, t.chordId, t.romanNumeral);
              onDone();
            }}
            className="py-1.5 flex flex-col items-center"
          >
            <span className="text-[10px] font-mono opacity-60">{t.romanNumeral}</span>
            <span className="text-xs font-bold">{t.label}</span>
          </Option>
        ))}
      </div>
    </div>
  );
};

const InversionMenu: FC = () => {
  const targetLayer = useFretboardStore((s) => s.viewState.targetLayer);
  const activeStrings = useFretboardStore((s) => s.viewState.filterMask.activeStrings);
  const setTargetLayer = useFretboardStore((s) => s.setTargetLayer);
  const setActiveStrings = useFretboardStore((s) => s.setActiveStrings);
  const activeSet = TRIAD_STRING_SETS.find((set) => sameStrings(set, activeStrings));

  // An inversion only exists on 3 adjacent strings: pick a set automatically if needed
  const selectInversion = (inversion: TriadInversion | undefined) => {
    setTargetLayer({ activeInversion: inversion });
    if (inversion && !activeSet) setActiveStrings(TRIAD_STRING_SETS[0]);
  };

  return (
    <div className="flex flex-col gap-2">
      {INVERSIONS.map((inv) => (
        <Option
          key={inv.label}
          selected={(targetLayer.activeInversion ?? undefined) === inv.id}
          onClick={() => selectInversion(inv.id)}
          className="px-3 py-1.5 flex items-baseline justify-between gap-2 text-left"
        >
          <span className="text-xs font-semibold">{inv.label}</span>
          <span className="text-[11px] opacity-60">{inv.hint}</span>
        </Option>
      ))}
      {targetLayer.activeInversion && (
        <div className="pt-2 border-t border-slate-800">
          <MenuHeading>On strings</MenuHeading>
          <div className="grid grid-cols-4 gap-1">
            {TRIAD_STRING_SETS.map((set) => (
              <Option
                key={set.join('')}
                selected={activeSet === set}
                onClick={() => setActiveStrings(set)}
                className="py-1 text-[11px] font-mono text-center"
              >
                {set.join('-')}
              </Option>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AreaMenu: FC = () => {
  const caged = useFretboardStore((s) => s.viewState.filterMask.cagedOverlay);
  const chordShown = useFretboardStore((s) => s.viewState.targetLayer.enabled);
  const setCagedOverlay = useFretboardStore((s) => s.setCagedOverlay);
  const setCagedShape = useFretboardStore((s) => s.setCagedShape);

  const referenceRoot = caged?.referenceRoot ?? 'TARGET_ROOT';
  const effectiveReference = chordShown ? referenceRoot : 'SCALE_ROOT';

  return (
    <div className="flex flex-col gap-3">
      <Option
        selected={!caged?.enabled}
        onClick={() => caged && setCagedOverlay({ ...caged, enabled: false })}
        className="px-3 py-1.5 text-xs font-semibold text-left"
      >
        The whole neck
      </Option>

      <div>
        <MenuHeading>One CAGED shape</MenuHeading>
        <div className="grid grid-cols-5 gap-1">
          {CAGED_SHAPES.map((shape) => (
            <Option
              key={shape}
              selected={!!caged?.enabled && caged.shape === shape}
              onClick={() => setCagedShape(shape)}
              className="py-1.5 text-sm font-black text-center"
            >
              {shape}
            </Option>
          ))}
        </div>
      </div>

      {chordShown && (
        <div>
          <MenuHeading>Shape built around</MenuHeading>
          <div className="grid grid-cols-2 gap-1">
            {(['SCALE_ROOT', 'TARGET_ROOT'] as const).map((ref) => (
              <Option
                key={ref}
                selected={effectiveReference === ref}
                onClick={() =>
                  setCagedOverlay({
                    enabled: caged?.enabled ?? true,
                    shape: caged?.shape ?? 'E',
                    referenceRoot: ref,
                  })
                }
                className="py-1 text-xs text-center"
              >
                {ref === 'SCALE_ROOT' ? 'the scale root' : 'the chord root'}
              </Option>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
