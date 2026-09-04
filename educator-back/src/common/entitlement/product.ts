/**
 * Entitlement product model — Phase 1 core logic.
 *
 * Implements the "two axes, four products" design: every simulation carries
 * exactly one MODALITY and exactly one AUDIENCE, and its PRODUCT (P1–P4) is
 * DERIVED from that pair — never stored, never inferred from editable category
 * text. See "Simulation Products and Entitlement Model" §3, §7, §9.
 *
 * This module is intentionally pure and dependency-free so it can be unit-tested
 * and wired into both the add-to-class and launch gates without pulling in Nest.
 * It does NOT touch the database or charge seats — that is Phase 2–4 work.
 */

export enum Modality {
  ONLINE = 'ONLINE',
  MANIKIN = 'MANIKIN',
}

export enum Audience {
  SECONDARY = 'SECONDARY',
  POST_SECONDARY = 'POST_SECONDARY',
}

export type ProductCode = 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Derive the product from modality + audience. Returns null (fail closed) for
 * any combination that is not one of the four valid products — callers must
 * treat null as "not launchable / not assignable", never as a default.
 */
export function deriveProduct(
  modality: Modality | null | undefined,
  audience: Audience | null | undefined,
): ProductCode | null {
  if (!modality || !audience) return null;
  if (modality === Modality.ONLINE && audience === Audience.POST_SECONDARY) return 'P1';
  if (modality === Modality.ONLINE && audience === Audience.SECONDARY) return 'P2';
  if (modality === Modality.MANIKIN && audience === Audience.POST_SECONDARY) return 'P3';
  if (modality === Modality.MANIKIN && audience === Audience.SECONDARY) return 'P4';
  return null;
}

/**
 * Parse an explicit modality flag. Fail closed on anything unrecognized — we do
 * NOT infer modality from a unit's category string (that is the current defect;
 * see spec §9). `avatarEnabled` is a scenario property and is deliberately NOT a
 * modality input — online content need not be avatar-led.
 */
export function parseModality(raw: unknown): Modality | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'online' || v === 'ai' || v === 'avatar') return Modality.ONLINE;
  if (v === 'manikin' || v === 'mannequin' || v === 'trainer' || v === 'workstation') {
    return Modality.MANIKIN;
  }
  return null;
}

/**
 * Normalize the free-text learnerLevel/audience found in the live library into a
 * single Audience enum. Covers the spellings observed on 11 Aug 2026
 * (BSN, Post-Secondary Nursing, PA/PT, High School Health Science, High School
 * Allied Health) plus safe keyword rules. Fail closed (null) on anything else —
 * a simulation with no resolvable audience must not launch (spec §3.1, §9).
 */
export function normalizeAudience(raw: unknown): Audience | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;

  // Explicit enum values (already normalized)
  if (v === 'secondary') return Audience.SECONDARY;
  if (v === 'post_secondary' || v === 'post-secondary') return Audience.POST_SECONDARY;

  // Secondary = high-school programs
  if (v.includes('high school') || v.includes('highschool') || v.startsWith('hs ')) {
    return Audience.SECONDARY;
  }

  // Post-secondary = college / nursing / allied-health professional programs
  if (
    v.includes('post-secondary') ||
    v.includes('post secondary') ||
    v.includes('postsecondary') ||
    v === 'bsn' ||
    v.includes('bsn') ||
    v.includes('nursing') ||
    v === 'pa/pt' ||
    v.includes('pa/pt') ||
    v.includes('college') ||
    v.includes('university')
  ) {
    return Audience.POST_SECONDARY;
  }

  return null; // fail closed
}

// --- Launch / assign gate messages (spec §6, §6.1) --------------------------
export const EntitlementMessages = {
  MISSING_METADATA: 'simulation is not launchable: missing modality or audience metadata',
  INVALID_COMBINATION: 'simulation is not launchable: invalid modality/audience combination',
  HARDWARE_REQUIRED: 'This simulation requires Realityworks AI hardware.',
  NO_SEAT: 'no audience-compatible seat reserved for this student',
  SEAT_EXPIRED: 'seat expired (bundle end term date reached, or 40-hour limit used)',
  audienceLicense: (required: Audience): string =>
    required === Audience.POST_SECONDARY
      ? 'This simulation requires RealityworksAI Post-Secondary license.'
      : 'This simulation requires RealityworksAI Secondary license.',
} as const;
