/**
 * Shape of a single redeem-code sales-order-line record as consumed by the
 * redemption flow (src/auth/auth.service.ts `redeem()`) — mirrors the
 * business columns of the `SalesOrderLine` entity
 * (src/database/entities/sales-order-line.entity.ts), keeping the
 * snake_case field names of the original source JSON/blob shape (see the
 * sibling `FlatfileRecord` in src/common/types.ts). `ai_seats` is a computed
 * field enriched onto each line by SalesOrderLinesService — it is never
 * persisted on the entity itself.
 *
 * Consolidated from two duplicate declarations previously in
 * src/common/types.ts.
 */
export interface RedeemCodeEntry {
  so: string;
  line: number;
  customer: string;
  redeem_code: string;
  sku: string;
  qty: number;
  product_name?: string;
  type?: string;
  sim_group?: string;
  category?: string;
  platform?: string;
  ai?: string;
  hw?: string;
  start?: string;
  end?: string;
  /** Computed at read time from `sku`/`qty` — never persisted. */
  ai_seats?: number;
}
