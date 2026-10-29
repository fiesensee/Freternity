import { type FC } from 'react';
import { useFretboardStore } from '../../store/useFretboardStore';
import { SCALE_MAP } from '../../core/constants';
import {
  getDiatonicScaleSpelling,
  getParentMajorRoot,
  resolveRootNoteName,
  isFlatKeySignature,
} from '../../core/musicTheory';
import { PitchClass } from '../../core/models';

interface DiatonicDegreeInfo {
  degreeIndex: number; // 0..6
  romanNumeral: string;
  modeId: string;
  modeName: string;
  semitoneOffset: number; // from parent major root
}

const DIATONIC_DEGREES: readonly DiatonicDegreeInfo[] = [
  { degreeIndex: 0, romanNumeral: 'I', modeId: 'ionian', modeName: 'Ionian', semitoneOffset: 0 },
  { degreeIndex: 1, romanNumeral: 'ii', modeId: 'dorian', modeName: 'Dorian', semitoneOffset: 2 },
  { degreeIndex: 2, romanNumeral: 'iii', modeId: 'phrygian', modeName: 'Phrygian', semitoneOffset: 4 },
  { degreeIndex: 3, romanNumeral: 'IV', modeId: 'lydian', modeName: 'Lydian', semitoneOffset: 5 },
  { degreeIndex: 4, romanNumeral: 'V', modeId: 'mixolydian', modeName: 'Mixolydian', semitoneOffset: 7 },
  { degreeIndex: 5, romanNumeral: 'vi', modeId: 'aeolian', modeName: 'Aeolian', semitoneOffset: 9 },
  { degreeIndex: 6, romanNumeral: 'vii°', modeId: 'locrian', modeName: 'Locrian', semitoneOffset: 11 },
];

export const ModalPivotSlider: FC = () => {
  const scaleLayer = useFretboardStore((s) => s.viewState.scaleLayer);
  const pivotRelativeMode = useFretboardStore((s) => s.pivotRelativeMode);

  const currentScaleDef = SCALE_MAP[scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const parentMajorRoot = getParentMajorRoot(scaleLayer.rootPitchClass, currentScaleDef);
  const isFlat = isFlatKeySignature(parentMajorRoot, scaleLayer.preferFlats);
  const parentName = resolveRootNoteName(parentMajorRoot, isFlat);

  // Compute the spelled note name for each of the 7 diatonic degrees
  const ionianSpelling = getDiatonicScaleSpelling(
    parentMajorRoot,
    SCALE_MAP['ionian'],
    scaleLayer.preferFlats
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-inner">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Modal Pivot:
          </span>
          <span className="text-xs bg-slate-800 text-sky-400 font-mono px-2 py-0.5 rounded border border-slate-700">
            Parent Key: {parentName} Major
          </span>
        </div>
        <span className="text-[11px] text-slate-500 italic hidden sm:inline">
          Pivoting rotates interval degrees without moving physical notes
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DIATONIC_DEGREES.map((deg) => {
          const degPitch = ((parentMajorRoot + deg.semitoneOffset) % 12) as PitchClass;
          const noteName = ionianSpelling[degPitch] ?? '';
          const isActive =
            scaleLayer.scaleId === deg.modeId &&
            scaleLayer.rootPitchClass === degPitch;

          return (
            <button
              key={deg.modeId}
              onClick={() => pivotRelativeMode(deg.modeId)}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition cursor-pointer select-none text-center ${
                isActive
                  ? 'bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-md ring-2 ring-sky-400/50 scale-[1.02]'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
              }`}
            >
              <span className="text-xs font-mono font-bold tracking-tight">
                {deg.romanNumeral}
              </span>
              <span className={`text-base font-extrabold ${isActive ? 'text-white' : 'text-slate-100'}`}>
                {noteName}
              </span>
              <span
                className={`text-[10px] font-medium truncate max-w-full ${
                  isActive ? 'text-sky-100 font-semibold' : 'text-slate-400'
                }`}
              >
                {deg.modeName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
