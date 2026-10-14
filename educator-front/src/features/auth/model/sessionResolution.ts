/**
 * Last-resort escape hatch for session resolution.
 *
 * Every access guard renders a loader while `isResolved` is false, so a session that
 * never resolves is a permanently blank application rather than a misrouted one. The
 * two known ways that could happen are fixed at source in `SessionRestorer`, but the
 * blast radius of an unknown third is the whole product, so this bounds it.
 *
 * The same reasoning already sits in `AppRouter`'s route loader ("a stuck thunk can
 * never keep the screen blank indefinitely"); this is that safety valve applied to
 * the guard layer.
 *
 * Deliberately generous: long enough that it never fires on a merely slow profile
 * fetch, short enough that a wedged session shows *something* rather than nothing.
 */
const RESOLUTION_DEADLINE_MS = 8000;

type Listener = () => void;
const listeners = new Set<Listener>();

let elapsed = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function start(): void {
  if (timer !== null || elapsed) return;
  timer = setTimeout(() => {
    timer = null;
    elapsed = true;
    listeners.forEach((listener) => listener());
  }, RESOLUTION_DEADLINE_MS);
}

/** True once the deadline has passed without the session resolving. */
export const hasResolutionDeadlinePassed = (): boolean => elapsed;

/**
 * Started lazily on first subscribe rather than at import time, so merely importing
 * the module in a test does not leave a timer running.
 */
export const subscribeResolutionDeadline = (
  listener: Listener
): (() => void) => {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Re-arms the deadline for a new resolution cycle (e.g. a fresh LTI handoff
 * beginning). Without this, `elapsed` is a one-shot flag for the tab's entire
 * lifetime: once 8s have passed since the *first* guard ever mounted, it stays
 * `true` forever, so every later cycle reads as "deadline already passed" the
 * instant it starts — even a handoff that has been running for a few
 * milliseconds. That let a guard treat a session as resolved while an LTI
 * exchange was still swapping it out from under the app, once real usage
 * timing (almost always more than 8s after the tab opened) is accounted for.
 *
 * Call this whenever a new cycle that the deadline should bound *starts* —
 * today, that is `useSessionIdentity` on the rising edge of
 * `suppressAuthRouting` — not on every render while one is still in progress,
 * or the deadline would never get the chance to fire at all.
 */
export const restartResolutionDeadline = (): void => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const wasElapsed = elapsed;
  elapsed = false;
  if (wasElapsed) {
    listeners.forEach((listener) => listener());
  }
  start();
};

/** Test seam — resets the singleton between cases. */
export const resetResolutionDeadline = (): void => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  elapsed = false;
  listeners.clear();
};
