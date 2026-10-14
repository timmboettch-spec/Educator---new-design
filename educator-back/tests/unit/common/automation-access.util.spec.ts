import {
  isAutomationOnlyRecord,
  isAutomationScenarioTitle,
  isAutomationUnitId,
  isSameEmail,
} from 'src/common/utils/automation-access.util';
import { AutomationConstants } from 'src/common/constants/automation.constants';

describe('isSameEmail', () => {
  it('matches case-insensitively', () => {
    expect(isSameEmail('Tester@Example.com', 'tester@example.com')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isSameEmail('  tester@example.com  ', 'tester@example.com')).toBe(true);
  });

  it('rejects a different email', () => {
    expect(isSameEmail('student@example.com', 'tester@example.com')).toBe(false);
  });

  it('rejects when either side is missing', () => {
    expect(isSameEmail(undefined, 'tester@example.com')).toBe(false);
    expect(isSameEmail('tester@example.com', null)).toBe(false);
    expect(isSameEmail(undefined, undefined)).toBe(false);
  });
});

describe('isAutomationUnitId / isAutomationScenarioTitle', () => {
  it('recognizes the automation unit id exactly', () => {
    expect(isAutomationUnitId(AutomationConstants.UNIT_ID)).toBe(true);
    expect(isAutomationUnitId('auto-unit-001')).toBe(false);
    expect(isAutomationUnitId('OTHER-UNIT')).toBe(false);
    expect(isAutomationUnitId(undefined)).toBe(false);
    expect(isAutomationUnitId(123)).toBe(false);
  });

  it('recognizes the automation scenario title case-insensitively', () => {
    expect(isAutomationScenarioTitle(AutomationConstants.SCENARIO_TITLE)).toBe(true);
    expect(isAutomationScenarioTitle('pressure injury prevention assessment')).toBe(true);
    expect(isAutomationScenarioTitle('  Pressure Injury Prevention Assessment  ')).toBe(true);
    expect(isAutomationScenarioTitle('Some Other Simulation')).toBe(false);
    expect(isAutomationScenarioTitle(undefined)).toBe(false);
  });
});

describe('isAutomationOnlyRecord', () => {
  it('flags a scenario by title', () => {
    expect(
      isAutomationOnlyRecord({ id: 'RWAI-9999', title: AutomationConstants.SCENARIO_TITLE }),
    ).toBe(true);
  });

  it('flags a scenario by unitId even if the title differs', () => {
    expect(
      isAutomationOnlyRecord({
        id: 'RWAI-9999',
        title: 'Other Title',
        unitId: AutomationConstants.UNIT_ID,
      }),
    ).toBe(true);
  });

  it('flags a scenario using the snake_case unit_id field', () => {
    expect(
      isAutomationOnlyRecord({ id: 'RWAI-9999', unit_id: AutomationConstants.UNIT_ID }),
    ).toBe(true);
  });

  it('flags a unit by id', () => {
    expect(isAutomationOnlyRecord({ id: AutomationConstants.UNIT_ID })).toBe(true);
  });

  it('does not flag unrelated records', () => {
    expect(
      isAutomationOnlyRecord({ id: 'RWAI-1000', unitId: 'UNIT-1', title: 'Other Simulation' }),
    ).toBe(false);
  });

  it('does not flag null/undefined', () => {
    expect(isAutomationOnlyRecord(null)).toBe(false);
    expect(isAutomationOnlyRecord(undefined)).toBe(false);
  });
});

