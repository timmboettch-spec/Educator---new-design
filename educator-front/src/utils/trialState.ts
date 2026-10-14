/**
 * The "Start Trial" flag, as a subscribable store.
 *
 * The value itself lives in `sessionStorage` under `skipped_redeem`, where it has
 * always lived — this module does not change where it is kept, only how it is read.
 *
 * Two reasons it is not read inline at render time any more:
 *
 * 1. Access control is derived once, in `useSessionIdentity`, and memoised on its
 *    Redux inputs. A bare `sessionStorage.getItem` inside that memo would never be
 *    re-read, so an admin who started a trial would keep the pre-trial menu until
 *    something unrelated moved the store. Today every writer happens to follow the
 *    write with a full document reload, so the stale read is invisible — this makes
 *    the correctness independent of that coincidence.
 * 2. Touching `sessionStorage` throws rather than returning null when storage access
 *    is blocked (a Canvas third-party iframe, a locked-down private window). Every
 *    access here is guarded; the callers get `false`, which is the safe reading.
 */

const KEY = 'skipped_redeem';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Cached so `getSnapshot` is cheap and stable between notifications. */
let snapshot = read();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === 'true';
  } catch {
    // Blocked or unavailable storage — absence of a trial flag is the safe reading.
    return false;
  }
}

function notify(): void {
  const next = read();
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** True when the user chose "Start Trial" instead of redeeming a licence code. */
export const hasSkippedRedeem = (): boolean => snapshot;

/** Marks the session as a trial. Call instead of writing the key directly. */
export const markRedeemSkipped = (): void => {
  try {
    sessionStorage.setItem(KEY, 'true');
  } catch {
    // Nothing to do — the flag simply will not persist.
  }
  notify();
};

/** Clears the trial flag, e.g. once a licence is actually redeemed. */
export const clearRedeemSkipped = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
  notify();
};

/**
 * Re-reads the underlying key and notifies if it moved. For the writers that still
 * set `skipped_redeem` directly (and for `clearAuthData`), so this store cannot drift
 * from the storage it mirrors.
 */
export const refreshRedeemSkipped = (): void => notify();

export const subscribeRedeemSkipped = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
