import {
  CagedShapeId,
  FilterMaskConfig,
  FretboardViewState,
  NodeLabelMode,
  PitchClass,
  ScaleLayerConfig,
  TargetLayerConfig,
  TriadInversion,
} from '../core/models';

export function stateToSearchParams(state: FretboardViewState): URLSearchParams {
  const params = new URLSearchParams();

  params.set('inst', state.instrumentId);
  params.set('lens', state.labelMode);

  // Scale Layer
  params.set('sOn', state.scaleLayer.enabled ? '1' : '0');
  params.set('sRoot', state.scaleLayer.rootPitchClass.toString());
  params.set('scale', state.scaleLayer.scaleId);
  params.set('flats', state.scaleLayer.preferFlats ? '1' : '0');

  // Target Layer
  params.set('tOn', state.targetLayer.enabled ? '1' : '0');
  params.set('tRoot', state.targetLayer.rootPitchClass.toString());
  params.set('chord', state.targetLayer.chordId);
  if (state.targetLayer.activeInversion) {
    params.set('inv', state.targetLayer.activeInversion);
  }
  if (state.targetLayer.diatonicRomanNumeral) {
    params.set('roman', state.targetLayer.diatonicRomanNumeral);
  }

  // Filter Mask
  params.set('strings', state.filterMask.activeStrings.join(','));
  params.set('frets', `${state.filterMask.fretRange.min}-${state.filterMask.fretRange.max}`);

  if (state.filterMask.cagedOverlay) {
    params.set('cagedOn', state.filterMask.cagedOverlay.enabled ? '1' : '0');
    params.set('cagedShape', state.filterMask.cagedOverlay.shape);
    params.set('cagedRef', state.filterMask.cagedOverlay.referenceRoot);
  }

  return params;
}

export function searchParamsToState(
  params: URLSearchParams,
  defaultState: FretboardViewState
): FretboardViewState {
  const inst = params.get('inst') ?? defaultState.instrumentId;

  const validLens: NodeLabelMode[] = ['NOTE_NAME', 'SCALE_DEGREE', 'CHORD_INTERVAL', 'BLIND_COLOR'];
  const lensParam = params.get('lens') as NodeLabelMode;
  const labelMode = validLens.includes(lensParam) ? lensParam : defaultState.labelMode;

  // Scale Layer
  const sOn = params.has('sOn') ? params.get('sOn') === '1' : defaultState.scaleLayer.enabled;
  const sRootParam = params.get('sRoot');
  const sRoot = sRootParam !== null ? (parseInt(sRootParam, 10) as PitchClass) : defaultState.scaleLayer.rootPitchClass;
  const scale = params.get('scale') ?? defaultState.scaleLayer.scaleId;
  const flats = params.has('flats') ? params.get('flats') === '1' : defaultState.scaleLayer.preferFlats;

  const scaleLayer: ScaleLayerConfig = {
    enabled: sOn,
    rootPitchClass: (sRoot >= 0 && sRoot <= 11) ? sRoot : defaultState.scaleLayer.rootPitchClass,
    preferFlats: flats,
    scaleId: scale,
  };

  // Target Layer
  const tOn = params.has('tOn') ? params.get('tOn') === '1' : defaultState.targetLayer.enabled;
  const tRootParam = params.get('tRoot');
  const tRoot = tRootParam !== null ? (parseInt(tRootParam, 10) as PitchClass) : defaultState.targetLayer.rootPitchClass;
  const chord = params.get('chord') ?? defaultState.targetLayer.chordId;
  const invParam = params.get('inv') as TriadInversion | 'ANY';
  const roman = params.get('roman') ?? defaultState.targetLayer.diatonicRomanNumeral;

  const targetLayer: TargetLayerConfig = {
    enabled: tOn,
    rootPitchClass: (tRoot >= 0 && tRoot <= 11) ? tRoot : defaultState.targetLayer.rootPitchClass,
    chordId: chord,
    activeInversion: invParam ?? defaultState.targetLayer.activeInversion,
    diatonicRomanNumeral: roman,
  };

  // Filter Mask
  let activeStrings = defaultState.filterMask.activeStrings;
  const stringsParam = params.get('strings');
  if (stringsParam) {
    const parsed = stringsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 6);
    if (parsed.length > 0) {
      activeStrings = parsed;
    }
  }

  let fretRange = defaultState.filterMask.fretRange;
  const fretsParam = params.get('frets');
  if (fretsParam) {
    const [minStr, maxStr] = fretsParam.split('-');
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    if (!isNaN(min) && !isNaN(max) && min <= max) {
      fretRange = { min, max };
    }
  }

  let cagedOverlay = defaultState.filterMask.cagedOverlay;
  if (params.has('cagedShape')) {
    const shape = params.get('cagedShape') as CagedShapeId;
    const cagedOn = params.get('cagedOn') !== '0';
    const ref = (params.get('cagedRef') as 'SCALE_ROOT' | 'TARGET_ROOT') || 'SCALE_ROOT';
    cagedOverlay = {
      enabled: cagedOn,
      shape: shape || 'C',
      referenceRoot: ref,
    };
  }

  const filterMask: FilterMaskConfig = {
    activeStrings,
    fretRange,
    cagedOverlay,
  };

  return {
    instrumentId: inst,
    labelMode,
    scaleLayer,
    targetLayer,
    filterMask,
  };
}

export function syncStateToUrl(state: FretboardViewState): void {
  if (typeof window === 'undefined') return;
  const params = stateToSearchParams(state);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

export function loadStateFromUrl(defaultState: FretboardViewState): FretboardViewState {
  if (typeof window === 'undefined') return defaultState;
  const params = new URLSearchParams(window.location.search);
  if (Array.from(params.keys()).length === 0) return defaultState;
  return searchParamsToState(params, defaultState);
}
