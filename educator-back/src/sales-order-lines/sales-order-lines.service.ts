import { Inject, Injectable } from '@nestjs/common';
import { SALES_ORDER_LINE_REPOSITORY } from 'src/database/tokens';
import { SalesOrderLineRepository } from 'src/database/repositories';
import { RedeemCodeEntry } from 'src/common/interfaces';
import { parseSeatTokensFromSku } from 'src/common/utils/sales-order.util';

/**
 * Read path for the redeem-code sales-order-line catalog, now that sales-order-lines.json has
 * been migrated into Postgres (see
 * src/database/seeders/sales-order-lines.seeder.ts). Consumed only by
 * AuthService (src/auth/auth.service.ts `redeem()`) — no controller.
 */
@Injectable()
export class SalesOrderLinesService {
  constructor(
    @Inject(SALES_ORDER_LINE_REPOSITORY)
    private readonly salesOrderLineRepo: SalesOrderLineRepository,
  ) {}

  /**
   * Fetches every sales-order-line row matching `redeemCode` (case-insensitive,
   * trimmed — same semantics as the pre-migration blob filter) and enriches
   * each with a computed `ai_seats` (never persisted on the entity).
   */
  async getSalesOrderByRedeemCode(
    redeemCode: string,
  ): Promise<{ found: boolean; lines: RedeemCodeEntry[] }> {
    const matched = await this.salesOrderLineRepo.findByRedeemCode(redeemCode);

    const lines: RedeemCodeEntry[] = matched.map((line) => ({
      so: line.so,
      line: line.line,
      customer: line.customer,
      redeem_code: line.redeemCode,
      sku: line.sku,
      qty: line.qty,
      product_name: line.productName,
      type: line.type,
      sim_group: line.simGroup,
      category: line.category,
      platform: line.platform,
      ai: line.ai,
      hw: line.hw,
      start: line.start ? new Date(line.start).toISOString() : undefined,
      end: line.end ? new Date(line.end).toISOString() : undefined,
      ai_seats: parseSeatTokensFromSku(line.sku) * line.qty,
    }));

    return {
      found: lines.length > 0,
      lines,
    };
  }
}
