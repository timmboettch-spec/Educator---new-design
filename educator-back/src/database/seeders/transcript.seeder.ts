import { BlobServiceClient } from '@azure/storage-blob';
import { DataSource } from 'typeorm';
import { Transcript, SimulationV2 } from 'src/database/entities';
import { TranscriptScenarioType } from 'src/common/constants';
import { TranscriptMessage } from 'src/common/interfaces';

// Mirrors the container the blob-era data service read transcripts
// from — transcripts.json is the
// bulk blob (per-record transcripts/<id>.json blobs are not read here; the
// bulk file is the union source of truth for backfill purposes).
const AZURE_CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data';
const TRANSCRIPTS_BLOB_NAME = 'transcripts.json';

const BATCH_SIZE = 500;

export interface SourceTranscript {
  id: string;
  userId: string;
  scenarioId: string;
  messages?: TranscriptMessage[];
  startedAt: string;
  endedAt?: string;
  studentName?: string;
  studentKey?: string;
  studentClass?: string;
  loginSessionId?: string;
  scenarioType?: string;
  sessionId?: string;
  scenarioInstanceId?: string;
}

const VALID_SCENARIO_TYPES = new Set<string>(Object.values(TranscriptScenarioType));

function toScenarioType(value?: string): TranscriptScenarioType | undefined {
  return value && VALID_SCENARIO_TYPES.has(value) ? (value as TranscriptScenarioType) : undefined;
}

function toTranscriptRow(source: SourceTranscript): Partial<Transcript> {
  return {
    id: source.id,
    userId: source.userId,
    scenarioId: source.scenarioId || undefined,
    studentName: source.studentName || undefined,
    studentKey: source.studentKey || undefined,
    studentClass: source.studentClass || undefined,
    loginSessionId: source.loginSessionId || undefined,
    scenarioType: toScenarioType(source.scenarioType),
    sessionId: source.sessionId || undefined,
    scenarioInstanceId: source.scenarioInstanceId || undefined,
    messages: source.messages && source.messages.length > 0 ? source.messages : undefined,
    startedAt: source.startedAt,
    endedAt: source.endedAt || undefined,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Downloads and parses the bulk transcripts.json blob. */
async function fetchTranscriptsFromBlob(): Promise<SourceTranscript[]> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set — cannot fetch transcripts.json.');
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
  const blobClient = containerClient.getBlockBlobClient(TRANSCRIPTS_BLOB_NAME);

  const download = await blobClient.download();
  if (!download.readableStreamBody) {
    throw new Error(`Blob not found: ${TRANSCRIPTS_BLOB_NAME}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${TRANSCRIPTS_BLOB_NAME} to contain an array, got ${typeof parsed}`);
  }
  return parsed as SourceTranscript[];
}

/**
 * Imports transcripts.json from Azure Blob Storage (container "json-data" by
 * default — see AZURE_BLOB_CONTAINER_NAME) into the `transcripts` table.
 * Run-once-ever gating lives in seeders/index.ts (`seed_runs` table), not
 * here. Idempotent regardless — upserts by the business `id` column, so a
 * forced re-run updates existing rows rather than duplicating them.
 *
 * scenario_id has no DB-level FK (see transcript.entity.ts), so an unresolved
 * scenarioId doesn't block the insert — this seeder just logs how many
 * source records reference a scenarioId that doesn't exist in simulations_v2,
 * matching abc.sql's data-quality-auditing posture without silently dropping
 * data.
 */
export default async function seedTranscripts(dataSource: DataSource): Promise<void> {
  console.log(`Fetching "${TRANSCRIPTS_BLOB_NAME}" from container "${AZURE_CONTAINER_NAME}"...`);
  const sourceTranscripts = await fetchTranscriptsFromBlob();

  const simulationRepo = dataSource.getRepository(SimulationV2);
  const existingSimulations = await simulationRepo.find({ select: { id: true } });
  const knownSimulationIds = new Set(existingSimulations.map((s) => s.id));

  const orphanCount = sourceTranscripts.filter(
    (t) => t.scenarioId && !knownSimulationIds.has(t.scenarioId),
  ).length;
  if (orphanCount > 0) {
    console.log(
      `  ...${orphanCount}/${sourceTranscripts.length} transcript(s) reference a scenarioId not found in simulations_v2 (kept verbatim, no FK enforced).`,
    );
  }

  const rows = sourceTranscripts.map(toTranscriptRow);
  const batches = chunk(rows, BATCH_SIZE);
  const transcriptRepo = dataSource.getRepository(Transcript);

  console.log(
    `Importing ${rows.length} transcript(s) in ${batches.length} batch(es) of up to ${BATCH_SIZE}...`,
  );

  let imported = 0;
  for (const batch of batches) {
    await transcriptRepo.upsert(batch, {
      conflictPaths: ['id'],
      indexPredicate: 'deleted_at IS NULL', // matches UQ_transcripts_id_active's partial condition
    });
    imported += batch.length;
    console.log(`  ...${imported}/${rows.length}`);
  }

  console.log(`Transcripts import complete: ${imported} row(s) upserted from Azure Blob.`);
}
