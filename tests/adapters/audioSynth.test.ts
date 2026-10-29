import { describe, expect, it } from 'vitest';
import { audioSynthAdapter } from '../../src/adapters/audioSynth';

describe('WebAudioSynth adapter', () => {
  it('exposes playSingleNote, playTriadStrum, startDrone, and stopDrone methods', () => {
    expect(typeof audioSynthAdapter.playSingleNote).toBe('function');
    expect(typeof audioSynthAdapter.playTriadStrum).toBe('function');
    expect(typeof audioSynthAdapter.startDrone).toBe('function');
    expect(typeof audioSynthAdapter.stopDrone).toBe('function');
  });

  it('safely handles playSingleNote in environments without AudioContext', () => {
    // Should not throw even in Node/jsdom without full Web Audio hardware
    expect(() => {
      audioSynthAdapter.playSingleNote(440);
    }).not.toThrow();
  });
});
