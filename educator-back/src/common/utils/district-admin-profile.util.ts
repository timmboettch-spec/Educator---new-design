import { Educator } from 'src/database/entities';

/** Resolves the admin's full name from the linked `DistrictAdmin`. */
export function resolveAdminFullName(educator: Educator): string | null {
  return educator.admin?.fullName ?? null;
}

/** Resolves the admin's profile picture from the linked `DistrictAdmin`. */
export function resolveAdminProfilePicture(educator: Educator): string | null {
  return educator.admin?.profilePicture ?? null;
}

/** Resolves the admin's license-active flag from the linked `DistrictAdmin`. */
export function resolveAdminIsLicenseActive(educator: Educator): boolean {
  return educator.admin?.isLicenseActive ?? false;
}

/** Resolves the admin's subscriptions from the linked `DistrictAdmin`. */
export function resolveAdminSubscriptions(educator: Educator): object[] | null {
  return educator.admin?.subscriptions ?? null;
}

/** Resolves the admin's underlying `users.id` — via `DistrictAdmin.userRole.userId`, since `DistrictAdmin` has no `id` of its own. */
export function resolveAdminUserId(educator: Educator): string | null {
  return educator.admin?.userRole?.userId ?? null;
}

/** Resolves the admin's email — via `DistrictAdmin.userRole.user`. */
export function resolveAdminEmail(educator: Educator): string | null {
  return educator.admin?.userRole?.user?.email ?? null;
}

/** Convenience wrapper for call sites that need more than one field at once. */
export function resolveAdminProfile(educator: Educator): {
  fullName: string | null;
  profilePicture: string | null;
  isLicenseActive: boolean;
  subscriptions: object[] | null;
} {
  return {
    fullName: resolveAdminFullName(educator),
    profilePicture: resolveAdminProfilePicture(educator),
    isLicenseActive: resolveAdminIsLicenseActive(educator),
    subscriptions: resolveAdminSubscriptions(educator),
  };
}
