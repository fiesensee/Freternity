import type { FC } from 'react';
import { FretboardViewState, InstrumentConfig, PitchClass } from '../../core/models';
import { GUITAR_6_STANDARD, SCALE_MAP } from '../../core/constants';
import { findCagedChordVoicings } from '../../core/cagedChordShapes';
import { getActiveCagedChordShape } from '../../core/fretboardProjector';
import {
  getIntervalDegree,
  getNoteNameInContext,
  midiToPitchClass,
} from '../../core/musicTheory';
import { toDisplayStringNumber } from '../../core/stringNumbering';

const toneColor = (interval: string) =>
  interval === '1'
    ? 'bg-rose-600 border-rose-200'
    : interval === '3' || interval === 'b3'
    ? 'bg-sky-600 border-sky-200'
    : 'bg-amber-600 border-amber-200';

/**
 * Spells out the highlighted CAGED chord shape string by string (low → high):
 * the note, what it is in the chord, and which degree of the key it is.
 */
export const ChordShapeStrip: FC<{ viewState: FretboardViewState; instrument?: InstrumentConfig }> = ({
  viewState,
  instrument = GUITAR_6_STANDARD,
}) => {
  const active = getActiveCagedChordShape(viewState);
  if (!active) return null;

  const voicings = findCagedChordVoicings(
    active.rootPitchClass,
    active.quality,
    active.shape,
    instrument,
    viewState.filterMask.fretRange
  );
  const primary = voicings[0];
  if (!primary) return null;

  const { scaleLayer } = viewState;
  const scaleDef = SCALE_MAP[scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const noteName = (pc: PitchClass) =>
    getNoteNameInContext(
      pc,
      scaleLayer.rootPitchClass,
      scaleLayer.enabled ? scaleDef : SCALE_MAP['ionian'],
      scaleLayer.preferFlats
    );
  const chordName = `${noteName(active.rootPitchClass)}${active.quality === 'min' ? 'm' : ''}`;
  const otherFrets = voicings.slice(1).map((v) => v.rootFret);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs">
      <span className="text-slate-400">
        <strong className="text-slate-200">{chordName}</strong> in the{' '}
        <strong className="text-emerald-300">{active.shape} shape</strong>, low → high:
      </span>
      <div className="flex flex-wrap items-stretch gap-1">
        {primary.tones.map((tone) => {
          const pc = midiToPitchClass(instrument.tuningMidi[tone.stringIndex - 1] + tone.fret);
          const inScale =
            scaleLayer.enabled && scaleDef.semitones.includes((pc - scaleLayer.rootPitchClass + 12) % 12);
          return (
            <div
              key={tone.stringIndex}
              title={`String ${toDisplayStringNumber(tone.stringIndex)}, fret ${tone.fret}`}
              className="flex flex-col items-center px-2 py-1 rounded-lg bg-slate-950/70 border border-slate-800 min-w-[3rem]"
            >
              <span className="text-[10px] font-mono text-slate-500">
                S{toDisplayStringNumber(tone.stringIndex)} · {tone.fret}
              </span>
              <span className="flex items-center gap-1 font-mono font-bold text-white">
                <span className={`w-2 h-2 rounded-full border ${toneColor(tone.interval)}`} />
                {noteName(pc)}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {tone.interval === '1' ? 'R' : tone.interval}
                {inScale && (
                  <span className="text-sky-300/80" title="Degree in the scale">
                    {' '}· {getIntervalDegree(scaleLayer.rootPitchClass, pc, scaleDef)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {otherFrets.length > 0 && (
        <span className="text-[11px] text-slate-500">
          same shape an octave up: root at fret {otherFrets.join(', ')}
        </span>
      )}
    </div>
  );
};
