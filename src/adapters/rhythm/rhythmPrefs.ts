/**
 * Rhythm settings kept in the browser: the latency correction per input device (every
 * interface / mic has its own) and the click volume. Shared by the Rhythm Lab and the drill.
 */

const LATENCY_BY_DEVICE_KEY = 'freternity.rhythmLatencyByDevice';
/** Prototype stored one value for all devices; still used as a fallback */
const LEGACY_LATENCY_KEY = 'freternity.rhythmLatencyMs';
const CLICK_VOLUME_KEY = 'freternity.rhythmClickVolume';
export const DEFAULT_CLICK_VOLUME = 0.7;

const deviceKey = (deviceId: string | undefined) => deviceId || 'default';

function readMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LATENCY_BY_DEVICE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Calibrated latency for this input in ms, or null if it was never calibrated. */
export function getRhythmLatency(deviceId: string | undefined): number | null {
  const stored = readMap()[deviceKey(deviceId)];
  if (typeof stored === 'number') return stored;
  try {
    const legacy = localStorage.getItem(LEGACY_LATENCY_KEY);
    return legacy !== null && Number(legacy) ? Number(legacy) : null;
  } catch {
    return null;
  }
}

export function setRhythmLatency(deviceId: string | undefined, ms: number | null): void {
  try {
    const map = readMap();
    if (ms === null) delete map[deviceKey(deviceId)];
    else map[deviceKey(deviceId)] = ms;
    localStorage.setItem(LATENCY_BY_DEVICE_KEY, JSON.stringify(map));
    localStorage.removeItem(LEGACY_LATENCY_KEY);
  } catch {
    // storage unavailable: the correction just won't be remembered
  }
}

export function getClickVolume(): number {
  try {
    const stored = localStorage.getItem(CLICK_VOLUME_KEY);
    return stored === null ? DEFAULT_CLICK_VOLUME : Math.min(1, Math.max(0, Number(stored) || 0));
  } catch {
    return DEFAULT_CLICK_VOLUME;
  }
}

export function setClickVolume(volume: number): void {
  try {
    localStorage.setItem(CLICK_VOLUME_KEY, String(volume));
  } catch {
    // per-viewer convenience only
  }
}
