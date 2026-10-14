// Category-specific config payloads are opaque jsonb blobs on our side today
// (persisted as SimulationOrder.medicationConfig regardless of category) — kept
// as loose record types here until the canonical per-category shapes are shared.
export type MedicationConfig = Record<string, unknown>;
export type DietConfig = Record<string, unknown>;
export type LabConfig = Record<string, unknown>;
export type NursingConfig = Record<string, unknown>;
export type ReferralConfig = Record<string, unknown>;
export type ImagingConfig = Record<string, unknown>;
export type ProcedureConfig = Record<string, unknown>;
export type TherapyConfig = Record<string, unknown>;
export type OtherConfig = Record<string, unknown>;
export type ClinicalAssessmentConfig = Record<string, unknown>;
export type CommunicationConfig = Record<string, unknown>;
export type EthicsSafetyConfig = Record<string, unknown>;
export type CareActivitiesConfig = Record<string, unknown>;
export type TechnicalSkillsConfig = Record<string, unknown>;

export type OrderCategory = string;
export type OrderPriority = string;
export type OrderStatus = string;

/** Frontend-facing shape for a scenario order, returned in place of the raw SimulationOrder entity. */
export interface OrderDefinition {
  id: string;
  scenarioId: string;
  title: string;
  category: OrderCategory;
  priority: OrderPriority;
  description?: string;
  instructions?: string; // e.g. "Details" in user requirements

  // Timing
  due?: string; // "Today, Now", "Today, Now + 2 hours"
  startDay?: string; // e.g. "T + 1"
  dueTime?: string; // e.g. "N + 6h"
  orderDate?: string; // e.g. "2026-04-12"
  expirationDate?: string; // e.g. "2026-04-13"

  // Status & Visibility
  status: OrderStatus;
  systemVisibility: string;
  visibilityTrigger?: 'Contact Provider'; // Expandable later
  unlockCondition?: string; // Required when hidden
  unlockConditions?: string[]; // Array of conditions for the new UI
  orderedBy?: string; // e.g. "Dr. Sarah Smith"

  // Category Specific Configs
  medicationConfig?: MedicationConfig;
  dietConfig?: DietConfig;
  labConfig?: LabConfig;
  nursingConfig?: NursingConfig;
  referralConfig?: ReferralConfig;
  imagingConfig?: ImagingConfig;
  procedureConfig?: ProcedureConfig;
  therapyConfig?: TherapyConfig;
  otherConfig?: OtherConfig;
  clinicalAssessmentConfig?: ClinicalAssessmentConfig;
  communicationConfig?: CommunicationConfig;
  ethicsSafetyConfig?: EthicsSafetyConfig;
  careActivitiesConfig?: CareActivitiesConfig;
  technicalSkillsConfig?: TechnicalSkillsConfig;

  // Link to existing Action
  linkedActionId?: string; // @deprecated use linkedActionIds
  linkedActionIds?: string[];
  linkedActions?: { id: string; title: string }[];
}
