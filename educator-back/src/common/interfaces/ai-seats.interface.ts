import { Educator } from 'src/database/entities';
import { SubscriptionSummary } from 'src/common/types';

/**
 * AI seat usage for a single role assignment. Only educator and district-admin roles have
 * seats, so this is absent on every other role entry.
 */
export interface IAiSeats {
  total: number;
  consumed: number;
  available: number;
  invalidatedAt: Date | null;
}

/** Per-role source data `calculateAiSeats` derives `IAiSeats` from — exactly one side is set. */
export interface IAiSeatsSource {
  educator?: Pick<Educator, 'tokens' | 'allocated_tokens' | 'token_invalidated_at'> | null;
  subscriptions?: SubscriptionSummary[] | null;
}
