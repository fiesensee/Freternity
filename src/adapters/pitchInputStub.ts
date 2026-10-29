import { FretPosition, MidiNote } from '../core/models';

export type PracticeInputEvent =
  | { type: 'TIMER_EXPIRED' }
  | { type: 'USER_MANUAL_REVEAL' }
  | { type: 'USER_SELF_GRADE'; passed: boolean }
  // v2.0 Audio Interface / MIDI Events:
  | { type: 'PITCH_DETECTED'; midiNote: MidiNote; frequencyHz: number; clarity: number }
  | { type: 'VOICING_MATCHED'; positions: readonly FretPosition[] };

export interface PracticeInputAdapter {
  id: string;
  start(): Promise<void>;
  stop(): void;
  onEvent(callback: (event: PracticeInputEvent) => void): () => void;
}

/**
 * v2.0 Pitch Detection / Audio Interface Stub.
 * In v1.0, this acts as a placeholder implementing the exact event interface
 * so v2.0 AudioWorklet / YIN / MPM pitch detection can slot in without refactoring.
 */
export class PitchDetectorAdapterStub implements PracticeInputAdapter {
  public id = 'pitch_detector_stub_v2';
  private listeners = new Set<(event: PracticeInputEvent) => void>();
  private active = false;

  public async start(): Promise<void> {
    this.active = true;
  }

  public stop(): void {
    this.active = false;
  }

  public onEvent(callback: (event: PracticeInputEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * For simulated or unit test event emission.
   */
  public emit(event: PracticeInputEvent): void {
    if (!this.active) return;
    this.listeners.forEach((listener) => listener(event));
  }
}

export const pitchDetectorStub = new PitchDetectorAdapterStub();
