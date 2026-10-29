import { create } from 'zustand';
import {
  CagedShapeId,
  FilterMaskConfig,
  FretboardViewState,
  NodeLabelMode,
  PitchClass,
  ScaleLayerConfig,
  TargetLayerConfig,
} from '../core/models';
import { SCALE_MAP } from '../core/constants';
import { getDiatonicTriads, getParentMajorRoot, getRelativeMode } from '../core/musicTheory';
import { loadStateFromUrl, syncStateToUrl } from '../adapters/urlStateSync';

export const DEFAULT_FRETBOARD_STATE: FretboardViewState = {
  instrumentId: 'guitar_6_standard',
  labelMode: 'NOTE_NAME',
  scaleLayer: {
    enabled: true,
    rootPitchClass: 9, // A
    preferFlats: true,
    scaleId: 'aeolian',
  },
  targetLayer: {
    enabled: true,
    rootPitchClass: 5, // F
    chordId: 'maj',
    diatonicRomanNumeral: 'VI',
    activeInversion: 'FIRST',
  },
  filterMask: {
    activeStrings: [1, 2, 3],
    fretRange: { min: 0, max: 22 },
    cagedOverlay: {
      enabled: true,
      shape: 'E',
      referenceRoot: 'TARGET_ROOT',
    },
  },
};

export interface FretboardStore {
  viewState: FretboardViewState;
  viewWindow?: { minFret: number; maxFret: number };

  // Actions
  setLabelMode: (mode: NodeLabelMode) => void;
  setScaleLayer: (config: Partial<ScaleLayerConfig>) => void;
  setTargetLayer: (config: Partial<TargetLayerConfig>) => void;
  setFilterMask: (config: Partial<FilterMaskConfig>) => void;
  setActiveStrings: (strings: readonly number[]) => void;
  setFretRange: (min: number, max: number) => void;
  setCagedOverlay: (overlay?: FilterMaskConfig['cagedOverlay']) => void;
  toggleCagedOverlay: () => void;
  setCagedShape: (shape: CagedShapeId) => void;
  setViewWindow: (window?: { minFret: number; maxFret: number }) => void;

  // Music Theory Pivots
  pivotRelativeMode: (targetModeId: string) => void;
  setBaseScaleRoot: (root: PitchClass) => void;
  setTargetChord: (root: PitchClass, chordId: string, romanNumeral?: string) => void;

  resetToDefaults: () => void;
}

export const useFretboardStore = create<FretboardStore>((set, get) => {
  // Initialize from URL search parameters if available
  const initialState = loadStateFromUrl(DEFAULT_FRETBOARD_STATE);

  const updateStateAndSyncUrl = (updater: (prev: FretboardViewState) => FretboardViewState) => {
    set((state) => {
      const next = updater(state.viewState);
      syncStateToUrl(next);
      return { viewState: next };
    });
  };

  return {
    viewState: initialState,
    viewWindow: undefined,

    setLabelMode: (mode) =>
      updateStateAndSyncUrl((prev) => ({ ...prev, labelMode: mode })),

    setScaleLayer: (config) =>
      updateStateAndSyncUrl((prev) => {
        const nextScale = { ...prev.scaleLayer, ...config };
        const rootChanged =
          config.rootPitchClass !== undefined &&
          config.rootPitchClass !== prev.scaleLayer.rootPitchClass;
        const scaleChanged =
          config.scaleId !== undefined && config.scaleId !== prev.scaleLayer.scaleId;

        if (rootChanged || scaleChanged) {
          const scaleDef = SCALE_MAP[nextScale.scaleId] ?? SCALE_MAP['ionian'];
          const diatonicTriads = getDiatonicTriads(nextScale.rootPitchClass, scaleDef);
          const tonic = diatonicTriads[0];

          return {
            ...prev,
            scaleLayer: nextScale,
            targetLayer: {
              ...prev.targetLayer,
              enabled: true,
              rootPitchClass: tonic.rootPitch,
              chordId: tonic.chordId,
              diatonicRomanNumeral: tonic.romanNumeral,
            },
          };
        }

        return {
          ...prev,
          scaleLayer: nextScale,
        };
      }),

    setTargetLayer: (config) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        targetLayer: { ...prev.targetLayer, ...config },
      })),

    setFilterMask: (config) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        filterMask: { ...prev.filterMask, ...config },
      })),

    setActiveStrings: (strings) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        filterMask: { ...prev.filterMask, activeStrings: strings },
      })),

    setFretRange: (min, max) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        filterMask: { ...prev.filterMask, fretRange: { min, max } },
      })),

    setCagedOverlay: (overlay) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        filterMask: { ...prev.filterMask, cagedOverlay: overlay },
      })),

    toggleCagedOverlay: () =>
      updateStateAndSyncUrl((prev) => {
        const current = prev.filterMask.cagedOverlay;
        return {
          ...prev,
          filterMask: {
            ...prev.filterMask,
            cagedOverlay: current
              ? { ...current, enabled: !current.enabled }
              : { enabled: true, shape: 'E', referenceRoot: 'TARGET_ROOT' },
          },
        };
      }),

    setCagedShape: (shape) =>
      updateStateAndSyncUrl((prev) => {
        const current = prev.filterMask.cagedOverlay ?? {
          enabled: true,
          shape: 'E',
          referenceRoot: 'TARGET_ROOT',
        };
        return {
          ...prev,
          filterMask: {
            ...prev.filterMask,
            cagedOverlay: { ...current, shape },
          },
        };
      }),

    setViewWindow: (window) => set({ viewWindow: window }),

    pivotRelativeMode: (targetModeId) => {
      const currentScaleLayer = get().viewState.scaleLayer;
      const currentScaleDef = SCALE_MAP[currentScaleLayer.scaleId] ?? SCALE_MAP['ionian'];
      const parentMajorRoot = getParentMajorRoot(
        currentScaleLayer.rootPitchClass,
        currentScaleDef
      );
      const { root } = getRelativeMode(parentMajorRoot, targetModeId);

      updateStateAndSyncUrl((prev) => {
        const nextScaleDef = SCALE_MAP[targetModeId] ?? SCALE_MAP['ionian'];
        const diatonicTriads = getDiatonicTriads(root, nextScaleDef);
        const tonic = diatonicTriads[0];

        return {
          ...prev,
          scaleLayer: {
            ...prev.scaleLayer,
            rootPitchClass: root,
            scaleId: targetModeId,
          },
          targetLayer: {
            ...prev.targetLayer,
            enabled: true,
            rootPitchClass: tonic.rootPitch,
            chordId: tonic.chordId,
            diatonicRomanNumeral: tonic.romanNumeral,
          },
        };
      });
    },

    setBaseScaleRoot: (root) =>
      updateStateAndSyncUrl((prev) => {
        const scaleDef = SCALE_MAP[prev.scaleLayer.scaleId] ?? SCALE_MAP['ionian'];
        const diatonicTriads = getDiatonicTriads(root, scaleDef);
        const tonic = diatonicTriads[0];

        return {
          ...prev,
          scaleLayer: { ...prev.scaleLayer, rootPitchClass: root },
          targetLayer: {
            ...prev.targetLayer,
            enabled: true,
            rootPitchClass: tonic.rootPitch,
            chordId: tonic.chordId,
            diatonicRomanNumeral: tonic.romanNumeral,
          },
        };
      }),

    setTargetChord: (root, chordId, romanNumeral) =>
      updateStateAndSyncUrl((prev) => ({
        ...prev,
        targetLayer: {
          ...prev.targetLayer,
          enabled: true,
          rootPitchClass: root,
          chordId,
          diatonicRomanNumeral: romanNumeral,
        },
      })),

    resetToDefaults: () => {
      set({ viewState: DEFAULT_FRETBOARD_STATE, viewWindow: undefined });
      syncStateToUrl(DEFAULT_FRETBOARD_STATE);
    },
  };
});
