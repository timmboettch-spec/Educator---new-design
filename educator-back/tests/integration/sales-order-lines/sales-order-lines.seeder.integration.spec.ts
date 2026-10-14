import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { SalesOrderLine } from '../../../src/database/entities';

/**
 * Integration test for the sales-order-lines seeder
 * (src/database/seeders/sales-order-lines.seeder.ts), against a real
 * Postgres instance configured via this repo's .env (same DB the app's own
 * migrations run against). Mocks only the Azure Blob client — everything
 * else (the DataSource, the `sales_order_lines` table, the upsert) is real,
 * verifying the seeder's core idempotent-upsert-on-(so,line) behavior.
 */
jest.mock('@azure/storage-blob', () => {
  const makeDownloadResponse = (rows: unknown[]) => {
    const body = Buffer.from(JSON.stringify(rows), 'utf-8');
    return {
      readableStreamBody: (async function* () {
        yield body;
      })(),
    };
  };

  return {
    BlobServiceClient: {
      fromConnectionString: jest.fn().mockReturnValue({
        getContainerClient: jest.fn().mockReturnValue({
          getBlockBlobClient: jest.fn().mockReturnValue({
            download: jest.fn().mockImplementation(() => Promise.resolve(makeDownloadResponse(mockSourceRows))),
          }),
        }),
      }),
    },
  };
});

let mockSourceRows: Array<Record<string, unknown>> = [];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const seedSalesOrderLines = require('../../../src/database/seeders/sales-order-lines.seeder').default as (
  dataSource: DataSource,
) => Promise<void>;

const hasDbConfig = Boolean(
  process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME,
);

// CI integration job has no Postgres — skip until deploy-backend.yml wires a DB service.
const describeWithDb = hasDbConfig ? describe : describe.skip;

describeWithDb('sales-order-lines seeder (Integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  afterEach(async () => {
    // Clean up rows this suite created, scoped by a distinctive SO prefix so
    // it never touches unrelated data.
    await dataSource.query(`DELETE FROM sales_order_lines WHERE so LIKE 'SEEDER-TEST-%'`);
  });

  it('inserts new rows from the blob', async () => {
    mockSourceRows = [
      {
        so: 'SEEDER-TEST-001',
        line: 1,
        customer: 'Integration Test Corp',
        redeem_code: 'SEEDERTEST0001',
        sku: 'HS-ONLINE-AI-SEAT-5',
        qty: 2,
        product_name: 'HS Access',
        sim_group: 'HS',
      },
    ];

    await seedSalesOrderLines(dataSource);

    const rows = await dataSource.getRepository(SalesOrderLine).find({
      where: { so: 'SEEDER-TEST-001' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      so: 'SEEDER-TEST-001',
      line: 1,
      redeemCode: 'SEEDERTEST0001',
      qty: 2,
    });
  });

  it('is idempotent — re-running with the same (so, line) updates rather than duplicates', async () => {
    mockSourceRows = [
      {
        so: 'SEEDER-TEST-002',
        line: 1,
        customer: 'Integration Test Corp',
        redeem_code: 'SEEDERTEST0002',
        sku: 'HS-ONLINE-AI-SEAT-5',
        qty: 1,
      },
    ];
    await seedSalesOrderLines(dataSource);

    // Re-run with the same (so, line) but a changed qty/customer.
    mockSourceRows = [
      {
        so: 'SEEDER-TEST-002',
        line: 1,
        customer: 'Updated Corp',
        redeem_code: 'SEEDERTEST0002',
        sku: 'HS-ONLINE-AI-SEAT-5',
        qty: 9,
      },
    ];
    await seedSalesOrderLines(dataSource);

    const rows = await dataSource.getRepository(SalesOrderLine).find({
      where: { so: 'SEEDER-TEST-002' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(9);
    expect(rows[0].customer).toBe('Updated Corp');
  });
});
