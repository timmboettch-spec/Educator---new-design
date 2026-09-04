/**
 * Educator "preview simulation" attempt tracking.
 *
 * An educator may preview a simulation (practice mode only) up to
 * {@link MAX_PREVIEW_ATTEMPTS} times. No report/transcript is stored server-side
 * for these previews, so the count is tracked client-side per educator + sim in
 * localStorage. This is a soft, per-browser guard (the authoritative limit, if
 * any, would be enforced by the backend when it exists).
 */

export const MAX_PREVIEW_ATTEMPTS = 3;

const storageKey = (userId: string, simId: string): string =>
  `rw_edu_preview_${userId}_${simId}`;

const readCount = (key: string): number => {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PREVIEW_ATTEMPTS) : 0;
  } catch {
    return 0;
  }
};

/** Number of preview attempts already used for this educator + simulation. */
export const getPreviewsUsed = (
  userId: string | undefined,
  simId: string | undefined,
): number => {
  if (!userId || !simId) return 0;
  return readCount(storageKey(userId, simId));
};

/** Preview attempts still available (0…MAX). */
export const getPreviewsRemaining = (
  userId: string | undefined,
  simId: string | undefined,
): number => MAX_PREVIEW_ATTEMPTS - getPreviewsUsed(userId, simId);

/**
 * Consume one preview attempt (no-op past the cap). Returns the number of
 * attempts remaining afterward.
 */
export const consumePreview = (
  userId: string | undefined,
  simId: string | undefined,
): number => {
  if (!userId || !simId) return 0;
  const key = storageKey(userId, simId);
  const used = readCount(key);
  const next = Math.min(used + 1, MAX_PREVIEW_ATTEMPTS);
  try {
    window.localStorage.setItem(key, String(next));
  } catch {
    /* storage unavailable — degrade to session-only */
  }
  return MAX_PREVIEW_ATTEMPTS - next;
};
