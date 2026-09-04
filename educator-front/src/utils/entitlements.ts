import { getParsedUser } from "./storage";

/**
 * Site-wide entitlement flags derived from the signed-in admin's subscriptions.
 *
 * - `hasAvatar` — entitled to Online Avatar Simulations. When false, hide ALL
 *   seat / avatar-seat UI (columns, pills, allocate/remove fields, seat notes).
 * - `hasWorkstation` — entitled to Workstation Simulations. When false, hide ALL
 *   hardware-hours UI.
 *
 * Kept intentionally permissive: any signal of the product counts as entitled.
 */

interface SubLike {
  product_name?: string[];
  platform?: string[];
  ai_seats?: number;
  ai?: boolean[];
  hardware?: unknown;
  devices_registered?: string[];
  used_hours?: number;
  hour_cap?: number;
  hw_support_until?: string;
  [key: string]: unknown;
}

const isAvatarSub = (s: SubLike): boolean => {
  if (typeof s.ai_seats === "number" && s.ai_seats > 0) return true;
  if (Array.isArray(s.ai) && s.ai.some(Boolean)) return true;
  const names = (s.product_name ?? []).join(" ").toLowerCase();
  return /avatar|online/.test(names);
};

const isWorkstationSub = (s: SubLike): boolean => {
  if (typeof s.hardware === "string" && s.hardware.trim()) return true;
  if (Array.isArray(s.devices_registered) && s.devices_registered.length > 0) return true;
  if (typeof s.hour_cap === "number" || typeof s.used_hours === "number") return true;
  if (typeof s.hw_support_until === "string" && s.hw_support_until.trim()) return true;
  const text = [...(s.product_name ?? []), ...(s.platform ?? [])].join(" ").toLowerCase();
  return /workstation|manikin|trainer|device|hardware/.test(text);
};

export interface EntitlementFlags {
  hasAvatar: boolean;
  hasWorkstation: boolean;
}

/**
 * PROTOTYPE / PLACEHOLDER MODE.
 *
 * This is a review prototype: both avatar-seat and hardware-hours information
 * are shown everywhere (with PLACEHOLDER data where real data isn't tracked
 * yet) so the UI can be reviewed. The real, entitlement-derived gating below is
 * kept intact — set `PROTOTYPE_SHOW_ALL = false` and the FINAL version will show
 * only the information applicable to the org's actual entitlements (no avatar
 * seats without an Online Avatar product; no hardware hours without a
 * Workstation product).
 */
const PROTOTYPE_SHOW_ALL = true;

export function getEntitlementFlags(): EntitlementFlags {
  if (PROTOTYPE_SHOW_ALL) return { hasAvatar: true, hasWorkstation: true };

  const user = getParsedUser() as unknown as Record<string, unknown> | null;
  if (!user) return { hasAvatar: false, hasWorkstation: false };

  const admin = user.admin as Record<string, unknown> | undefined;
  const subs: SubLike[] = [
    ...((user.subscriptions as SubLike[]) ?? []),
    ...((admin?.subscriptions as SubLike[]) ?? []),
  ];

  let hasAvatar = subs.some(isAvatarSub);
  const hasWorkstation = subs.some(isWorkstationSub);

  // Token-based admins carry avatar seats as token fields (no avatar sub rows).
  const tokenPool =
    Number(user.total_tokens) || Number(user.allocated_tokens) || Number(user.tokens) || 0;
  if (tokenPool > 0) hasAvatar = true;

  return { hasAvatar, hasWorkstation };
}
