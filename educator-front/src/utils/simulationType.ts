/**
 * Single source of truth for simulation type determination.
 *
 * Business rules:
 *   avatarEnabled === true  → AI Only simulation  → "AI Seats Required" badge
 *   avatarEnabled === false → Manikin simulation  → no AI badge
 *   avatarEnabled === undefined → Manikin (default) → no badge
 *
 * Display labels:
 *   avatarEnabled === true  → "AI Only"
 *   avatarEnabled === false → "Manikin"
 *   avatarEnabled === undefined → "Manikin"
 *
 * Do NOT derive simulation type from category, unit_category, or any string matching.
 */

export type SimulationType = 'AI Only' | 'Manikin' | undefined;

/**
 * Returns true only when the simulation is an AI-only simulation.
 * Use this as the single gate for all AI-related badge/label rendering.
 */
export const isAISimulation = (avatarEnabled: boolean | undefined): boolean =>
  avatarEnabled === true;

/**
 * Returns the display label for the simulation type, or undefined when unknown.
 * avatarEnabled === true  → 'AI Only'
 * avatarEnabled === false → 'Manikin'
 * avatarEnabled === undefined → undefined (hide the field)
 */
export const getSimulationTypeLabel = (
  avatarEnabled: boolean | undefined
): SimulationType => {
  if (avatarEnabled === true) return 'AI Only';
  if (avatarEnabled === false) return 'Manikin';
  return undefined;
};

/**
 * Safely reads avatarEnabled from a raw backend object.
 * Returns true/false when the field is a boolean, undefined otherwise.
 */
export const parseAvatarEnabled = (raw: unknown): boolean | undefined => {
  if (typeof raw === 'boolean') return raw;
  return undefined;
};

/**
 * Returns the display category for UI rendering.
 * avatarEnabled === true  → 'AI Only'
 * avatarEnabled === false → 'Manikin'
 * avatarEnabled === undefined → 'Manikin' (default)
 */
export const getDerivedCategory = (
  avatarEnabled: boolean | undefined
): string | undefined => {
  if (avatarEnabled === true) return 'AI Only';
  return 'Manikin';
};
