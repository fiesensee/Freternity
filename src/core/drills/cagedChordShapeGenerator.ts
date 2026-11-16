import {
  CagedShapeId,
  ChordToneRole,
  DrillChallenge,
  DrillConfig,
  DrillNoteInfo,
  FretboardViewState,
  InstrumentConfig,
  IntervalDegree,
  PitchClass,
  VoicingStringNote,
} from '../models';
import { CHORD_MAP, GUITAR_6_STANDARD, SCALE_MAP } from '../constants';
import { CAGED_DEFINITIONS } from '../cagedGeometry';
import {
  CagedChordQuality,
  findCagedChordVoicings,
  isCagedChordQuality,
} from '../cagedChordShapes';
import { toDisplayStringNumber } from '../stringNumbering';
import {
  CHROMATIC_FLATS,
  CHROMATIC_SHARPS,
  getDiatonicScaleSpelling,
  getDiatonicTriads,
  getIntervalDegree,
  getScaleShortName,
  isFlatKeySignature,
  midiToPitchClass,
  resolveRootNoteName,
} from '../musicTheory';

export const ALL_CAGED_SHAPES: readonly CagedShapeId[] = ['C', 'A', 'G', 'E', 'D'];

const ANCHOR_STRING_NAMES: Record<number, string> = { 6: 'low E', 5: 'A', 4: 'D' };

const ROLE_BY_INTERVAL: Partial<Record<IntervalDegree, ChordToneRole>> = {
  '1': 'Root',
  '3': '3rd',
  b3: '3rd',
  '5': '5th',
};

/**
 * "Find A minor in the G shape": one diatonic major/minor chord of the key, one CAGED shape.
 * Only that exact shape counts (any octave of it), so the same chord in a neighbouring
 * shape is a wrong answer. Diminished chords have no CAGED shape and are skipped.
 */
export function generateCagedChordShapeChallenge(
  config: DrillConfig,
  instrument: InstrumentConfig = GUITAR_6_STANDARD
): DrillChallenge {
  const scaleDef = SCALE_MAP[config.scaleContext.scaleId] ?? SCALE_MAP['ionian'];
  const { rootPitchClass: keyRoot, preferFlats } = config.scaleContext;
  const spelling = getDiatonicScaleSpelling(keyRoot, scaleDef, preferFlats);
  const noteName = (pc: PitchClass) =>
    spelling[pc] ?? (preferFlats ? CHROMATIC_FLATS[pc] : CHROMATIC_SHARPS[pc]);

  const chords = getDiatonicTriads(keyRoot, scaleDef).filter(
    (t): t is typeof t & { chordId: CagedChordQuality } => isCagedChordQuality(t.chordId)
  );
  const shapes = config.cagedShapes.length > 0 ? config.cagedShapes : ALL_CAGED_SHAPES;
  const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

  // A narrow fret zone can rule some combinations out: retry, then fall back to a full scan
  let chord = pick(chords);
  let shape = pick(shapes);
  let voicings = findCagedChordVoicings(chord.rootPitch, chord.chordId, shape, instrument, config.fretZone);
  for (let attempt = 0; attempt < 30 && voicings.length === 0; attempt++) {
    chord = pick(chords);
    shape = pick(shapes);
    voicings = findCagedChordVoicings(chord.rootPitch, chord.chordId, shape, instrument, config.fretZone);
  }
  if (voicings.length === 0) {
    outer: for (const c of chords) {
      for (const s of shapes) {
        const found = findCagedChordVoicings(c.rootPitch, c.chordId, s, instrument, config.fretZone);
        if (found.length > 0) {
          chord = c;
          shape = s;
          voicings = found;
          break outer;
        }
      }
    }
  }

  const chordDef = CHORD_MAP[chord.chordId];
  const rootName = noteName(chord.rootPitch);
  const qualityName = chord.chordId === 'maj' ? 'Major' : 'Minor';
  const keyName = `${resolveRootNoteName(keyRoot, isFlatKeySignature(keyRoot, preferFlats))} ${getScaleShortName(scaleDef)}`;
  const anchorString = CAGED_DEFINITIONS[shape].anchorString;

  const headlinePrompt = `${rootName} ${qualityName} (${chord.romanNumeral}) — ${shape} Shape`;
  const subPrompt = `Root on string ${toDisplayStringNumber(anchorString)} (${ANCHOR_STRING_NAMES[anchorString]}) | Play every note of the shape | Key: ${keyName}`;

  const intervalOf = (pc: PitchClass) => getIntervalDegree(chord.rootPitch, pc);
  const solutionNotes: DrillNoteInfo[] = chordDef.semitones.map((semi) => {
    const pc = ((chord.rootPitch + semi) % 12) as PitchClass;
    const interval = intervalOf(pc);
    return {
      pitchClass: pc,
      noteName: noteName(pc),
      interval,
      role: ROLE_BY_INTERVAL[interval] ?? '5th',
      scaleDegree: getIntervalDegree(keyRoot, pc, scaleDef),
    };
  });

  const primary = voicings[0];
  const voicingNotes: VoicingStringNote[] = (primary?.tones ?? []).map((tone) => {
    const pc = midiToPitchClass(instrument.tuningMidi[tone.stringIndex - 1] + tone.fret);
    return {
      stringIndex: tone.stringIndex,
      fret: tone.fret,
      pitchClass: pc,
      noteName: noteName(pc),
      interval: tone.interval,
      role: ROLE_BY_INTERVAL[tone.interval] ?? '5th',
    };
  });

  const allStrings = instrument.tuningMidi.map((_, i) => i + 1);
  const baseFilterMask = { activeStrings: allStrings, fretRange: config.fretZone };

  // Prompt: blank neck, the player has to know where the shape lives
  const promptBoardState: FretboardViewState = {
    instrumentId: instrument.id,
    labelMode: 'NOTE_NAME',
    scaleLayer: { ...config.scaleContext, enabled: false },
    targetLayer: { enabled: false, rootPitchClass: chord.rootPitch, chordId: chord.chordId },
    filterMask: baseFilterMask,
  };

  // Reveal: the shape's box with the chord fingering lit inside it, scale tones around it
  const revealBoardState: FretboardViewState = {
    instrumentId: instrument.id,
    labelMode: 'CHORD_INTERVAL',
    scaleLayer: { ...config.scaleContext, enabled: true },
    targetLayer: {
      enabled: true,
      rootPitchClass: chord.rootPitch,
      chordId: chord.chordId,
      diatonicRomanNumeral: chord.romanNumeral,
    },
    filterMask: {
      ...baseFilterMask,
      cagedOverlay: { enabled: true, shape, referenceRoot: 'TARGET_ROOT' },
    },
  };

  return {
    id: `challenge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    exerciseType: 'CAGED_CHORD_SHAPE',
    questionKey: ['CAGED_CHORD_SHAPE', chord.rootPitch, chord.chordId, shape].join('|'),
    cagedShape: shape,
    headlinePrompt,
    subPrompt,
    targetPitchClasses: solutionNotes.map((n) => n.pitchClass),
    solutionNotes,
    voicingNotes,
    validVoicings: voicings.map((v) =>
      v.tones.map(({ stringIndex, fret }) => ({ stringIndex, fret }))
    ),
    promptBoardState,
    revealBoardState,
  };
}
