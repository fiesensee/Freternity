import { PitchClass } from '../core/models';

class WebAudioSynth {
  private ctx: AudioContext | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneSub: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private isDroneActive = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /**
   * Starts a warm ambient synth drone pad on the specified pitch class.
   * Drone is voiced around octave 2 / 3 for rich bass grounding.
   */
  public startDrone(rootPitchClass: PitchClass, volume: number = 0.25): void {
    const ctx = this.getContext();
    if (!ctx) return;

    this.stopDrone();

    // Base frequency for pitch class in octave 2 (MIDI note 36 + root)
    const midiBase = 36 + rootPitchClass;
    const baseFreq = 440 * Math.pow(2, (midiBase - 69) / 12);

    const now = ctx.currentTime;

    // Filter: warm 24dB/oct lowpass
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(320, now);
    this.droneFilter.Q.setValueAtTime(2.0, now);

    // Master drone gain with soft attack
    this.droneGain = ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.6);

    // Dual detuned oscillators
    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.setValueAtTime(baseFreq, now);
    this.droneOsc1.detune.setValueAtTime(-5, now);

    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.setValueAtTime(baseFreq, now);
    this.droneOsc2.detune.setValueAtTime(5, now);

    // Sub-octave sine
    this.droneSub = ctx.createOscillator();
    this.droneSub.type = 'sine';
    this.droneSub.frequency.setValueAtTime(baseFreq * 0.5, now);

    // Connect graph
    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneSub.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(ctx.destination);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
    this.droneSub.start(now);
    this.isDroneActive = true;
  }

  /**
   * Stops the active drone pad with a smooth release ramp.
   */
  public stopDrone(): void {
    if (!this.ctx || !this.isDroneActive) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.droneGain) {
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
      this.droneGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.4);
    }

    const o1 = this.droneOsc1;
    const o2 = this.droneOsc2;
    const sub = this.droneSub;

    setTimeout(() => {
      try {
        o1?.stop();
        o2?.stop();
        sub?.stop();
        o1?.disconnect();
        o2?.disconnect();
        sub?.disconnect();
      } catch {
        // Already stopped
      }
    }, 450);

    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneSub = null;
    this.droneGain = null;
    this.droneFilter = null;
    this.isDroneActive = false;
  }

  /**
   * Plays a chord / triad strummed in ascending pitch order.
   */
  public playTriadStrum(frequencies: readonly number[], strumSpeedMs: number = 70): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const sortedFreqs = [...frequencies].sort((a, b) => a - b);
    const now = ctx.currentTime;

    sortedFreqs.forEach((freq, idx) => {
      const noteTime = now + (idx * strumSpeedMs) / 1000;
      this.playPluckNote(freq, noteTime, 0.3);
    });
  }

  /**
   * Plays a single plucked guitar note immediately.
   */
  public playSingleNote(frequencyHz: number, volume: number = 0.35): void {
    const ctx = this.getContext();
    if (!ctx) return;
    this.playPluckNote(frequencyHz, ctx.currentTime, volume);
  }

  private playPluckNote(freq: number, startTime: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3.5, startTime);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.9, startTime + 0.5);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.00001, startTime + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.85);
  }
}

export const audioSynthAdapter = new WebAudioSynth();
