import { calculateAiSeats } from 'src/common/utils/ai-seats.util';
import { RoleSlug } from 'src/common/constants';
import { SubscriptionSummary } from 'src/common/types';

const makeSubscription = (overrides: Partial<SubscriptionSummary>): SubscriptionSummary =>
  ({ ai_seats: 0, seats_available: 0, ...overrides }) as SubscriptionSummary;

describe('calculateAiSeats', () => {
  describe('educator', () => {
    it('derives available directly from tokens, and total from tokens plus allocated_tokens', () => {
      const invalidatedAt = new Date('2026-01-01T00:00:00.000Z');

      expect(
        calculateAiSeats(RoleSlug.EDUCATOR, {
          educator: { tokens: 25, allocated_tokens: 10, token_invalidated_at: invalidatedAt },
        }),
      ).toEqual({ total: 35, consumed: 10, available: 25, invalidatedAt });
    });

    it('treats null token counts as zero and reports a null invalidatedAt', () => {
      expect(
        calculateAiSeats(RoleSlug.EDUCATOR, {
          educator: { tokens: null, allocated_tokens: null, token_invalidated_at: null },
        }),
      ).toEqual({ total: 0, consumed: 0, available: 0, invalidatedAt: null });
    });

    it('returns null when no educator profile is linked to the role', () => {
      expect(calculateAiSeats(RoleSlug.EDUCATOR, { educator: null })).toBeNull();
    });

    it('does not clamp when allocated_tokens exceeds tokens', () => {
      expect(
        calculateAiSeats(RoleSlug.EDUCATOR, {
          educator: { tokens: 5, allocated_tokens: 12, token_invalidated_at: null },
        }),
      ).toEqual({ total: 17, consumed: 12, available: 5, invalidatedAt: null });
    });
  });

  describe('district admin', () => {
    it('sums ai_seats for total and seats_available for available, deriving consumed', () => {
      expect(
        calculateAiSeats(RoleSlug.DISTRICT_ADMIN, {
          subscriptions: [
            makeSubscription({ ai_seats: 30, seats_available: 12 }),
            makeSubscription({ ai_seats: 20, seats_available: 3 }),
          ],
        }),
      ).toEqual({ total: 50, consumed: 35, available: 15, invalidatedAt: null });
    });

    it('returns zeroed seats when there are no subscriptions', () => {
      expect(calculateAiSeats(RoleSlug.DISTRICT_ADMIN, { subscriptions: null })).toEqual({
        total: 0,
        consumed: 0,
        available: 0,
        invalidatedAt: null,
      });
    });

    it('clamps consumed to 0 when seats_available exceeds ai_seats', () => {
      expect(
        calculateAiSeats(RoleSlug.DISTRICT_ADMIN, {
          subscriptions: [makeSubscription({ ai_seats: 10, seats_available: 15 })],
        }),
      ).toEqual({ total: 10, consumed: 0, available: 15, invalidatedAt: null });
    });
  });

  it.each([RoleSlug.STUDENT, RoleSlug.SCENARIO_ADMIN])('returns null for %s', (roleSlug) => {
    expect(calculateAiSeats(roleSlug, {})).toBeNull();
  });
});
