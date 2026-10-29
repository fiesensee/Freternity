import {
  DrillChallenge,
  DrillConfig,
  DrillNoteInfo,
  FretboardViewState,
  FretPosition,
  InstrumentConfig,
  IntervalDegree,
  PitchClass,
  TriadInversion,
  VoicingStringNote,
} from '../models';
import { CHORD_MAP, GUITAR_6_STANDARD, SCALE_MAP } from '../constants';
import { findClosedTriadVoicings } from '../triadVoicings';
import {
  CHROMATIC_FLATS,
  CHROMATIC_SHARPS,
  getDiatonicScaleSpelling,
  getDiatonicTriads,
  isFlatKeySignature,
  midiToPitchClass,
  resolveRootNoteName,
} from '../musicTheory';

const INVERSION_LABELS: Record<TriadInversion, string> = {
  ROOT: 'Root Position',
  FIRST: '1st Inversion',
  SECOND: '2nd Inversion',
};

const BASS_ROLE: Record<TriadInversion, string> = {
  ROOT: 'Root in bass',
  FIRST: '3rd in bass',
  SECOND: '5th in bass',
};

export function generateTriadInversionChallenge(
  config: DrillConfig,
  instrument: InstrumentConfig = GUITAR_6_STANDARD
): DrillChallenge {
  const scaleDef = SCALE_MAP[config.scaleContext.scaleId] ?? SCALE_MAP['ionian'];
  const preferFlats = config.scaleContext.preferFlats;
  const scaleSpelling = getDiatonicScaleSpelling(
    config.scaleContext.rootPitchClass,
    scaleDef,
    preferFlats
  );

  const getNoteName = (pitch: PitchClass) => {
    return (
      scaleSpelling[pitch] ??
      (preferFlats ? CHROMATIC_FLATS[pitch] : CHROMATIC_SHARPS[pitch])
    );
  };

  // 1. Gather all diatonic triads in key
  const diatonicTriads = getDiatonicTriads(
    config.scaleContext.rootPitchClass,
    scaleDef
  ).map((t) => ({
    rootPitch: t.rootPitch,
    chordId: t.chordId,
    roman: t.romanNumeral,
    degreeIdx: t.degreeIdx,
  }));

  const isAllInversions = config.exerciseType === 'TRIAD_ALL_INVERSIONS';
  const availableStringSets =
    config.stringSets.length > 0 ? config.stringSets : [[1, 2, 3]];
  const availableInversions =
    config.inversions.length > 0 ? config.inversions : (['ROOT', 'FIRST', 'SECOND'] as const);

  let selectedTriad = diatonicTriads[0];
  let selectedStringSet = availableStringSets[0];
  let selectedInversion: TriadInversion = availableInversions[0];
  let voicings = findClosedTriadVoicings(
    selectedTriad.rootPitch,
    CHORD_MAP[selectedTriad.chordId],
    isAllInversions ? 'ANY' : selectedInversion,
    selectedStringSet,
    instrument,
    config.fretZone
  );

  const maxAttempts = 35;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateTriad =
      diatonicTriads[Math.floor(Math.random() * diatonicTriads.length)];
    const candidateStringSet =
      availableStringSets[Math.floor(Math.random() * availableStringSets.length)];
    const candidateInversion =
      availableInversions[Math.floor(Math.random() * availableInversions.length)];

    const candidateVoicings = findClosedTriadVoicings(
      candidateTriad.rootPitch,
      CHORD_MAP[candidateTriad.chordId],
      isAllInversions ? 'ANY' : candidateInversion,
      candidateStringSet,
      instrument,
      config.fretZone
    );

    if (isAllInversions) {
      // Must contain at least one voicing for each of ROOT, FIRST, and SECOND
      const hasRoot = candidateVoicings.some((v) => v.inversion === 'ROOT');
      const hasFirst = candidateVoicings.some((v) => v.inversion === 'FIRST');
      const hasSecond = candidateVoicings.some((v) => v.inversion === 'SECOND');
      if (hasRoot && hasFirst && hasSecond) {
        selectedTriad = candidateTriad;
        selectedStringSet = candidateStringSet;
        voicings = candidateVoicings;
        break;
      }
    } else {
      if (candidateVoicings.length > 0) {
        selectedTriad = candidateTriad;
        selectedStringSet = candidateStringSet;
        selectedInversion = candidateInversion;
        voicings = candidateVoicings;
        break;
      }
    }
  }

  const chordDef = CHORD_MAP[selectedTriad.chordId];
  const rootName = getNoteName(selectedTriad.rootPitch);
  const chordName = `${rootName} ${chordDef.name}`;
  const invLabel = INVERSION_LABELS[selectedInversion];
  const bassDesc = BASS_ROLE[selectedInversion];

  const scaleRootName = resolveRootNoteName(
    config.scaleContext.rootPitchClass,
    isFlatKeySignature(config.scaleContext.rootPitchClass, preferFlats)
  );

  const headlinePrompt = isAllInversions
    ? `${chordName} (${selectedTriad.roman}) — All Inversions`
    : `${chordName} (${selectedTriad.roman}) — ${invLabel}`;

  const subPrompt = isAllInversions
    ? `Strings ${selectedStringSet.join('-')} | Mark Root Pos, 1st Inv & 2nd Inv | Key: ${scaleRootName} ${scaleDef.name.split(' ')[0]}`
    : `Strings ${selectedStringSet.join('-')} | ${bassDesc} | Key: ${scaleRootName} ${scaleDef.name.split(' ')[0]}`;

  const inversionVoicings: Record<TriadInversion, ReadonlyArray<readonly FretPosition[]>> = {
    ROOT: voicings.filter((v) => v.inversion === 'ROOT').map((v) => v.positions),
    FIRST: voicings.filter((v) => v.inversion === 'FIRST').map((v) => v.positions),
    SECOND: voicings.filter((v) => v.inversion === 'SECOND').map((v) => v.positions),
  };

  const R = selectedTriad.rootPitch;
  const T = ((R + chordDef.semitones[1]) % 12) as PitchClass;
  const F = ((R + chordDef.semitones[2]) % 12) as PitchClass;
  const targetPitchClasses: readonly PitchClass[] = [R, T, F];

  const thirdInterval: IntervalDegree = chordDef.semitones[1] === 3 ? 'b3' : '3';
  const fifthInterval: IntervalDegree =
    chordDef.semitones[2] === 7
      ? '5'
      : chordDef.semitones[2] === 6
      ? 'b5'
      : '#5';

  const solutionNotes: readonly DrillNoteInfo[] = [
    {
      pitchClass: R,
      noteName: getNoteName(R),
      interval: '1',
      role: 'Root',
    },
    {
      pitchClass: T,
      noteName: getNoteName(T),
      interval: thirdInterval,
      role: '3rd',
    },
    {
      pitchClass: F,
      noteName: getNoteName(F),
      interval: fifthInterval,
      role: '5th',
    },
  ];

  // Specific voicing breakdown by string (ordered from bass to treble string)
  const primaryVoicing = voicings[0]?.positions ?? [];
  const sortedVoicingPositions = [...primaryVoicing].sort((a, b) => {
    const midiA = instrument.tuningMidi[a.stringIndex - 1];
    const midiB = instrument.tuningMidi[b.stringIndex - 1];
    return midiA - midiB;
  });

  const voicingNotes: readonly VoicingStringNote[] = sortedVoicingPositions.map((pos) => {
    const midi = instrument.tuningMidi[pos.stringIndex - 1] + pos.fret;
    const pc = midiToPitchClass(midi);
    const interval: IntervalDegree =
      pc === R ? '1' : pc === T ? thirdInterval : fifthInterval;
    const role: 'Root' | '3rd' | '5th' =
      pc === R ? 'Root' : pc === T ? '3rd' : '5th';
    return {
      stringIndex: pos.stringIndex,
      fret: pos.fret,
      pitchClass: pc,
      noteName: getNoteName(pc),
      interval,
      role,
    };
  });

  const baseFilterMask = {
    activeStrings: selectedStringSet,
    fretRange: config.fretZone,
  };

  // State during PROMPTING phase: target overlay is hidden so student must locate shape
  const promptBoardState: FretboardViewState = {
    instrumentId: instrument.id,
    labelMode: 'NOTE_NAME',
    scaleLayer: {
      ...config.scaleContext,
      enabled: false,
    },
    targetLayer: {
      enabled: false,
      rootPitchClass: selectedTriad.rootPitch,
      chordId: selectedTriad.chordId,
      activeInversion: isAllInversions ? 'ANY' : selectedInversion,
    },
    filterMask: baseFilterMask,
  };

  // State during REVEALING phase: target chord and isolated inversion light up
  const revealBoardState: FretboardViewState = {
    instrumentId: instrument.id,
    labelMode: 'CHORD_INTERVAL',
    scaleLayer: {
      ...config.scaleContext,
      enabled: true,
    },
    targetLayer: {
      enabled: true,
      rootPitchClass: selectedTriad.rootPitch,
      chordId: selectedTriad.chordId,
      diatonicRomanNumeral: selectedTriad.roman,
      activeInversion: isAllInversions ? 'ANY' : selectedInversion,
    },
    filterMask: baseFilterMask,
  };

  return {
    id: `challenge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    exerciseType: config.exerciseType,
    headlinePrompt,
    subPrompt,
    targetPitchClasses,
    solutionNotes,
    voicingNotes,
    validVoicings: voicings.map((v) => v.positions),
    inversionVoicings,
    promptBoardState,
    revealBoardState,
  };
}
