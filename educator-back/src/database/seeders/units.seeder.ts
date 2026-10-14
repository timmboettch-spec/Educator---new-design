import { BlobServiceClient } from '@azure/storage-blob';
import { DataSource } from 'typeorm';
import { Unit } from 'src/database/entities';
import { UnitCategory } from 'src/common/constants';

// Reads units from the JSON catalog container — units.json is a single bulk
// blob (unlike scenarios, there's no per-unit blob folder).
const AZURE_CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data';
const UNITS_BLOB_NAME = 'units.json';

const BATCH_SIZE = 500;

export interface SourceUnit {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  actions?: unknown[];
  actionGroupName?: string;
  actionGroupDescription?: string;
}

const VALID_UNIT_CATEGORIES = new Set<string>(Object.values(UnitCategory));

function toUnitCategory(value?: string): UnitCategory | undefined {
  return value && VALID_UNIT_CATEGORIES.has(value) ? (value as UnitCategory) : undefined;
}

function toUnitRow(source: SourceUnit): Partial<Unit> {
  return {
    id: source.id,
    name: source.name,
    description: source.description || undefined,
    imageUrl: source.imageUrl || undefined,
    category: toUnitCategory(source.category),
    actions: source.actions && source.actions.length > 0 ? source.actions : undefined,
    actionGroupName: source.actionGroupName || undefined,
    actionGroupDescription: source.actionGroupDescription || undefined,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Downloads and parses the bulk units.json blob. */
async function fetchUnitsFromBlob(): Promise<SourceUnit[]> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set — cannot fetch units.json.');
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
  const blobClient = containerClient.getBlockBlobClient(UNITS_BLOB_NAME);

  const download = await blobClient.download();
  if (!download.readableStreamBody) {
    throw new Error(`Blob not found: ${UNITS_BLOB_NAME}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${UNITS_BLOB_NAME} to contain an array, got ${typeof parsed}`);
  }
  return parsed as SourceUnit[];
}

/**
 * Imports units.json from Azure Blob Storage (container "json-data" by
 * default — see AZURE_BLOB_CONTAINER_NAME) into the `units` table.
 * Run-once-ever gating lives in seeders/index.ts (`seed_runs` table), not
 * here. Idempotent regardless — upserts by the business `id` column, so a
 * forced re-run updates existing rows rather than duplicating them. `unitId`
 * (the UUID PK) and timestamps are left untouched on update since they
 * aren't part of the source document.
 */
export default async function seedUnits(dataSource: DataSource): Promise<void> {
  console.log(`Fetching "${UNITS_BLOB_NAME}" from container "${AZURE_CONTAINER_NAME}"...`);
  const sourceUnits = await fetchUnitsFromBlob();

  const rows = sourceUnits.map(toUnitRow);
  const batches = chunk(rows, BATCH_SIZE);
  const unitRepo = dataSource.getRepository(Unit);

  console.log(
    `Importing ${rows.length} unit(s) in ${batches.length} batch(es) of up to ${BATCH_SIZE}...`,
  );

  let imported = 0;
  for (const batch of batches) {
    await unitRepo.upsert(batch, {
      conflictPaths: ['id'],
      indexPredicate: 'deleted_at IS NULL', // matches UQ_units_id_active's partial condition
    });
    imported += batch.length;
    console.log(`  ...${imported}/${rows.length}`);
  }

  console.log(`Units import complete: ${imported} row(s) upserted from Azure Blob.`);
}
