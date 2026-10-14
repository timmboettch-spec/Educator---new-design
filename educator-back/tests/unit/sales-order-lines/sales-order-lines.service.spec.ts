import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderLinesService } from '../../../src/sales-order-lines/sales-order-lines.service';
import { SalesOrderLineRepository } from '../../../src/database/repositories/sales-order-line.repository';
import { SALES_ORDER_LINE_REPOSITORY } from '../../../src/database/tokens';

describe('SalesOrderLinesService', () => {
  let service: SalesOrderLinesService;
  const findByRedeemCode = jest.fn();
  const salesOrderLineRepo = { findByRedeemCode };

  beforeEach(async () => {
    findByRedeemCode.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderLinesService,
        { provide: SALES_ORDER_LINE_REPOSITORY, useValue: salesOrderLineRepo },
      ],
    }).compile();

    service = module.get(SalesOrderLinesService);
  });

  describe('getSalesOrderByRedeemCode', () => {
    it('returns found:false and an empty lines array when nothing matches', async () => {
      findByRedeemCode.mockResolvedValue([]);

      const result = await service.getSalesOrderByRedeemCode('UNKNOWNCODE');

      expect(result).toEqual({ found: false, lines: [] });
      expect(findByRedeemCode).toHaveBeenCalledWith('UNKNOWNCODE');
    });

    it('maps matched rows and enriches each with computed ai_seats', async () => {
      findByRedeemCode.mockResolvedValue([
        {
          salesOrderLineId: 'uuid-1',
          so: 'SO-001',
          line: 1,
          customer: 'Acme Corp',
          redeemCode: 'ABCD1234EFGH5678',
          sku: 'HS-ONLINE-AI-SEAT-10',
          qty: 2,
          productName: 'HS Access',
          type: 'Software',
          simGroup: 'HS',
          category: 'AI Simulation',
          platform: 'Web',
          ai: 'GPT-4',
          hw: undefined,
          start: new Date('2026-01-01T00:00:00.000Z'),
          end: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getSalesOrderByRedeemCode('abcd1234efgh5678');

      expect(result.found).toBe(true);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({
        so: 'SO-001',
        line: 1,
        customer: 'Acme Corp',
        redeem_code: 'ABCD1234EFGH5678',
        sku: 'HS-ONLINE-AI-SEAT-10',
        qty: 2,
        product_name: 'HS Access',
        sim_group: 'HS',
        // AI-SEAT-10 in the SKU * qty(2) = 20
        ai_seats: 20,
      });
    });

    it('computes ai_seats as 0 when the SKU has no seat tokens', async () => {
      findByRedeemCode.mockResolvedValue([
        {
          so: 'SO-002',
          line: 1,
          customer: 'Acme Corp',
          redeemCode: 'PLAINCODE',
          sku: 'PLAIN-HARDWARE',
          qty: 3,
        },
      ]);

      const result = await service.getSalesOrderByRedeemCode('PLAINCODE');

      expect(result.lines[0].ai_seats).toBe(0);
    });
  });
});
