import onsetWorkletUrl from './onsetProcessor.worklet.ts?worker&url';
import type { OnsetWorkletCommand, OnsetWorkletMessage } from './onsetProcessor.worklet';
import { guitarPitchInput, sensitivityToGate } from '../guitarPitchInput';
import {
  ANALYSIS_FRAME_SIZE,
  analysisDecimation,
  detectPitchYin,
  downsampleByAveraging,
  frequencyToMidiFloat,
} from '../../core/pitch/yinPitchDetector';
import { RhythmGrid, Subdivision, gridInterval } from '../../core/rhythm/rhythmMath';
import { MidiNote } from '../../core/models';

/**
 * Rhythm prototype audio: metronome and microphone on ONE AudioContext, so a click's
 * scheduled time and a pluck's detected time are directly comparable.
 *
 * - Plucks are timed sample-accurately by the onset worklet.
 * - In "play" mode a pluck only counts once a pitch is confirmed shortly after it. The click
 *   is filtered noise (no pitch), so the metronome leaking into the mic can't score.
 * - In "loopback" mode every onset counts: hold the mic to the speaker and the click
 *   itself is measured, which gives the round-trip latency of the system.
 */

export type RhythmEvent =
  | { type: 'onset'; time: number; midiNote: MidiNote | null }
  | { type: 'click'; time: number; slot: number; isBeat: boolean; isDownbeat: boolean; isCountIn: boolean };

export interface MetronomeSettings {
  bpm: number;
  subdivision: Subdivision;
  beatsPerBar: number;
  countInBars: number;
  /** Audible ticks on the subdivisions, not just on the beats */
  clickSubdivisions: boolean;
}

/** Wait this long after an onset before checking it has a pitch (the pick click passes) */
const PITCH_CONFIRM_DELAY_MS = 60;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
/** Gate for the onset detector, relative to the pitch input's RMS gate */
const ONSET_GATE_FACTOR = 1.5;

export class RhythmSession {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rawFrame: Float32Array<ArrayBuffer> | null = null;
  private frame = new Float32Array(ANALYSIS_FRAME_SIZE);
  private decimation = 1;
  private noiseBuffer: AudioBuffer | null = null;
  /** All clicks go through this, so the volume can change while the metronome runs */
  private clickBus: GainNode | null = null;
  private clickVolume = 0.7;
  private listeners = new Set<(e: RhythmEvent) => void>();
  private requirePitch = true;

  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private nextClickTime = 0;
  private nextSlot = 0;
  private metronome: (MetronomeSettings & { firstSlot: number }) | null = null;

  public get isOpen(): boolean {
    return this.ctx !== null;
  }

  public onEvent(cb: (e: RhythmEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  public now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** What the browser reports about its own output delay (input delay isn't exposed) */
  public reportedOutputLatencyMs(): number | null {
    if (!this.ctx) return null;
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((this.ctx.baseLatency + out) * 1000);
  }

  /** 0 (silent) … 1 (full). Takes effect immediately, also while running. */
  public setClickVolume(volume: number): void {
    this.clickVolume = Math.min(1, Math.max(0, volume));
    if (this.clickBus && this.ctx) {
      // Squared: the slider then feels even to the ear; short ramp avoids zipper noise
      this.clickBus.gain.setTargetAtTime(this.clickVolume ** 2, this.ctx.currentTime, 0.02);
    }
  }

  public setRequirePitch(requirePitch: boolean): void {
    this.requirePitch = requirePitch;
  }

  /** Opens the mic (same device and sensitivity as the guitar input) and the worklet. */
  public async open(): Promise<void> {
    if (this.ctx) return;
    const deviceId = guitarPitchInput.getDeviceId();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioCtx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.audioWorklet.addModule(onsetWorkletUrl);

    this.source = ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(ctx, 'onset-detector', { numberOfOutputs: 1 });
    this.post({ type: 'gate', gate: sensitivityToGate(guitarPitchInput.getSensitivity()) * ONSET_GATE_FACTOR });
    this.worklet.port.onmessage = (e: MessageEvent<OnsetWorkletMessage>) => this.handleOnset(e.data.time);
    // A silent path to the speakers keeps the worklet being processed in every browser
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.worklet).connect(this.sink).connect(ctx.destination);

    this.decimation = analysisDecimation(ctx.sampleRate);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = ANALYSIS_FRAME_SIZE * this.decimation;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.rawFrame = new Float32Array(this.analyser.fftSize);

    this.clickBus = ctx.createGain();
    this.clickBus.gain.value = this.clickVolume ** 2;
    this.clickBus.connect(ctx.destination);

    this.noiseBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  public close(): void {
    this.stopMetronome();
    this.source?.disconnect();
    this.worklet?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.worklet = null;
    this.analyser = null;
    this.clickBus = null;
  }

  /** Starts the click after a short lead-in; returns the grid of the bars after the count-in. */
  public startMetronome(settings: MetronomeSettings): RhythmGrid {
    if (!this.ctx) throw new Error('Rhythm session is not open');
    this.stopMetronome();
    const startAt = this.ctx.currentTime + 0.15;
    const countInSlots = settings.countInBars * settings.beatsPerBar * settings.subdivision;
    this.metronome = { ...settings, firstSlot: -countInSlots };
    this.nextSlot = -countInSlots;
    this.nextClickTime = startAt;
    this.schedule();
    this.schedulerId = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);

    const interval = gridInterval(settings);
    return { startTime: startAt + countInSlots * interval, bpm: settings.bpm, subdivision: settings.subdivision };
  }

  public stopMetronome(): void {
    if (this.schedulerId !== null) clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.metronome = null;
  }

  // -------------------------------------------------------------------------

  private post(cmd: OnsetWorkletCommand): void {
    this.worklet?.port.postMessage(cmd);
  }

  private emit(e: RhythmEvent): void {
    this.listeners.forEach((l) => l(e));
  }

  /** Lookahead scheduler: clicks are placed on the audio clock, not on timer callbacks. */
  private schedule(): void {
    const ctx = this.ctx;
    const m = this.metronome;
    if (!ctx || !m) return;
    const interval = gridInterval(m);
    while (this.nextClickTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const slot = this.nextSlot;
      const slotsPerBar = m.beatsPerBar * m.subdivision;
      const posInBar = ((slot % slotsPerBar) + slotsPerBar) % slotsPerBar;
      const isBeat = posInBar % m.subdivision === 0;
      const isDownbeat = posInBar === 0;
      if (isBeat || m.clickSubdivisions) {
        this.playClick(this.nextClickTime, isDownbeat ? 'accent' : isBeat ? 'beat' : 'sub');
      }
      this.emit({ type: 'click', time: this.nextClickTime, slot, isBeat, isDownbeat, isCountIn: slot < 0 });
      this.nextSlot++;
      this.nextClickTime += interval;
    }
  }

  /** Short burst of band-passed noise: crisp, and deliberately without a pitch. */
  private playClick(time: number, kind: 'accent' | 'beat' | 'sub'): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.clickBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'accent' ? 2600 : kind === 'beat' ? 1900 : 3400;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    const peak = kind === 'accent' ? 0.9 : kind === 'beat' ? 0.6 : 0.25;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    src.connect(filter).connect(gain).connect(this.clickBus);
    src.start(time);
    src.stop(time + 0.03);
  }

  private handleOnset(time: number): void {
    if (!this.requirePitch) {
      this.emit({ type: 'onset', time, midiNote: null });
      return;
    }
    setTimeout(() => {
      const midiNote = this.readPitch();
      if (midiNote !== null) this.emit({ type: 'onset', time, midiNote });
    }, PITCH_CONFIRM_DELAY_MS);
  }

  private readPitch(): MidiNote | null {
    if (!this.analyser || !this.rawFrame || !this.ctx) return null;
    this.analyser.getFloatTimeDomainData(this.rawFrame);
    const frame = downsampleByAveraging(this.rawFrame, this.decimation, this.frame);
    const estimate = detectPitchYin(frame, this.ctx.sampleRate / this.decimation);
    if (!estimate || estimate.clarity < 0.8) return null;
    return Math.round(frequencyToMidiFloat(estimate.frequencyHz));
  }
}
