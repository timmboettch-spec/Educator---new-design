import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DataSource } from 'typeorm';
import {
  SimulationV2,
  SimulationAction,
  SimulationGradingRubricItem,
  SimulationOrder,
  SimulationOrderLinkedAction,
  VoiceProfile,
} from 'src/database/entities';
import type { ISimulationPhase, ISimulationGrading } from 'src/common/interfaces';

// Reads scenarios from the JSON catalog container layout — one blob per scenario under
// en/scenario/. English only: es/scenario/ blobs share the same `id` values as
// their en/ counterparts, which would silently clobber rows since Simulation
// has no locale column.
const AZURE_CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data';
const SCENARIO_BLOB_PREFIX = 'en/scenario/';

interface ScenarioAction {
  id: string;
  order: number;
  title: string;
  type: string;
  typeRequirement?: string;
  isDistractor?: boolean;
  isExcluded?: boolean;
  isOptional?: boolean;
  maxAttempts?: number;
  prompt?: string;
  items?: string[];
  concepts?: Array<{ id: string; description: string; type: string }>;
  correct?: string | string[];
  categoryId?: string;
  vitals?: Record<string, string[] | boolean | undefined>;
  vitalRequirements?: Record<string, 'Mandatory' | 'Optional'>;
  vitalRequirementEntries?: Record<string, Array<'Mandatory' | 'Optional'>>;
  resultMediaType?: string;
  resultName?: string;
  resultContent?: string;
  resultMediaUrl?: string;
  resultMediaName?: string;
  limitType?: string;
  description?: string;
  idealResponse?: string;
  [key: string]: unknown;
}

interface ScenarioOrder {
  id: string;
  scenarioId?: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  systemVisibility?: string;
  description?: string;
  instructions?: string;
  startDay?: string;
  dueTime?: string;
  due?: string;
  expirationDate?: string;
  linkedActionIds?: string[];
  linkedActions?: Array<{ id: string; title: string }>;
  unlockConditions?: unknown[];
  medicationConfig?: { gradingConfig?: object; [key: string]: unknown };
  [key: string]: unknown;
}

interface ScenarioRubricItem {
  id: string;
  name: string;
  categoryType?: string;
  subCategory: string;
  weight?: number;
  scoringModel?: string;
  required?: boolean;
  evaluationSource?: string;
  description?: string;
  checklistItems?: unknown[];
  aiMapping?: { aiCheckId?: string; aiDescription?: string; aiPromptParameter?: string };
  communicationCriteria?: Array<{
    id: string;
    title: string;
    prompt: string;
    enabled?: boolean;
    order?: number;
  }>;
  learningObjectiveId?: string;
  patientDataFields?: unknown[];
  vitalsFields?: unknown[];
  expectedActions?: object;
  medications?: unknown[];
  communicationSummaryPrompt?: string;
  [key: string]: unknown;
}

interface Scenario {
  id: string;
  title: string;
  unitId?: string;
  difficulty?: string;
  department?: string;
  class?: string;
  learnerLevel?: string;
  description?: string;
  learningObjective?: string;
  learningObjectiveCard?: string;
  status?: string;
  parent_scenario_id?: string;
  version_number?: number;
  avatarEnabled?: boolean;
  avatarId?: string;
  /** Looked up against `voice_profiles` before being written — see `resolveSeededVoiceProfileId`. */
  voiceProfileId?: string;
  contextId?: string;
  language?: string;
  voice?: string;
  actionGroupName?: string;
  actionGroupDescription?: string;
  requiresProductSetup?: boolean;
  scenarioImage?: string;
  patientChartMode?: string;
  enableStudentBriefing?: boolean;
  simulationStartTime?: string;
  estimatedDuration?: string;
  additionalEquipment?: string;
  optionalEquipment?: string;
  setupNotes?: string;
  topicsAddressed?: string;
  prebriefScriptPdf?: string;
  debriefPointsPdf?: string;
  setupNotesPdf?: string;
  facilitationNotesPdf?: string;
  printableSbarPdf?: string;
  printablePatientChartPdf?: string;
  sequenceGroupsOrderMode?: string;
  conversationResponses?: unknown[];
  patientData?: object;
  aiPatientData?: object;
  expectedActions?: object;
  phases?: object;
  availableMedications?: object;
  studentBriefing?: object;
  sbar?: object;
  grading?: { rubric?: ScenarioRubricItem[]; [key: string]: unknown };
  metadata?: object;
  productSetup?: object;
  orthopedicWorksheet?: object;
  timeline?: object;
  sequences?: unknown[];
  sequenceGroups?: unknown[];
  teamCommunication?: object;
  actions?: ScenarioAction[];
  orders?: ScenarioOrder[];
}

/** Lists every scenario blob name under the prefix in one pass — no content is downloaded yet. */
async function listScenarioBlobNames(containerClient: ContainerClient): Promise<string[]> {
  const names: string[] = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix: SCENARIO_BLOB_PREFIX })) {
    if (blob.name.endsWith('.json')) names.push(blob.name);
  }
  return names;
}

/** Downloads and parses a single scenario blob's content. */
async function readScenarioBlob(
  containerClient: ContainerClient,
  blobName: string,
): Promise<Scenario | null> {
  try {
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const download = await blobClient.download();
    if (!download.readableStreamBody) return null;

    const chunks: Buffer[] = [];
    for await (const chunk of download.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Scenario;
  } catch (error) {
    console.error(
      `  ...failed to read/parse blob "${blobName}": ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function toSimulationRow(scenario: Scenario): Partial<SimulationV2> {
  const grading = scenario.grading ? { ...scenario.grading } : undefined;
  if (grading) delete grading.rubric;

  return {
    id: scenario.id,
    title: scenario.title,
    unitId: scenario.unitId,
    difficulty: scenario.difficulty,
    department: scenario.department,
    class: scenario.class,
    learnerLevel: scenario.learnerLevel,
    description: scenario.description,
    learningObjective: scenario.learningObjective,
    learningObjectiveCard: scenario.learningObjectiveCard,
    status: scenario.status,
    parentScenarioId: scenario.parent_scenario_id,
    versionNumber: scenario.version_number,
    avatarEnabled: scenario.avatarEnabled ?? false,
    avatarId: scenario.avatarId,
    // Resolved (and possibly nulled) by the caller — see resolveSeededVoiceProfileId.
    voiceProfileId: scenario.voiceProfileId,
    contextId: scenario.contextId,
    language: scenario.language,
    voice: scenario.voice,
    actionGroupName: scenario.actionGroupName,
    actionGroupDescription: scenario.actionGroupDescription,
    requiresProductSetup: scenario.requiresProductSetup ?? false,
    scenarioImage: scenario.scenarioImage,
    patientChartMode: scenario.patientChartMode,
    enableStudentBriefing: scenario.enableStudentBriefing ?? false,
    simulationStartTime: scenario.simulationStartTime,
    estimatedDuration: scenario.estimatedDuration,
    additionalEquipment: scenario.additionalEquipment,
    optionalEquipment: scenario.optionalEquipment,
    setupNotes: scenario.setupNotes,
    topicsAddressed: scenario.topicsAddressed,
    prebriefScriptPdf: scenario.prebriefScriptPdf,
    debriefPointsPdf: scenario.debriefPointsPdf,
    setupNotesPdf: scenario.setupNotesPdf,
    facilitationNotesPdf: scenario.facilitationNotesPdf,
    printableSbarPdf: scenario.printableSbarPdf,
    printablePatientChartPdf: scenario.printablePatientChartPdf,
    sequenceGroupsOrderMode: scenario.sequenceGroupsOrderMode,
    conversationResponses: scenario.conversationResponses,
    patientData: scenario.patientData,
    aiPatientData: scenario.aiPatientData,
    expectedActions: scenario.expectedActions,
    phases: scenario.phases as ISimulationPhase[] | undefined,
    availableMedications: scenario.availableMedications,
    studentBriefing: scenario.studentBriefing,
    sbar: scenario.sbar,
    grading: grading as ISimulationGrading | undefined,
    metadata: scenario.metadata,
    productSetup: scenario.productSetup,
    orthopedicWorksheet: scenario.orthopedicWorksheet,
    timeline: scenario.timeline,
    sequences: scenario.sequences,
    sequenceGroups: scenario.sequenceGroups,
    teamCommunication: scenario.teamCommunication,
  };
}

/** `simulationId` is the parent simulation's surrogate UUID (simulations_v2.simulation_id), not its business `id`. */
function toActionRows(scenario: Scenario, simulationId: string): Partial<SimulationAction>[] {
  return (scenario.actions ?? [])
    .filter((action) => action.id && action.type)
    .map((action) => ({
      id: action.id,
      simulationId,
      order: action.order,
      title: action.title,
      type: action.type,
      typeRequirement: action.typeRequirement,
      isDistractor: action.isDistractor ?? false,
      isExcluded: action.isExcluded ?? false,
      isOptional: action.isOptional ?? false,
      maxAttempts: action.maxAttempts,
      prompt: action.prompt,
      items: action.items,
      concepts: action.concepts,
      correct: action.correct,
      categoryId: action.categoryId,
      vitals: action.vitals,
      vitalRequirements: action.vitalRequirements,
      vitalRequirementEntries: action.vitalRequirementEntries,
      resultMediaType: action.resultMediaType,
      resultName: action.resultName,
      resultContent: action.resultContent,
      resultMediaUrl: action.resultMediaUrl,
      resultMediaName: action.resultMediaName,
      limitType: action.limitType,
      description: action.description,
      idealResponse: action.idealResponse,
    }));
}

/** `simulationId` is the parent simulation's surrogate UUID (simulations_v2.simulation_id), not its business `id`. */
function toOrderRows(scenario: Scenario, simulationId: string): Partial<SimulationOrder>[] {
  return (scenario.orders ?? [])
    .filter((order) => order.id)
    .map((order) => {
      return {
        id: order.id,
        simulationId,
        title: order.title,
        category: order.category ?? '',
        priority: order.priority ?? '',
        orderStatus: order.status ?? '',
        startDay: order.startDay,
        dueTime: order.dueTime,
        expirationOffset: order.expirationDate,
        dueDate: order.due,
        medicationConfig: order.medicationConfig,
        scenarioId: order.scenarioId,
        systemVisibility: order.systemVisibility,
        description: order.description,
        instructions: order.instructions,
        linkedActionIds: order.linkedActionIds,
        linkedActionsDetail: order.linkedActions,
        unlockConditions: order.unlockConditions,
      };
    });
}

/** `simulationId` is the parent simulation's surrogate UUID (simulations_v2.simulation_id), not its business `id`. */
function toRubricRows(
  scenario: Scenario,
  simulationId: string,
): Partial<SimulationGradingRubricItem>[] {
  return (scenario.grading?.rubric ?? [])
    .filter((item) => item.id && item.subCategory)
    .map((item) => ({
      id: item.id,
      simulationId,
      name: item.name,
      categoryType: item.categoryType,
      subCategory: item.subCategory,
      weight: item.weight,
      scoringModel: item.scoringModel,
      required: item.required ?? false,
      evaluationSource: item.evaluationSource,
      description: item.description,
      checklistItems: item.checklistItems,
      aiMapping: item.aiMapping,
      communicationCriteria: item.communicationCriteria,
      learningObjectiveId: item.learningObjectiveId,
      patientDataFields: item.patientDataFields,
      vitalsFields: item.vitalsFields,
      expectedActions: item.expectedActions,
      medications: item.medications,
      communicationSummaryPrompt: item.communicationSummaryPrompt,
    }));
}

/**
 * Resolves a scenario JSON's `voiceProfileId` against the `voice_profiles`
 * table: kept only if that row exists, otherwise nulled with a console
 * notice (never seeded/defaulted — an unknown id is simply dropped).
 */
export async function resolveSeededVoiceProfileId(
  voiceProfileRepo: import('typeorm').Repository<VoiceProfile>,
  scenario: Scenario,
): Promise<string | undefined> {
  if (!scenario.voiceProfileId) return undefined;
  const exists = await voiceProfileRepo.exists({
    where: { voiceProfileId: scenario.voiceProfileId },
  });
  if (!exists) {
    console.log(
      `  ...scenario "${scenario.id}": voiceProfileId "${scenario.voiceProfileId}" not found in voice_profiles — clearing to null`,
    );
    return undefined;
  }
  return scenario.voiceProfileId;
}

/**
 * Imports scenarios from Azure Blob Storage into `simulations_v2` and its child
 * tables (`simulation_actions`, `simulation_orders`,
 * `simulation_order_linked_actions`, `simulation_grading_rubric_items`).
 *
 * Run-once-ever gating lives in seeders/index.ts (`seed_runs` table), not
 * here — this import is too expensive (300+ sequential blob fetches) to
 * repeat on every container boot/scale-out.
 *
 * Deliberately not batched/parallelized, per how this needs to run against
 * blob storage: blob **names** are listed in one pass (`listScenarioBlobNames`),
 * then each scenario's **details** are fetched one at a time
 * (`readScenarioBlob`), and each resulting **record is written to the database
 * one at a time** — one scenario fully imported (simulation row + its actions/
 * orders/links/rubric items) before the next blob is even read. Idempotent
 * regardless — every write upserts by that table's business `id` column, so
 * a forced re-run updates existing rows rather than duplicating them.
 */
export default async function seedSimulations(dataSource: DataSource): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    console.log('AZURE_STORAGE_CONNECTION_STRING is not set — skipping simulation seeding.');
    return;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);

  console.log(
    `Listing scenario blobs under "${SCENARIO_BLOB_PREFIX}" in container "${AZURE_CONTAINER_NAME}"...`,
  );
  const blobNames = await listScenarioBlobNames(containerClient);
  console.log(`Found ${blobNames.length} scenario blob(s). Importing one at a time...`);

  const simulationRepo = dataSource.getRepository(SimulationV2);
  const actionRepo = dataSource.getRepository(SimulationAction);
  const orderRepo = dataSource.getRepository(SimulationOrder);
  const orderLinkedActionRepo = dataSource.getRepository(SimulationOrderLinkedAction);
  const rubricRepo = dataSource.getRepository(SimulationGradingRubricItem);
  const voiceProfileRepo = dataSource.getRepository(VoiceProfile);

  let imported = 0;
  let skippedRows = 0;
  let totalActions = 0;
  let totalOrders = 0;
  const failedScenarios: string[] = [];

  for (const blobName of blobNames) {
    const scenario = await readScenarioBlob(containerClient, blobName);
    if (!scenario?.id) {
      console.log(`  ...skipping "${blobName}": not a valid scenario document`);
      failedScenarios.push(blobName);
      continue;
    }

    totalActions += scenario.actions?.length ?? 0;
    totalOrders += scenario.orders?.length ?? 0;

    try {
      const row = toSimulationRow(scenario);
      row.voiceProfileId = await resolveSeededVoiceProfileId(voiceProfileRepo, scenario);
      await simulationRepo.upsert([row], {
        conflictPaths: ['id'],
        indexPredicate: 'deleted_at IS NULL', // matches UQ_units_id_active's partial condition
      });

      // Child tables FK against the surrogate simulation_id, not the business id
      // just upserted above — resolve it now that the row is guaranteed to exist.
      const simulation = await simulationRepo.findOneOrFail({ where: { id: scenario.id } });
      const simulationId = simulation.simulationId;

      for (const actionRow of toActionRows(scenario, simulationId)) {
        try {
          await actionRepo.upsert([actionRow], {
            conflictPaths: ['id', 'simulationId'],
            indexPredicate: 'deleted_at IS NULL', // matches simulation_actions_id_simulation_id_unique_active's partial condition
          });
        } catch (error) {
          skippedRows++;
          console.error(
            `      ...action "${actionRow.id}" rejected by the database: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      for (const orderRow of toOrderRows(scenario, simulationId)) {
        try {
          await orderRepo.upsert([orderRow], {
            conflictPaths: ['id', 'simulationId'],
          });
        } catch (error) {
          skippedRows++;
          console.error(
            `      ...order "${orderRow.id}" rejected by the database: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      for (const rubricRow of toRubricRows(scenario, simulationId)) {
        try {
          await rubricRepo.upsert([rubricRow], { conflictPaths: ['id', 'simulationId'] });
        } catch (error) {
          skippedRows++;
          console.error(
            `      ...rubric item "${rubricRow.id}" rejected by the database: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // simulation_order_linked_actions — resolve business ids to surrogate keys
      // now that both sides have been upserted above (skipped rows above just
      // won't have a match here, which is fine — findOne returns null for them).
      for (const order of scenario.orders ?? []) {
        const orderRow = await orderRepo.findOne({
          where: { id: order.id, simulationId },
        });
        if (!orderRow) continue;

        for (const linkedActionId of order.linkedActionIds ?? []) {
          const actionRow = await actionRepo.findOne({ where: { id: linkedActionId } });
          if (!actionRow) continue;

          await orderLinkedActionRepo.upsert(
            [{ orderId: orderRow.orderId, actionId: actionRow.actionId }],
            { conflictPaths: ['orderId', 'actionId'] },
          );
        }
      }

      imported++;
      console.log(`  ...(${imported}/${blobNames.length}) imported "${scenario.id}" (${blobName})`);
    } catch (error) {
      failedScenarios.push(scenario.id);
      console.error(
        `  ...failed to import "${scenario.id}" (${blobName}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `Simulations import complete: ${imported}/${blobNames.length} scenario(s) upserted from Azure Blob ` +
      `(${skippedRows} child row(s) skipped, ${failedScenarios.length} scenario(s) failed entirely` +
      `${failedScenarios.length > 0 ? `: ${failedScenarios.join(', ')}` : ''}).`,
  );
  console.log(
    `Blob content summary: ${totalActions} total action(s), ${totalOrders} total order(s) found across ${blobNames.length} scenario blob(s).`,
  );
}
