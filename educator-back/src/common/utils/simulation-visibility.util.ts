import { SimulationConstants, SimulationStatus } from 'src/common/constants';

const HIDDEN_FROM_EDUCATORS: readonly string[] = [
  SimulationStatus.DRAFT,
  SimulationStatus.ARCHIVED,
];

/** Draft and archived simulations are hidden from educators (case/whitespace-insensitive). */
export const isSimulationVisibleToEducators = (status: unknown): boolean => {
  const normalized = (typeof status === 'string' ? status : '').toLowerCase().trim();
  return !HIDDEN_FROM_EDUCATORS.includes(normalized);
};

/**
 * SQL form of {@link isSimulationVisibleToEducators} for a `simulations_v2.status` column
 * expression: a null or empty status is visible, and draft/archived match regardless of case or
 * surrounding whitespace. Built from the same hidden-status list, so the two cannot drift apart.
 */
export const buildSimulationVisibleToEducatorsSql = (statusColumn: string): string => {
  const hiddenStatuses = HIDDEN_FROM_EDUCATORS.map((status) => `'${status}'`).join(', ');
  const whitespaceClass = SimulationConstants.VISIBILITY.TRIMMED_WHITESPACE_CLASS;
  const trimPattern = `^[${whitespaceClass}]+|[${whitespaceClass}]+$`;
  return `LOWER(REGEXP_REPLACE(COALESCE(${statusColumn}, ''), '${trimPattern}', '', 'g')) NOT IN (${hiddenStatuses})`;
};
