import { useState, type FC } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';
import { SCALE_MAP } from '../../core/constants';
import {
  CHROMATIC_FLATS,
  CHROMATIC_SHARPS,
  getDiatonicScaleSpelling,
  getDiatonicTriads,
  getParentMajorRoot,
  isFlatKeySignature,
  resolveRootNoteName,
} from '../../core/musicTheory';
import { CagedShapeId, PitchClass, TriadInversion } from '../../core/models';

const CAGED_SHAPES: readonly CagedShapeId[] = ['C', 'A', 'G', 'E', 'D'];

const ZOOM_PRESETS: readonly { label: string; window?: { minFret: number; maxFret: number } }[] = [
  { label: 'Full Neck', window: undefined },
  { label: 'Frets 0-5', window: { minFret: 0, maxFret: 5 } },
  { label: 'Frets 5-9', window: { minFret: 5, maxFret: 9 } },
  { label: 'Frets 8-12', window: { minFret: 8, maxFret: 12 } },
  { label: 'Frets 12-16', window: { minFret: 12, maxFret: 16 } },
];

interface ModeDetail {
  id: string;
  name: string;
  roman: string;
  quality: 'Major' | 'Minor' | 'Diminished';
  formula: string;
  characteristic: string;
  semitonesFromParent: number;
}

const DETAILED_MODES: readonly ModeDetail[] = [
  { id: 'ionian', name: 'Ionian', roman: 'I', quality: 'Major', formula: '1 2 3 4 5 6 7', characteristic: 'Natural Major', semitonesFromParent: 0 },
  { id: 'dorian', name: 'Dorian', roman: 'ii', quality: 'Minor', formula: '1 2 ♭3 4 5 6 ♭7', characteristic: 'Minor + ♮6', semitonesFromParent: 2 },
  { id: 'phrygian', name: 'Phrygian', roman: 'iii', quality: 'Minor', formula: '1 ♭2 ♭3 4 5 ♭6 ♭7', characteristic: 'Minor + ♭2', semitonesFromParent: 4 },
  { id: 'lydian', name: 'Lydian', roman: 'IV', quality: 'Major', formula: '1 2 3 ♯4 5 6 7', characteristic: 'Major + ♯4', semitonesFromParent: 5 },
  { id: 'mixolydian', name: 'Mixolydian', roman: 'V', quality: 'Major', formula: '1 2 3 4 5 6 ♭7', characteristic: 'Dominant (♭7)', semitonesFromParent: 7 },
  { id: 'aeolian', name: 'Aeolian', roman: 'vi', quality: 'Minor', formula: '1 2 ♭3 4 5 ♭6 ♭7', characteristic: 'Natural Minor', semitonesFromParent: 9 },
  { id: 'locrian', name: 'Locrian', roman: 'vii°', quality: 'Diminished', formula: '1 ♭2 ♭3 4 ♭5 ♭6 ♭7', characteristic: 'Half-Dim (♭2, ♭5)', semitonesFromParent: 11 },
];

export const LayerControlPanel: FC = () => {
  const viewState = useFretboardStore((s) => s.viewState);
  const viewWindow = useFretboardStore((s) => s.viewWindow);
  const setScaleLayer = useFretboardStore((s) => s.setScaleLayer);
  const setBaseScaleRoot = useFretboardStore((s) => s.setBaseScaleRoot);
  const setTargetLayer = useFretboardStore((s) => s.setTargetLayer);
  const setCagedShape = useFretboardStore((s) => s.setCagedShape);
  const setCagedOverlay = useFretboardStore((s) => s.setCagedOverlay);
  const setViewWindow = useFretboardStore((s) => s.setViewWindow);
  const setTargetChord = useFretboardStore((s) => s.setTargetChord);
  const pivotRelativeMode = useFretboardStore((s) => s.pivotRelativeMode);

  const [modeShiftType, setModeShiftType] = useState<'relative' | 'parallel'>('relative');

  const { scaleLayer, targetLayer, filterMask } = viewState;
  const caged = filterMask.cagedOverlay;
  const isMoreThanThreeStrings = filterMask.activeStrings.length > 3;

  // Active scale definition & parent major key
  const activeScaleDef = SCALE_MAP[scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const parentMajorRoot = getParentMajorRoot(scaleLayer.rootPitchClass, activeScaleDef);

  // Spelling map for parent major scale (to show degree note names)
  const parentIonianSpelling = getDiatonicScaleSpelling(
    parentMajorRoot,
    SCALE_MAP['ionian'],
    scaleLayer.preferFlats
  );

  // Active scale note spelling
  const activeScaleSpelling = getDiatonicScaleSpelling(
    scaleLayer.rootPitchClass,
    activeScaleDef,
    scaleLayer.preferFlats
  );

  const getNoteName = (pitch: PitchClass) => {
    return activeScaleSpelling[pitch] ?? (scaleLayer.preferFlats ? CHROMATIC_FLATS[pitch] : CHROMATIC_SHARPS[pitch]);
  };

  const handleSelectMode = (modeId: string) => {
    if (modeShiftType === 'relative') {
      pivotRelativeMode(modeId);
    } else {
      setScaleLayer({ scaleId: modeId });
    }
  };

  // Compute 7 Diatonic Triads of the active scale
  const diatonicTriads = getDiatonicTriads(scaleLayer.rootPitchClass, activeScaleDef).map((dt) => {
    const chordNoteName = getNoteName(dt.rootPitch);
    const chordLabel = `${chordNoteName}${dt.chordId === 'maj' ? '' : dt.chordId === 'dim' ? '°' : 'm'}`;
    return {
      ...dt,
      label: chordLabel,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* 1. Base Scale Layer & Detailed Diatonic Modes (Wider: 5 cols) */}
      <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              1. Base Layer (Key & Diatonic Mode)
            </h3>
            <button
              onClick={() => setScaleLayer({ preferFlats: !scaleLayer.preferFlats })}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
            >
              {scaleLayer.preferFlats ? '♭ Flats' : '♯ Sharps'}
            </button>
          </div>

          {/* Root Pitch Picker */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Root Note:
              </label>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-6 gap-1">
              {(Array.from({ length: 12 }, (_, i) => i as PitchClass)).map((pc) => {
                const name = resolveRootNoteName(pc, isFlatKeySignature(pc, scaleLayer.preferFlats));
                const isSelected = scaleLayer.rootPitchClass === pc;
                return (
                  <button
                    key={pc}
                    onClick={() => setBaseScaleRoot(pc)}
                    className={`py-1 text-xs font-mono font-bold rounded-md transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-white shadow ring-1 ring-sky-300'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Switching Type: Relative vs Parallel */}
          <div className="mb-2 flex items-center justify-between bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/60">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-1">
              Mode Shift:
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setModeShiftType('relative')}
                title="Pivots root to stay in the same parent key notes"
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                  modeShiftType === 'relative'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Relative (Keep Parent Key)
              </button>
              <button
                onClick={() => setModeShiftType('parallel')}
                title="Keeps the root note and changes scale formula"
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                  modeShiftType === 'parallel'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Parallel (Keep Root)
              </button>
            </div>
          </div>

          {/* Detailed Diatonic Mode Cards */}
          <div>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {DETAILED_MODES.map((mode) => {
                const isSelected = scaleLayer.scaleId === mode.id;
                const relativePitch = ((parentMajorRoot + mode.semitonesFromParent) % 12) as PitchClass;
                const relativeNoteName = parentIonianSpelling[relativePitch] ?? '';

                return (
                  <button
                    key={mode.id}
                    onClick={() => handleSelectMode(mode.id)}
                    className={`w-full p-2 rounded-xl text-left transition cursor-pointer flex items-center justify-between border ${
                      isSelected
                        ? 'bg-sky-950/60 border-sky-500/80 text-white ring-1 ring-sky-500/30'
                        : 'bg-slate-800/50 border-slate-800/80 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold w-6 text-center text-sky-400">
                        {mode.roman}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-100">{mode.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              mode.quality === 'Major'
                                ? 'bg-amber-500/20 text-amber-300'
                                : mode.quality === 'Minor'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {mode.quality}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {mode.characteristic} • {mode.formula}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-black text-sky-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {modeShiftType === 'relative' ? relativeNoteName : resolveRootNoteName(scaleLayer.rootPitchClass, isFlatKeySignature(scaleLayer.rootPitchClass, scaleLayer.preferFlats))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Target Layer (Arpeggio / Triad) (4 cols) */}
      <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              2. Target Layer (Triad / Arpeggio)
            </h3>
            <button
              onClick={() => setTargetLayer({ enabled: !targetLayer.enabled })}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                targetLayer.enabled
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {targetLayer.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* Diatonic Chord Shortcuts */}
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Diatonic Triads in {getNoteName(scaleLayer.rootPitchClass)} {activeScaleDef.name.split(' ')[0]}:
            </label>
            <div className="grid grid-cols-7 gap-1">
              {diatonicTriads.map((dt) => {
                const isSelected =
                  targetLayer.enabled &&
                  targetLayer.rootPitchClass === dt.rootPitch &&
                  targetLayer.chordId === dt.chordId;

                return (
                  <button
                    key={dt.romanNumeral}
                    onClick={() => setTargetChord(dt.rootPitch, dt.chordId, dt.romanNumeral)}
                    className={`flex flex-col items-center py-2 rounded-lg transition cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow ring-1 ring-rose-400 scale-[1.02]'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-slate-400 font-semibold">{dt.romanNumeral}</span>
                    <span className="text-xs font-bold mt-0.5">{dt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inversion Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Triad Inversion Focus:
              </label>
              {targetLayer.activeInversion && !isMoreThanThreeStrings && (
                <button
                  onClick={() => setTargetLayer({ activeInversion: undefined })}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Clear Focus
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'ROOT', label: 'Root Pos' },
                  { id: 'FIRST', label: '1st Inv' },
                  { id: 'SECOND', label: '2nd Inv' },
                ] as const
              ).map((inv) => {
                const isSelected = !isMoreThanThreeStrings && targetLayer.activeInversion === inv.id;
                return (
                  <button
                    key={inv.id}
                    disabled={isMoreThanThreeStrings}
                    title={
                      isMoreThanThreeStrings
                        ? 'Select 3 strings to focus triad inversions'
                        : `Focus ${inv.label}`
                    }
                    onClick={() =>
                      setTargetLayer({
                        activeInversion: isSelected ? undefined : (inv.id as TriadInversion),
                      })
                    }
                    className={`py-1.5 text-xs rounded-lg font-medium transition text-center select-none ${
                      isMoreThanThreeStrings
                        ? 'bg-slate-900/60 text-slate-600 border border-slate-800/80 cursor-not-allowed opacity-50'
                        : isSelected
                        ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400/30 font-bold cursor-pointer'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    {inv.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">
              {isMoreThanThreeStrings
                ? 'Select 3 strings to enable 3-string triad inversion focus'
                : targetLayer.activeInversion
                ? 'Highlights the isolated 3-note inversion on active strings (span ≤ 4)'
                : 'No inversion focus: showing all target triad chord tones across the board'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Geometric Stencil (CAGED) & Zoom (3 cols) */}
      <div className="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              3. CAGED Stencil & Zoom
            </h3>
            <button
              onClick={() =>
                setCagedOverlay(
                  caged
                    ? { ...caged, enabled: !caged.enabled }
                    : { enabled: true, shape: 'E', referenceRoot: 'TARGET_ROOT' }
                )
              }
              className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                caged?.enabled
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {caged?.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* CAGED Shape Picker */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Shape:
              </label>
              <div className="flex items-center gap-1">
                {(['SCALE_ROOT', 'TARGET_ROOT'] as const).map((ref) => (
                  <button
                    key={ref}
                    onClick={() =>
                      setCagedOverlay(
                        caged
                          ? { ...caged, referenceRoot: ref }
                          : { enabled: true, shape: 'E', referenceRoot: ref }
                      )
                    }
                    className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                      caged?.referenceRoot === ref
                        ? 'bg-sky-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {ref === 'SCALE_ROOT' ? 'Scale Root' : 'Target Root'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {CAGED_SHAPES.map((shape) => {
                const isSelected = caged?.enabled && caged?.shape === shape;
                return (
                  <button
                    key={shape}
                    onClick={() => setCagedShape(shape)}
                    className={`py-2 text-xs font-black rounded-lg transition cursor-pointer text-center ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-300 scale-[1.03]'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {shape}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Fret Window Zoom */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Viewport Zoom:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {ZOOM_PRESETS.map((preset) => {
                const isActive =
                  (!viewWindow && !preset.window) ||
                  (viewWindow &&
                    preset.window &&
                    viewWindow.minFret === preset.window.minFret &&
                    viewWindow.maxFret === preset.window.maxFret);

                return (
                  <button
                    key={preset.label}
                    onClick={() => setViewWindow(preset.window)}
                    className={`py-1 text-[11px] rounded-lg font-medium truncate transition cursor-pointer text-center ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/30 font-semibold'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
