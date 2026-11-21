export interface WakeLockController {
  request(): Promise<boolean>;
  release(): Promise<void>;
  isSupported(): boolean;
  isActive(): boolean;
}

let activeSentinel: WakeLockSentinel | null = null;
/** Whether an active drill wants the screen kept awake (even while the request is pending). */
let desired = false;
let pendingRequest: Promise<boolean> | null = null;
let visibilityListening = false;

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * The browser drops a screen wake lock whenever the page is hidden and does not restore it.
 * Drop our reference too, so a stale sentinel cannot block the request made when the page
 * becomes visible again.
 */
async function releaseForHiddenPage(): Promise<void> {
  const sentinel = activeSentinel;
  activeSentinel = null;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // The browser may already have released it
  }
  // The page may have become visible again while the old sentinel was releasing.
  if (desired && isDocumentVisible()) void acquire();
}

function handleVisibilityChange(): void {
  if (!desired) return;
  if (!isDocumentVisible()) {
    void releaseForHiddenPage();
  } else {
    void acquire();
  }
}

function startListeningForVisibility(): void {
  if (visibilityListening || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  visibilityListening = true;
}

function stopListeningForVisibility(): void {
  if (!visibilityListening || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  visibilityListening = false;
}

async function acquire(): Promise<boolean> {
  if (!wakeLockAdapter.isSupported()) return false;
  if (activeSentinel && !activeSentinel.released) return true;
  if (pendingRequest) return pendingRequest;

  const request = (async (): Promise<boolean> => {
    try {
      const sentinel = await navigator.wakeLock.request('screen');

      // A pause/stop (or the tab becoming hidden) happened while the request was in flight.
      if (!desired || !isDocumentVisible()) {
        try {
          await sentinel.release();
        } catch {
          // Already released
        }
        return false;
      }

      activeSentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (activeSentinel === sentinel) activeSentinel = null;
        // The browser can also release a lock on its own; reacquire it if the drill still runs.
        if (desired && isDocumentVisible()) void acquire();
      });
      return true;
    } catch {
      return false;
    }
  })();

  pendingRequest = request;
  try {
    return await request;
  } finally {
    if (pendingRequest === request) pendingRequest = null;
  }
}

export const wakeLockAdapter: WakeLockController = {
  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.wakeLock &&
      typeof navigator.wakeLock.request === 'function'
    );
  },

  isActive(): boolean {
    return activeSentinel !== null && !activeSentinel.released;
  },

  async request(): Promise<boolean> {
    desired = true;
    if (!this.isSupported()) return false;
    startListeningForVisibility();
    return acquire();
  },

  async release(): Promise<void> {
    desired = false;
    stopListeningForVisibility();

    // Let an in-flight request finish, so it can't install a lock after we've released.
    if (pendingRequest) {
      try {
        await pendingRequest;
      } catch {
        // acquire() handles its own errors
      }
      // A resume happened while waiting: make sure the drill has a lock again.
      if (desired) {
        void acquire();
        return;
      }
    }

    const sentinel = activeSentinel;
    activeSentinel = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      // Sentinel may already be released
    }
  },
};
