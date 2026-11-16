/**
 * AudioWorklet that runs the onset detector on the raw mic signal, sample by sample, and
 * posts each pluck's exact time on the AudioContext clock (the same clock the metronome
 * is scheduled on).
 */
import { OnsetDetector } from '../../core/rhythm/onsetDetector';

// AudioWorkletGlobalScope (not part of the DOM typings)
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export type OnsetWorkletMessage = { type: 'onset'; time: number };
export type OnsetWorkletCommand = { type: 'gate'; gate: number };

class OnsetProcessor extends AudioWorkletProcessor {
  private detector = new OnsetDetector({ sampleRate });
  private processed = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<OnsetWorkletCommand>) => {
      if (e.data.type === 'gate') this.detector.setGate(e.data.gate);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      const chunkStart = this.processed;
      for (const index of this.detector.process(channel)) {
        const time = (currentFrame + (index - chunkStart)) / sampleRate;
        this.port.postMessage({ type: 'onset', time } satisfies OnsetWorkletMessage);
      }
      this.processed += channel.length;
    }
    return true;
  }
}

registerProcessor('onset-detector', OnsetProcessor);
