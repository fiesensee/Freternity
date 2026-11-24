import { useMemo, type FC } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';
import { GUITAR_6_STANDARD } from '../../core/constants';
import { PitchClass } from '../../core/models';
import {
  getChromaticNoteName,
  findMatchingScales,
  getScaleShortName,
  midiToPitchClass,
  type ScaleMatch,
} from '../../core/musicTheory';

export interface ScaleFinderResult {
  exact: readonly ScaleMatch[];
  containing: readonly ScaleMatch[];
  pitchClasses: readonly PitchClass[];
}

/**
 * Pure helper to derive unique pitch classes from selected fretboard positions
 * and group matching scales into exact matches vs containing scales.
 */
export function computeScaleFinderResults(
  positions: readonly { stringIndex: number; fret: number }[],
  tuningMidi: readonly number[] = GUITAR_6_STANDARD.tuningMidi
): ScaleFinderResult {
  const seen = new Set<PitchClass>();
  const pitchClasses: PitchClass[] = [];

  for (const pos of positions) {
    const openMidi = tuningMidi[pos.stringIndex - 1];
    if (openMidi === undefined) continue;
    const pc = midiToPitchClass(openMidi + pos.fret);
    if (!seen.has(pc)) {
      seen.add(pc);
      pitchClasses.push(pc);
    }
  }

  const allMatches = findMatchingScales(pitchClasses);
  return {
    exact: allMatches.filter((m) => m.isExact),
    containing: allMatches.filter((m) => !m.isExact),
    pitchClasses,
  };
}

export const ScaleFinderPanel: FC = () => {
  const scaleFinderActive = useFretboardStore((s) => s.scaleFinderActive);
  const scaleFinderPositions = useFretboardStore((s) => s.scaleFinderPositions);
  const scaleLayer = useFretboardStore((s) => s.viewState.scaleLayer);
  const setScaleFinderActive = useFretboardStore((s) => s.setScaleFinderActive);
  const clearScaleFinderPositions = useFretboardStore((s) => s.clearScaleFinderPositions);
  const setScaleLayer = useFretboardStore((s) => s.setScaleLayer);

  const results = useMemo(
    () => computeScaleFinderResults(scaleFinderPositions, GUITAR_6_STANDARD.tuningMidi),
    [scaleFinderPositions]
  );

  if (!scaleFinderActive) return null;

  const formatNote = (pc: PitchClass) => getChromaticNoteName(pc, scaleLayer.preferFlats);

  const applyMatch = (match: ScaleMatch) => {
    setScaleLayer({
      enabled: true,
      rootPitchClass: match.rootPitchClass,
      scaleId: match.scale.id,
    });
  };

  const renderMatchButton = (match: ScaleMatch) => {
    const rootName = getChromaticNoteName(match.rootPitchClass, scaleLayer.preferFlats);
    const isApplied =
      scaleLayer.enabled &&
      scaleLayer.rootPitchClass === match.rootPitchClass &&
      scaleLayer.scaleId === match.scale.id;

    return (
      <button
        key={`${match.rootPitchClass}-${match.scale.id}`}
        type="button"
        onClick={() => applyMatch(match)}
        aria-pressed={isApplied}
        className={`px-2.5 py-1.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
          isApplied
            ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
            : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
        }`}
      >
        <span className="text-xs font-bold truncate">
          {rootName} {getScaleShortName(match.scale)}
        </span>
        <span className="text-[10px] font-mono opacity-75 shrink-0">
          {match.isExact ? 'Exact' : `${match.scale.semitones.length} notes`}
        </span>
      </button>
    );
  };

  const totalMatches = results.exact.length + results.containing.length;

  return (
    <section
      aria-label="Find Scale"
      className="bg-slate-900/90 border border-sky-500/40 rounded-2xl px-4 py-3.5 flex flex-col gap-3 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
            Find Scale
          </span>
          <span className="text-xs text-slate-400">
            Click notes on the fretboard to see which scales contain them.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {scaleFinderPositions.length > 0 && (
            <button
              type="button"
              onClick={clearScaleFinderPositions}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              Clear notes
            </button>
          )}
          <button
            type="button"
            onClick={() => setScaleFinderActive(false)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Selected notes */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
          Selected notes:
        </span>
        {results.pitchClasses.length === 0 ? (
          <span className="text-xs text-slate-500 italic">None yet — click frets below</span>
        ) : (
          results.pitchClasses.map((pc) => (
            <span
              key={pc}
              className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-200 text-xs font-mono font-bold"
            >
              {formatNote(pc)}
            </span>
          ))
        )}
      </div>

      {/* Matching scales */}
      {results.pitchClasses.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {totalMatches === 0 ? (
            <p className="text-xs text-slate-400 italic">
              No scale in the library contains all {results.pitchClasses.length} selected notes.
            </p>
          ) : (
            <>
              {results.exact.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                    Exact match ({results.exact.length})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                    {results.exact.map(renderMatchButton)}
                  </div>
                </div>
              )}

              {results.containing.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Containing scales ({results.containing.length}) — click to preview on neck
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {results.containing.map(renderMatchButton)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
