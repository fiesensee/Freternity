import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

class FakeWakeLockSentinel {
  released = false;
  private releaseListeners = new Set<Listener>();

  addEventListener = vi.fn((type: string, listener: Listener) => {
    if (type === 'release') this.releaseListeners.add(listener);
  });

  removeEventListener = vi.fn((type: string, listener: Listener) => {
    if (type === 'release') this.releaseListeners.delete(listener);
  });

  release = vi.fn(async () => {
    this.released = true;
    this.emitRelease();
  });

  /** Simulate the browser releasing the lock on its own (e.g. when the page is hidden). */
  browserRelease(): void {
    this.released = true;
    this.emitRelease();
  }

  private emitRelease(): void {
    for (const listener of [...this.releaseListeners]) listener();
  }
}

class FakeDocument {
  visibilityState: DocumentVisibilityState = 'visible';
  private listeners = new Set<Listener>();

  addEventListener = vi.fn((type: string, listener: Listener) => {
    if (type === 'visibilitychange') this.listeners.add(listener);
  });

  removeEventListener = vi.fn((type: string, listener: Listener) => {
    if (type === 'visibilitychange') this.listeners.delete(listener);
  });

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    for (const listener of [...this.listeners]) listener();
  }
}

function installDocument(): FakeDocument {
  const doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  return doc;
}

function installWakeLock() {
  const sentinels: FakeWakeLockSentinel[] = [];
  const request = vi.fn(async (_type: 'screen') => {
    const sentinel = new FakeWakeLockSentinel();
    sentinels.push(sentinel);
    return sentinel as unknown as WakeLockSentinel;
  });
  vi.stubGlobal('navigator', { wakeLock: { request } });
  return { request, sentinels };
}

async function loadAdapter() {
  vi.resetModules();
  return (await import('../../src/adapters/wakeLock')).wakeLockAdapter;
}

/** Let the fire-and-forget visibility handlers finish their microtasks. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wakeLockAdapter', () => {
  it('holds the screen lock and deduplicates concurrent and repeated requests', async () => {
    const wakeLock = installWakeLock();
    installDocument();
    const adapter = await loadAdapter();

    const results = await Promise.all([adapter.request(), adapter.request()]);

    expect(results).toEqual([true, true]);
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(adapter.isActive()).toBe(true);

    await expect(adapter.request()).resolves.toBe(true);
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('releases the lock on release/stop', async () => {
    const wakeLock = installWakeLock();
    installDocument();
    const adapter = await loadAdapter();

    await adapter.request();
    const sentinel = wakeLock.sentinels[0];

    await adapter.release();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(adapter.isActive()).toBe(false);

    // Releasing again is harmless.
    await expect(adapter.release()).resolves.toBeUndefined();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('reacquires the lock after the page was hidden and becomes visible again', async () => {
    const wakeLock = installWakeLock();
    const doc = installDocument();
    const adapter = await loadAdapter();

    await adapter.request();
    const firstSentinel = wakeLock.sentinels[0];

    doc.setVisibility('hidden');
    await flush();

    expect(firstSentinel.release).toHaveBeenCalledTimes(1);
    expect(adapter.isActive()).toBe(false);

    doc.setVisibility('visible');
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    expect(wakeLock.sentinels[1]).not.toBe(firstSentinel);
    expect(adapter.isActive()).toBe(true);
  });

  it('does not reacquire after the drill was stopped while the page was hidden', async () => {
    const wakeLock = installWakeLock();
    const doc = installDocument();
    const adapter = await loadAdapter();

    await adapter.request();
    doc.setVisibility('hidden');
    await flush();
    await adapter.release();

    doc.setVisibility('visible');
    await flush();

    // Only the original request; stop cleared the intent to keep the screen awake.
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(adapter.isActive()).toBe(false);
  });

  it('degrades silently when the Screen Wake Lock API is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    installDocument();
    const adapter = await loadAdapter();

    expect(adapter.isSupported()).toBe(false);
    await expect(adapter.request()).resolves.toBe(false);
    await expect(adapter.release()).resolves.toBeUndefined();
    expect(adapter.isActive()).toBe(false);
  });

  it('degrades silently when the browser rejects the request, and can retry later', async () => {
    const sentinel = new FakeWakeLockSentinel();
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('NotAllowedError'))
      .mockResolvedValueOnce(sentinel);
    vi.stubGlobal('navigator', { wakeLock: { request } });
    installDocument();
    const adapter = await loadAdapter();

    await expect(adapter.request()).resolves.toBe(false);
    expect(adapter.isActive()).toBe(false);

    await expect(adapter.request()).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(adapter.isActive()).toBe(true);
  });
});
