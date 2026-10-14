import { BlobServiceClient } from '@azure/storage-blob';
import { DataSource } from 'typeorm';
import { SalesOrderLine } from 'src/database/entities';

// Reads from the JSON catalog container — sales-order-lines.json is a
// single bulk blob, same shape as units.json.
const AZURE_CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data';
const SALES_ORDER_LINES_BLOB_NAME = 'sales-order-lines.json';

const BATCH_SIZE = 500;

/** Raw shape of a single line in sales-order-lines.json, per the pre-migration blob read. */
export interface SourceSalesOrderLine {
  so: string;
  line: number;
  customer: string;
  redeem_code: string;
  sku: string;
  qty: number;
  product_name?: string;
  type?: string;
  sim_group?: string | null;
  category?: string;
  platform?: string;
  ai?: string;
  hw?: string;
  start?: string;
  end?: string;
}

function toDateOrUndefined(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toSalesOrderLineRow(source: SourceSalesOrderLine): Partial<SalesOrderLine> {
  return {
    so: source.so,
    line: Number(source.line),
    customer: source.customer,
    redeemCode: source.redeem_code,
    sku: source.sku,
    qty: Number(source.qty),
    productName: source.product_name || undefined,
    type: source.type || undefined,
    simGroup: source.sim_group || undefined,
    category: source.category || undefined,
    platform: source.platform || undefined,
    ai: source.ai || undefined,
    hw: source.hw || undefined,
    start: toDateOrUndefined(source.start),
    end: toDateOrUndefined(source.end),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Downloads and parses the bulk sales-order-lines.json blob. */
async function fetchSalesOrderLinesFromBlob(): Promise<SourceSalesOrderLine[]> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING is not set — cannot fetch sales-order-lines.json.',
    );
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
  const blobClient = containerClient.getBlockBlobClient(SALES_ORDER_LINES_BLOB_NAME);

  const download = await blobClient.download();
  if (!download.readableStreamBody) {
    throw new Error(`Blob not found: ${SALES_ORDER_LINES_BLOB_NAME}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Expected ${SALES_ORDER_LINES_BLOB_NAME} to contain an array, got ${typeof parsed}`,
    );
  }
  return parsed as SourceSalesOrderLine[];
}

/**
 * Imports sales-order-lines.json from Azure Blob Storage (container
 * "json-data" by default — see AZURE_BLOB_CONTAINER_NAME) into the
 * `sales_order_lines` table.
 * Run-once-ever gating lives in seeders/index.ts (`seed_runs` table), not
 * here. Idempotent regardless — upserts by the natural (so, line) key, so a
 * forced re-run updates existing rows rather than duplicating them.
 * `salesOrderLineId` (the UUID PK) and timestamps are left untouched on
 * update since they aren't part of the source document.
 *
 * Logs (never throws) a comparison of blob row count vs. successfully
 * upserted row count at the end, so a seeding shortfall is visible without
 * blocking boot.
 */
export default async function seedSalesOrderLines(dataSource: DataSource): Promise<void> {
  console.log(
    `Fetching "${SALES_ORDER_LINES_BLOB_NAME}" from container "${AZURE_CONTAINER_NAME}"...`,
  );
  const sourceLines = await fetchSalesOrderLinesFromBlob();

  const rows = sourceLines.map(toSalesOrderLineRow);
  const batches = chunk(rows, BATCH_SIZE);
  const salesOrderLineRepo = dataSource.getRepository(SalesOrderLine);

  console.log(
    `Importing ${rows.length} sales order line(s) in ${batches.length} batch(es) of up to ${BATCH_SIZE}...`,
  );

  let imported = 0;
  for (const batch of batches) {
    try {
      await salesOrderLineRepo.upsert(batch, {
        conflictPaths: ['so', 'line'],
        indexPredicate: 'deleted_at IS NULL', // matches UQ_sales_order_lines_so_line_active's partial condition
      });
      imported += batch.length;
      console.log(`  ...${imported}/${rows.length}`);
    } catch (error) {
      console.error(
        `Error upserting a batch of sales order lines: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (imported < rows.length) {
    console.warn(
      `Sales order lines import shortfall: only ${imported}/${rows.length} row(s) upserted from Azure Blob.`,
    );
  } else {
    console.info(`Sales order lines import complete: ${imported} row(s) upserted from Azure Blob.`);
  }
}
