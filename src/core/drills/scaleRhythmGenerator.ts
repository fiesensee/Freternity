import {
  CagedShapeId,
  DrillChallenge,
  DrillConfig,
  FretboardViewState,
  InstrumentConfig,
  PitchClass,
  RhythmChallengeSpec,
} from '../models';
import { GUITAR_6_STANDARD, SCALE_MAP } from '../constants';
import { getCagedScalePosition, buildScaleSequence, ScalePosition } from '../scalePositions';
import { toDisplayStringNumber } from '../stringNumbering';
import {
  CHROMATIC_FLATS,
  CHROMATIC_SHARPS,
  getDiatonicScaleSpelling,
  getScaleShortName,
  isFlatKeySignature,
  resolveRootNoteName,
} from '../musicTheory';
import { ALL_CAGED_SHAPES } from './cagedChordShapeGenerator';

export const RHYTHM_COUNT_IN_BEATS = 4;

export const SUBDIVISION_NAMES: Record<RhythmChallengeSpec['subdivision'], string> = {
  1: 'quarters',
  2: 'eighths',
  3: 'triplets',
  4: 'sixteenths',
};

export const SCALE_PATTERN_NAMES: Record<DrillConfig['rhythm']['pattern'], string> = {
  STRAIGHT: 'Straight',
  THIRDS: 'In thirds',
};

/**
 * "Scale in time": play the key's scale in one CAGED position, up and back down,
 * one note per grid slot, after a one-bar count-in.
 */
export function generateScaleRhythmChallenge(
  config: DrillConfig,
  instrument: InstrumentConfig = GUITAR_6_STANDARD
): DrillChallenge {
  const scaleDef = SCALE_MAP[config.scaleContext.scaleId] ?? SCALE_MAP['ionian'];
  const { rootPitchClass: root, preferFlats } = config.scaleContext;
  const spelling = getDiatonicScaleSpelling(root, scaleDef, preferFlats);
  const noteName = (pc: PitchClass) =>
    spelling[pc] ?? (preferFlats ? CHROMATIC_FLATS[pc] : CHROMATIC_SHARPS[pc]);

  const shapes = config.cagedShapes.length > 0 ? config.cagedShapes : ALL_CAGED_SHAPES;
  // Every complete position exists somewhere on a 22-fret neck; the fallback is just a guard
  let shape: CagedShapeId = shapes[Math.floor(Math.random() * shapes.length)];
  let position: ScalePosition | null = getCagedScalePosition(root, scaleDef, shape, instrument);
  for (const s of ALL_CAGED_SHAPES) {
    if (position) break;
    shape = s;
    position = getCagedScalePosition(root, scaleDef, s, instrument);
  }
  if (!position) throw new Error('No playable scale position found');

  const up = position.notes;
  const expected = buildScaleSequence(up, config.rhythm.pattern).map((n, slot) => ({ ...n, slot }));
  const { bpm, subdivision, pattern } = config.rhythm;
  const rhythm: RhythmChallengeSpec = { bpm, subdivision, countInBeats: RHYTHM_COUNT_IN_BEATS, expected };

  const keyName = `${resolveRootNoteName(root, isFlatKeySignature(root, preferFlats))} ${getScaleShortName(scaleDef)}`;
  const first = expected[0];
  const firstName = noteName((first.midi % 12) as PitchClass);

  const boardState: FretboardViewState = {
    instrumentId: instrument.id,
    labelMode: 'SCALE_DEGREE',
    scaleLayer: { ...config.scaleContext, enabled: true },
    targetLayer: { enabled: false, rootPitchClass: root, chordId: 'maj' },
    filterMask: {
      activeStrings: instrument.tuningMidi.map((_, i) => i + 1),
      fretRange: position.span,
      // Exactly the planned notes: a pitch the box holds twice shows only where it's played
      onlyPositions: position.notes.map(({ stringIndex, fret }) => ({ stringIndex, fret })),
      cagedOverlay: { enabled: true, shape, referenceRoot: 'SCALE_ROOT' },
    },
  };

  return {
    id: `challenge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    exerciseType: 'SCALE_RHYTHM',
    questionKey: ['SCALE_RHYTHM', root, scaleDef.id, shape, pattern].join('|'),
    cagedShape: shape,
    rhythm,
    headlinePrompt: `${keyName} — ${shape} Shape`,
    subPrompt: `${pattern === 'THIRDS' ? 'In thirds' : 'Up and down'} in ${SUBDIVISION_NAMES[subdivision]} at ${bpm} bpm | Start on ${firstName} (string ${toDisplayStringNumber(first.stringIndex)}, fret ${first.fret}) | ${expected.length} notes`,
    targetPitchClasses: scaleDef.semitones.map((s) => ((root + s) % 12) as PitchClass),
    solutionNotes: [],
    validVoicings: [],
    // The position is shown throughout: the challenge is the timing, not finding the notes
    promptBoardState: boardState,
    revealBoardState: boardState,
  };
}
