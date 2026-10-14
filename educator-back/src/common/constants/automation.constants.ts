/**
 * Identifiers for the automation-only unit/simulation reserved for the QA
 * automation test suite. Visible only to the automation tester account —
 * see `AutomationAccessService` for the enforcement point.
 */
export const AutomationConstants = {
  UNIT_ID: 'AUTO-UNIT-001',
  // Matched by title, not ID — the automation simulation has no stable/known ID.
  SCENARIO_TITLE: 'Pressure Injury Prevention Assessment',
} as const;
