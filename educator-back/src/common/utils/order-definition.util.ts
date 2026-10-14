import { SimulationOrder } from 'src/database/entities';
import { OrderDefinition } from 'src/common/interfaces';

type OrderConfigKey =
  | 'medicationConfig'
  | 'dietConfig'
  | 'labConfig'
  | 'nursingConfig'
  | 'referralConfig'
  | 'imagingConfig'
  | 'procedureConfig'
  | 'therapyConfig'
  | 'otherConfig'
  | 'clinicalAssessmentConfig'
  | 'communicationConfig'
  | 'ethicsSafetyConfig'
  | 'careActivitiesConfig'
  | 'technicalSkillsConfig';

/** Maps an order's `category` to the category-specific config field OrderDefinition expects. */
const CATEGORY_CONFIG_KEY: Record<string, OrderConfigKey> = {
  Medication: 'medicationConfig',
  Diet: 'dietConfig',
  Lab: 'labConfig',
  Nursing: 'nursingConfig',
  Referral: 'referralConfig',
  Referrals: 'referralConfig',
  Imaging: 'imagingConfig',
  Procedure: 'procedureConfig',
  Therapy: 'therapyConfig',
  'Clinical Assessment': 'clinicalAssessmentConfig',
  Communication: 'communicationConfig',
  'Ethics & Safety': 'ethicsSafetyConfig',
  'Ethics/Safety': 'ethicsSafetyConfig',
  'Care Activities': 'careActivitiesConfig',
  'Technical Skills': 'technicalSkillsConfig',
};

/**
 * Maps a persisted SimulationOrder row to the frontend-facing OrderDefinition
 * shape. `SimulationOrder.medicationConfig` is the only config column we
 * persist regardless of category (see database-entities-rules.md), so it's
 * routed into the category-specific field OrderDefinition expects, falling
 * back to `otherConfig` for an unrecognized category.
 */
export function toOrderDefinition(order: SimulationOrder): OrderDefinition {
  const configKey = CATEGORY_CONFIG_KEY[order.category] ?? 'otherConfig';
  const configs: Partial<Record<OrderConfigKey, Record<string, unknown>>> = {};
  if (order.medicationConfig) {
    configs[configKey] = order.medicationConfig as Record<string, unknown>;
  }

  return {
    id: order.id,
    scenarioId: order.simulationId ?? '',
    title: order.title,
    category: order.category,
    priority: order.priority,
    description: order.description,
    instructions: order.instructions,
    due: order.dueDate,
    startDay: order.startDay,
    dueTime: order.dueTime,
    expirationDate: order.expirationOffset,
    status: order.orderStatus,
    systemVisibility: order.systemVisibility ?? 'Visible at start',
    unlockConditions: order.unlockConditions as string[] | undefined,
    linkedActionIds: order.linkedActionIds,
    linkedActions: order.linkedActionsDetail,
    ...configs,
  };
}

export function toOrderDefinitions(orders?: SimulationOrder[]): OrderDefinition[] | undefined {
  return orders?.map(toOrderDefinition);
}

/** Every category-specific config field name OrderDefinition can carry, in priority order for the reverse mapping. */
const ORDER_CONFIG_KEYS: OrderConfigKey[] = [
  'medicationConfig',
  'dietConfig',
  'labConfig',
  'nursingConfig',
  'referralConfig',
  'imagingConfig',
  'procedureConfig',
  'therapyConfig',
  'clinicalAssessmentConfig',
  'communicationConfig',
  'ethicsSafetyConfig',
  'careActivitiesConfig',
  'technicalSkillsConfig',
  'otherConfig',
];

/**
 * Inverse of `toOrderDefinition` — maps an order back to the SimulationOrder
 * entity shape, so a frontend-facing OrderDefinition (or a payload that
 * round-tripped through one) can be persisted again. Tolerant of an
 * already entity-shaped input too (e.g. `orderStatus`/`dueDate` already set),
 * preferring those over the OrderDefinition field names when both are present,
 * so it's safe to run over any order payload before create/update.
 */
export function fromOrderDefinition(order: Record<string, unknown>): Partial<SimulationOrder> {
  const configKey = CATEGORY_CONFIG_KEY[order.category as string] ?? 'otherConfig';
  const config =
    (order[configKey] as Record<string, unknown> | undefined) ??
    ORDER_CONFIG_KEYS.map((key) => order[key] as Record<string, unknown> | undefined).find(Boolean);

  return {
    id: order.id as string,
    scenarioId: (order.scenarioId as string | undefined) ?? undefined,
    title: order.title as string,
    category: order.category as string,
    priority: order.priority as string,
    description: order.description as string | undefined,
    instructions: order.instructions as string | undefined,
    dueDate: (order.dueDate as string | undefined) ?? (order.due as string | undefined),
    startDay: order.startDay as string | undefined,
    dueTime: order.dueTime as string | undefined,
    expirationOffset:
      (order.expirationOffset as string | undefined) ?? (order.expirationDate as string | undefined),
    orderStatus: (order.orderStatus as string | undefined) ?? (order.status as string | undefined),
    systemVisibility: order.systemVisibility as string | undefined,
    unlockConditions: order.unlockConditions as object | undefined,
    linkedActionIds: order.linkedActionIds as string[] | undefined,
    linkedActionsDetail:
      (order.linkedActionsDetail as Array<{ id: string; title: string }> | undefined) ??
      (order.linkedActions as Array<{ id: string; title: string }> | undefined),
    medicationConfig: config,
  };
}

export function fromOrderDefinitions(
  orders?: Array<Record<string, unknown>>,
): Partial<SimulationOrder>[] | undefined {
  return orders?.map(fromOrderDefinition);
}
