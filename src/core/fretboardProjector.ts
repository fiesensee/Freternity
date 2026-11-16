import {
  CagedShapeId,
  ComputedFretNode,
  FretboardViewState,
  FretPosition,
  InstrumentConfig,
  NodeLabelMode,
} from './models';
import { CHORD_MAP, GUITAR_6_STANDARD, SCALE_MAP } from './constants';
import {
  getIntervalDegree,
  getNoteNameInContext,
  midiToFrequencyHz,
  midiToOctave,
  midiToPitchClass,
  semitoneDistance,
} from './musicTheory';
import { findClosedTriadVoicings } from './triadVoicings';
import { isFretInCagedStencil } from './cagedGeometry';
import {
  CagedChordQuality,
  findCagedChordVoicings,
  isCagedChordQuality,
} from './cagedChordShapes';

/**
 * The CAGED chord shape to light up, if any: the fingering of the highlighted chord inside
 * its CAGED box. Only when the box is built on the chord root (otherwise box and chord don't
 * line up) and no inversion is isolated (that's a different voicing on top of it).
 */
export function getActiveCagedChordShape(
  state: FretboardViewState
): { rootPitchClass: FretboardViewState['targetLayer']['rootPitchClass']; quality: CagedChordQuality; shape: CagedShapeId } | null {
  const caged = state.filterMask.cagedOverlay;
  const { targetLayer } = state;
  const isolatesInversion =
    !!targetLayer.activeInversion && state.filterMask.activeStrings.length === 3;
  if (
    !caged?.enabled ||
    caged.referenceRoot !== 'TARGET_ROOT' ||
    !targetLayer.enabled ||
    isolatesInversion ||
    !isCagedChordQuality(targetLayer.chordId)
  ) {
    return null;
  }
  return { rootPitchClass: targetLayer.rootPitchClass, quality: targetLayer.chordId, shape: caged.shape };
}

export function projectFretboard(
  state: FretboardViewState,
  instrument: InstrumentConfig = GUITAR_6_STANDARD
): ComputedFretNode[][] {
  const scaleDefinition = SCALE_MAP[state.scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
  const chordDefinition = CHORD_MAP[state.targetLayer.chordId] ?? CHORD_MAP['maj'];

  // Precompute active triad voicing positions if targetLayer and activeInversion are specified
  const activeVoicingPositions = new Set<string>();
  if (
    state.targetLayer.enabled &&
    state.targetLayer.activeInversion &&
    state.filterMask.activeStrings.length === 3
  ) {
    const voicings = findClosedTriadVoicings(
      state.targetLayer.rootPitchClass,
      chordDefinition,
      state.targetLayer.activeInversion,
      state.filterMask.activeStrings,
      instrument,
      state.filterMask.fretRange
    );
    for (const v of voicings) {
      for (const pos of v.positions) {
        activeVoicingPositions.add(`${pos.stringIndex}-${pos.fret}`);
      }
    }
  }

  const activeChordShapePositions = new Set<string>();
  const chordShape = getActiveCagedChordShape(state);
  if (chordShape) {
    const voicings = findCagedChordVoicings(
      chordShape.rootPitchClass,
      chordShape.quality,
      chordShape.shape,
      instrument,
      state.filterMask.fretRange
    );
    for (const v of voicings) {
      for (const pos of v.tones) {
        activeChordShapePositions.add(`${pos.stringIndex}-${pos.fret}`);
      }
    }
  }

  const matrix: ComputedFretNode[][] = [];

  for (let stringIdx = 0; stringIdx < instrument.stringCount; stringIdx++) {
    const stringNumber = stringIdx + 1; // 1-based (1 = High E)
    const openMidi = instrument.tuningMidi[stringIdx];
    const row: ComputedFretNode[] = [];

    for (let fret = 0; fret <= instrument.fretCount; fret++) {
      const position: FretPosition = { stringIndex: stringNumber, fret };
      const midiNote = openMidi + fret;
      const pitchClass = midiToPitchClass(midiNote);
      const octave = midiToOctave(midiNote);
      const frequencyHz = midiToFrequencyHz(midiNote);

      const noteName = state.scaleLayer.enabled
        ? getNoteNameInContext(
            pitchClass,
            state.scaleLayer.rootPitchClass,
            scaleDefinition,
            state.scaleLayer.preferFlats
          )
        : getNoteNameInContext(
            pitchClass,
            state.scaleLayer.rootPitchClass,
            SCALE_MAP['ionian'],
            state.scaleLayer.preferFlats
          );

      // Scale Layer
      let inScaleLayer = false;
      let scaleDegree: string | undefined = undefined;
      let isScaleRoot = false;

      if (state.scaleLayer.enabled) {
        const distFromScaleRoot = semitoneDistance(
          state.scaleLayer.rootPitchClass,
          pitchClass
        );
        if (scaleDefinition.semitones.includes(distFromScaleRoot)) {
          inScaleLayer = true;
          scaleDegree = getIntervalDegree(
            state.scaleLayer.rootPitchClass,
            pitchClass,
            scaleDefinition
          );
          isScaleRoot = pitchClass === state.scaleLayer.rootPitchClass;
        }
      }

      // Target Layer
      let inTargetLayer = false;
      let targetInterval: string | undefined = undefined;
      let isTargetRoot = false;

      if (state.targetLayer.enabled) {
        const distFromTargetRoot = semitoneDistance(
          state.targetLayer.rootPitchClass,
          pitchClass
        );
        if (chordDefinition.semitones.includes(distFromTargetRoot)) {
          inTargetLayer = true;
          targetInterval = getIntervalDegree(
            state.targetLayer.rootPitchClass,
            pitchClass
          );
          isTargetRoot = pitchClass === state.targetLayer.rootPitchClass;
        }
      }

      // Active Triad Voicing
      const isActiveTriadVoicing = activeVoicingPositions.has(
        `${stringNumber}-${fret}`
      );

      const isActiveChordShape = activeChordShapePositions.has(`${stringNumber}-${fret}`);

      // CAGED Stencil
      let inCagedStencil = false;
      if (state.filterMask.cagedOverlay && state.filterMask.cagedOverlay.enabled) {
        const refRoot =
          state.filterMask.cagedOverlay.referenceRoot === 'TARGET_ROOT'
            ? state.targetLayer.rootPitchClass
            : state.scaleLayer.rootPitchClass;
        inCagedStencil = isFretInCagedStencil(
          fret,
          state.filterMask.cagedOverlay.shape,
          refRoot,
          instrument
        );
      }

      // Filter Mask
      const isStringActive = state.filterMask.activeStrings.includes(stringNumber);
      const isFretInRange =
        fret >= state.filterMask.fretRange.min &&
        fret <= state.filterMask.fretRange.max;
      const isMaskedOut = !isStringActive || !isFretInRange;

      // Visual Priority
      let visualPriority: ComputedFretNode['visualPriority'];
      if (!inScaleLayer && !inTargetLayer) {
        visualPriority = 'HIDDEN';
      } else if (isMaskedOut) {
        visualPriority = 'GHOST';
      } else if (isTargetRoot) {
        visualPriority = 'TARGET_ROOT';
      } else if (inTargetLayer) {
        visualPriority = 'TARGET_TONE';
      } else if (!state.targetLayer.enabled) {
        // No chord to focus on: the scale itself is the subject
        visualPriority = isScaleRoot ? 'SCALE_ROOT' : 'SCALE_TONE';
      } else {
        visualPriority = 'CONTEXT_SCALE';
      }

      // Display Label
      const displayLabel = resolveDisplayLabel(
        state.labelMode,
        noteName,
        scaleDegree,
        targetInterval,
        isTargetRoot,
        inTargetLayer
      );

      row.push({
        position,
        midiNote,
        pitchClass,
        noteName,
        octave,
        frequencyHz,
        inScaleLayer,
        scaleDegree: scaleDegree as any,
        isScaleRoot,
        inTargetLayer,
        targetInterval: targetInterval as any,
        isTargetRoot,
        isActiveTriadVoicing,
        isActiveChordShape,
        inCagedStencil,
        isMaskedOut,
        visualPriority,
        displayLabel,
      });
    }

    matrix.push(row);
  }

  return matrix;
}

function resolveDisplayLabel(
  labelMode: NodeLabelMode,
  noteName: string,
  scaleDegree: string | undefined,
  targetInterval: string | undefined,
  isTargetRoot: boolean,
  inTargetLayer: boolean
): string {
  switch (labelMode) {
    case 'NOTE_NAME':
      return noteName;
    case 'SCALE_DEGREE':
      return scaleDegree ?? noteName;
    case 'CHORD_INTERVAL':
      if (inTargetLayer) {
        return isTargetRoot ? 'R' : (targetInterval ?? '');
      }
      return '';
    case 'BLIND_COLOR':
      return '';
  }
}
