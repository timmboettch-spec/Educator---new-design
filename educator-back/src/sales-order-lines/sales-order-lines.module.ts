import { Module } from '@nestjs/common';
import { SalesOrderLinesService } from './sales-order-lines.service';

/**
 * No controller — this module's SalesOrderLinesService is consumed only by
 * AuthService (src/auth/auth.service.ts) during code redemption.
 * SalesOrderLineRepository is provided by the @Global() DatabaseModule.
 */
@Module({
  providers: [SalesOrderLinesService],
  exports: [SalesOrderLinesService],
})
export class SalesOrderLinesModule {}
