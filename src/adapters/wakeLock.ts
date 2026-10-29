export interface WakeLockController {
  request(): Promise<boolean>;
  release(): Promise<void>;
  isSupported(): boolean;
  isActive(): boolean;
}

let activeSentinel: WakeLockSentinel | null = null;

export const wakeLockAdapter: WakeLockController = {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  },

  isActive(): boolean {
    return activeSentinel !== null;
  },

  async request(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      activeSentinel = await navigator.wakeLock.request('screen');
      activeSentinel.addEventListener('release', () => {
        activeSentinel = null;
      });
      return true;
    } catch {
      activeSentinel = null;
      return false;
    }
  },

  async release(): Promise<void> {
    if (activeSentinel) {
      try {
        await activeSentinel.release();
      } catch {
        // Sentinel may already be released
      } finally {
        activeSentinel = null;
      }
    }
  },
};
