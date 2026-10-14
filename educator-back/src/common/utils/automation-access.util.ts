import { AutomationConstants } from '../constants/automation.constants';

/** Case-insensitive, whitespace-tolerant email comparison. */
export function isSameEmail(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isAutomationUnitId(unitId: unknown): boolean {
  return typeof unitId === 'string' && unitId.trim() === AutomationConstants.UNIT_ID;
}

/** Case-insensitive match — the automation simulation has no stable/known ID. */
export function isAutomationScenarioTitle(title: unknown): boolean {
  return (
    typeof title === 'string' &&
    title.trim().toLowerCase() === AutomationConstants.SCENARIO_TITLE.toLowerCase()
  );
}

/** True when a scenario/unit record is the automation-only unit or simulation. */
export function isAutomationOnlyRecord(
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) return false;
  const id = record['id'];
  const unitId = record['unitId'] ?? record['unit_id'] ?? record['unit'];
  const title = record['title'] ?? record['name'];
  return isAutomationUnitId(id) || isAutomationUnitId(unitId) || isAutomationScenarioTitle(title);
}

