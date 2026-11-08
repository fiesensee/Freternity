import { FretPosition, MidiNote } from '../core/models';
import { computeRms, detectPitchYin, frequencyToMidiFloat } from '../core/pitch/yinPitchDetector';
import { NoteTracker } from '../core/pitch/noteTracker';

export type PracticeInputEvent =
  | { type: 'TIMER_EXPIRED' }
  | { type: 'USER_MANUAL_REVEAL' }
  | { type: 'USER_SELF_GRADE'; passed: boolean }
  | { type: 'PITCH_DETECTED'; midiNote: MidiNote; frequencyHz: number; clarity: number }
  | { type: 'VOICING_MATCHED'; positions: readonly FretPosition[] };

export interface PracticeInputAdapter {
  id: string;
  start(): Promise<void>;
  stop(): void;
  onEvent(callback: (event: PracticeInputEvent) => void): () => void;
}

/** Live readout for level meters / tuner-style displays. */
export interface InputMonitorSnapshot {
  /** 0..1 meter level (RMS scaled for display) */
  level: number;
  /** True when the signal is above the noise gate */
  gateOpen: boolean;
  /** Nearest semitone currently heard, or null */
  midiNote: MidiNote | null;
  /** Deviation from nearest semitone in cents (-50..50) */
  cents: number;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

const ANALYSIS_INTERVAL_MS = 15;
const STORAGE_KEY = 'freternity.guitarInput';

/** Sensitivity 1..10 → noise-gate RMS threshold (log scale, 0.04 … 0.002). */
export function sensitivityToGate(sensitivity: number): number {
  const t = (Math.min(10, Math.max(1, sensitivity)) - 1) / 9;
  return 0.04 * Math.pow(0.002 / 0.04, t);
}

interface StoredPrefs {
  deviceId?: string;
  sensitivity?: number;
}

function readPrefs(): StoredPrefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredPrefs;
  } catch {
    return {};
  }
}

function writePrefs(patch: StoredPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // storage unavailable (private mode etc.) — preferences just won't persist
  }
}

/**
 * Listens to a real guitar via microphone or audio interface and emits PITCH_DETECTED
 * events for each confirmed single-note onset (monophonic — play triads as arpeggios).
 */
export class GuitarPitchInputAdapter implements PracticeInputAdapter {
  public id = 'guitar_pitch_input_yin';

  private listeners = new Set<(event: PracticeInputEvent) => void>();
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private frame: Float32Array<ArrayBuffer> | null = null;
  private tracker = new NoteTracker();
  private mutedUntil = 0;

  private deviceId: string | undefined;
  private sensitivity: number;
  private monitor: InputMonitorSnapshot = { level: 0, gateOpen: false, midiNote: null, cents: 0 };

  constructor() {
    const prefs = typeof window !== 'undefined' ? readPrefs() : {};
    this.deviceId = prefs.deviceId;
    this.sensitivity = prefs.sensitivity ?? 6;
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  public get isRunning(): boolean {
    return this.timerId !== null;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    if (!GuitarPitchInputAdapter.isSupported()) {
      throw new Error('Audio input is not supported in this browser.');
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
        // Voice-call processing destroys sustained instrument tones — turn it all off.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // A remembered device may have been unplugged — fall back to the default input once.
      if (this.deviceId && err instanceof DOMException && err.name === 'OverconstrainedError') {
        this.deviceId = undefined;
        writePrefs({ deviceId: undefined });
        return this.start();
      }
      throw err;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.frame = new Float32Array(this.analyser.fftSize);

    this.tracker.reset();
    this.timerId = setInterval(() => this.analyse(), ANALYSIS_INTERVAL_MS);
  }

  public stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.ctx = null;
    this.monitor = { level: 0, gateOpen: false, midiNote: null, cents: 0 };
  }

  public onEvent(callback: (event: PracticeInputEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Forget the currently ringing note and ignore input briefly (e.g. at a new prompt). */
  public resetTracking(ignoreForMs = 0): void {
    this.tracker.reset();
    this.mutedUntil = performance.now() + ignoreForMs;
  }

  public getMonitorSnapshot(): InputMonitorSnapshot {
    return this.monitor;
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public setSensitivity(value: number): void {
    this.sensitivity = value;
    writePrefs({ sensitivity: value });
  }

  public getDeviceId(): string | undefined {
    return this.deviceId;
  }

  public async setDevice(deviceId: string | undefined): Promise<void> {
    this.deviceId = deviceId || undefined;
    writePrefs({ deviceId: this.deviceId });
    if (this.isRunning) {
      this.stop();
      await this.start();
    }
  }

  /** Device labels are only exposed after mic permission was granted. */
  public async listInputDevices(): Promise<AudioInputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));
  }

  private analyse(): void {
    if (!this.analyser || !this.frame || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.frame);

    const rms = computeRms(this.frame);
    const gateOpen = rms >= sensitivityToGate(this.sensitivity);
    const estimate = gateOpen ? detectPitchYin(this.frame, this.ctx.sampleRate) : null;

    let midiNote: MidiNote | null = null;
    let cents = 0;
    if (estimate) {
      const midiFloat = frequencyToMidiFloat(estimate.frequencyHz);
      midiNote = Math.round(midiFloat);
      cents = Math.round((midiFloat - midiNote) * 100);
    }
    this.monitor = { level: Math.min(1, rms * 8), gateOpen, midiNote, cents };

    const onset = this.tracker.push({
      frequencyHz: estimate?.frequencyHz ?? null,
      clarity: estimate?.clarity ?? 0,
      rms,
    });

    if (onset !== null && estimate && performance.now() >= this.mutedUntil) {
      const event: PracticeInputEvent = {
        type: 'PITCH_DETECTED',
        midiNote: onset,
        frequencyHz: estimate.frequencyHz,
        clarity: estimate.clarity,
      };
      this.listeners.forEach((listener) => listener(event));
    }
  }
}

export const guitarPitchInput = new GuitarPitchInputAdapter();
