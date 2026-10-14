import { RoleSlug } from 'src/common/constants';
import { IAiSeats, IAiSeatsSource } from 'src/common/interfaces';

/**
 * Single source of truth for the `aiSeats` block on auth responses (login / `GET /auth/me`).
 *
 * The two roles that own seats derive them from opposite directions, and that asymmetry is
 * deliberate rather than a by-product of shared arithmetic:
 *  - Educator: `tokens` is what they currently have available and `allocated_tokens` is what
 *    they've already consumed, so `total` is the sum of the two.
 *  - District admin: each subscription reports its own remaining `seats_available`, so that sum
 *    is authoritative for `available` and `consumed` is whatever the purchased `ai_seats` total
 *    no longer covers.
 *
 * Any other role has no seat concept — returns `null` so the field can simply be omitted.
 */
export function calculateAiSeats(
  roleSlug: RoleSlug | string,
  source: IAiSeatsSource,
): IAiSeats | null {
  if (roleSlug === (RoleSlug.EDUCATOR as string)) {
    const educator = source.educator;
    if (!educator) {
      return null;
    }

    const available = Number(educator.tokens ?? 0);
    const consumed = Number(educator.allocated_tokens ?? 0);

    return {
      total: available + consumed,
      consumed,
      available,
      invalidatedAt: educator.token_invalidated_at ?? null,
    };
  }

  if (roleSlug === (RoleSlug.DISTRICT_ADMIN as string)) {
    const subscriptions = source.subscriptions ?? [];

    const { total, available } = subscriptions.reduce(
      (acc, sub) => ({
        total: acc.total + Number(sub?.ai_seats ?? 0),
        available: acc.available + Number(sub?.seats_available ?? 0),
      }),
      { total: 0, available: 0 },
    );

    return {
      total,
      available,
      consumed: Math.max(total - available, 0),
      // Seat invalidation is tracked per educator only — a district admin never carries one.
      invalidatedAt: null,
    };
  }

  return null;
}
