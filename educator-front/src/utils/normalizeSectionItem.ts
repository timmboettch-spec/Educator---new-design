import { SectionItem, SimulationDetail, UnitScenario } from '@/types';
import { parseAvatarEnabled } from './simulationType';

const toStr = (v: unknown): string => (v == null ? '' : String(v));
const toOptStr = (v: unknown): string | undefined =>
  v == null || v === '' ? undefined : String(v);

/**
 * Filter out simulation-mode labels that should not be displayed as product categories.
 * "AI Only" and "Manikin" are simulation configuration modes, not product categories.
 */
export const sanitizeCategory = (value: unknown): string | undefined => {
  const str = String(value ?? '').trim().toLowerCase();
  if (!str) return undefined;
  if (str === 'ai only' || str === 'manikin') return undefined;
  return toOptStr(value);
};

export const normalizeSectionItem = (item: Record<string, unknown>): SectionItem => ({
  ...(item as Partial<SectionItem>),
  id: Number.isFinite(Number(item.id)) ? Number(item.id) : 0,
  scenarioId: toOptStr(
    item.scenarioId ?? item.scenario_id ?? item.scenarioID ?? item.simulation_id,
  ),
  title: toStr(item.title ?? item.name),
  image: toStr(
    item.image ??
      item.scenarioImage ??
      item.image_url ??
      item.imageUrl ??
      item.imageURL ??
      item.scenario_image ??
      item.cover_image ??
      item.coverImage ??
      item.thumbnail ??
      item.blob_url ??
      item.blobUrl ??
      item.unit_image
  ),
  cta: toStr(item.cta ?? 'View'),
  unit: toOptStr(item.unit ?? item.unit_id ?? item.unit_name),
  category: undefined, // Category is now derived from avatarEnabled only
  description: toOptStr(item.description),
  images: Array.isArray(item.images) ? (item.images as string[]) : undefined,
  language: toOptStr(item.language),
  subtitle: toOptStr(item.subtitle ?? item.sub_title),
  developer: toOptStr(item.developer),
  institution: toOptStr(item.institution),
  last_update: toOptStr(item.last_update ?? item.updatedAt ?? item.updated_at),
  learning_objectives: Array.isArray(item.learning_objectives)
    ? (item.learning_objectives as string[])
    : undefined,
  targetAudience: Array.isArray(item.targetAudience)
    ? (item.targetAudience as string[])
    : item.targetAudience
      ? [String(item.targetAudience)]
      : Array.isArray(item.target_audience)
        ? (item.target_audience as string[])
        : undefined,
  difficulty: toOptStr(item.difficulty ?? item.difficultyLevel),
  duration: toOptStr(item.duration ?? item.estimatedDuration),
  purpose: toOptStr(item.purpose ?? item.objective),
  avatarEnabled: parseAvatarEnabled(item.avatarEnabled),
});

export const normalizeToSimulationDetail = (
  raw: UnitScenario,
  simulationId: string | number,
  fallback: SectionItem,
): SimulationDetail => ({
  id: Number.isFinite(Number(simulationId)) ? Number(simulationId) : 0,
  title: (raw.title as string) || fallback.title,
  subtitle: raw.subtitle || fallback.subtitle || '',
  image_url:
    raw.scenarioImage ||
    raw.imageURL ||
    raw.imageUrl ||
    raw.image_url ||
    raw.image ||
    raw.scenario_image ||
    raw.cover_image ||
    raw.coverImage ||
    raw.thumbnail ||
    raw.blob_url ||
    raw.blobUrl ||
    fallback.image ||
    '',
  scenarioImage:
    raw.scenarioImage ||
    raw.imageURL ||
    raw.imageUrl ||
    raw.image_url ||
    raw.image ||
    raw.scenario_image ||
    raw.cover_image ||
    raw.coverImage ||
    raw.thumbnail ||
    raw.blob_url ||
    raw.blobUrl ||
    fallback.image ||
    '',
  images: raw.images ?? fallback.images,
  usage: (raw.usage as string) || '',
  unit: raw.unit_id || fallback.unit || '',
  category: '', // Category is now derived from avatarEnabled only
  language: raw.language || fallback.language || '',
  targetAudience: raw.targetAudience ?? fallback.targetAudience,
  difficultyLevel: raw.difficultyLevel || raw.difficulty || fallback.difficulty || '',
  estimatedDuration:
    raw.estimatedDuration ||
    (raw as Record<string, unknown>).estimated_duration as string ||
    (raw as Record<string, unknown>).estimated_duration_minutes as string ||
    raw.duration ||
    ((raw.studentBriefing as Record<string, unknown> | undefined)?.timeAllotment as string | undefined) ||
    ((raw.studentBriefing as Record<string, unknown> | undefined)?.time_allotment as string | undefined) ||
    fallback.duration ||
    '',
  purpose: raw.purpose || raw.objective || fallback.purpose || '',
  description: raw.description || fallback.description || '',
  learning_objectives: raw.learning_objectives ?? fallback.learning_objectives,
  developer: raw.developer || fallback.developer || '',
  institution: raw.institution || fallback.institution || '',
  last_update: raw.last_update || raw.updatedAt || fallback.last_update || '',
  simulation_privacy: (raw.simulation_privacy as string) || '',
  department: (raw.department as string) || '',
  learnerLevel: (raw.learnerLevel as string) || (raw.learner_level as string) || '',
  learningObjective: (raw.learningObjective as string) || (raw.learning_objective as string) || '',
  voice: (raw.voice as string) || '',
  sbar: raw.sbar as SimulationDetail['sbar'] | undefined,
  studentBriefing: raw.studentBriefing
    ? {
        safeEnvironment: (raw.studentBriefing as Record<string, unknown>).safeEnvironment as string | undefined,
        facilitatorSupport: (raw.studentBriefing as Record<string, unknown>).facilitatorSupport as string | undefined,
        orientationSpace: (raw.studentBriefing as Record<string, unknown>).orientationSpace as string | undefined,
        orientationEquipment: (raw.studentBriefing as Record<string, unknown>).orientationEquipment as string | undefined,
        evaluation: (raw.studentBriefing as Record<string, unknown>).evaluation as string | undefined,
        rolesExpectations: (raw.studentBriefing as Record<string, unknown>).rolesExpectations as string | undefined,
        simulationLimitations: (raw.studentBriefing as Record<string, unknown>).simulationLimitations as string | undefined,
        timeAllotment: (raw.studentBriefing as Record<string, unknown>).timeAllotment as string | undefined,
        purpose: (raw.studentBriefing as Record<string, unknown>).purpose as string | undefined,
        learningObjectives: (raw.studentBriefing as Record<string, unknown>).learningObjectives as string | undefined,
        closingReminder: (raw.studentBriefing as Record<string, unknown>).closingReminder as string | undefined,
      }
    : undefined,
  topicsAddressed: (raw.topicsAddressed as string) || '',
  productName: ((raw.productSetup as Record<string, unknown>)?.title as string) || '',
  additionalEquipment: (raw.additionalEquipment as string) || '',
  optionalEquipment: (raw.optionalEquipment as string) || '',
  setupNotes: (raw.setupNotes as string) || '',
  prebriefScriptPdf: (raw.prebriefScriptPdf as string) || (raw.preBriefPdf as string) || '',
  debriefPointsPdf: (raw.debriefPointsPdf as string) || '',
  setupNotesPdf: (raw.setupNotesPdf as string) || '',
  facilitationNotesPdf: (raw.facilitationNotesPdf as string) || '',
  printableSbarPdf: (raw.printableSbarPdf as string) || '',
  printablePatientChartPdf: (raw.printablePatientChartPdf as string) || '',
  avatarEnabled: parseAvatarEnabled(raw.avatarEnabled),
});
