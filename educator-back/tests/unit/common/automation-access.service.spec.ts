import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { AutomationConstants } from 'src/common/constants/automation.constants';

const TESTER_EMAIL = 'test@curionn.com';

interface FakeClsState {
  active: boolean;
  user?: { userId: string; email?: string };
}

function buildService(clsState: FakeClsState, testerEmail: string | undefined = TESTER_EMAIL) {
  const configService = { get: jest.fn().mockReturnValue(testerEmail) } as unknown as {
    get: jest.Mock;
  };
  const cls = {
    isActive: jest.fn().mockReturnValue(clsState.active),
    get: jest.fn().mockReturnValue(clsState.user),
  } as unknown as { isActive: jest.Mock; get: jest.Mock };

  const service = new AutomationAccessService(
    configService as never,
    cls as never,
  );
  return { service, configService, cls };
}

describe('AutomationAccessService', () => {
  it('reads the tester email from the automation config namespace', () => {
    const { service, configService } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } });
    expect(service.isCurrentUserTester()).toBe(true);
    expect(configService.get).toHaveBeenCalledWith('automation.testerEmail');
  });

  it('treats the tester email match case-insensitively', () => {
    const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL.toUpperCase() } });
    expect(service.isCurrentUserTester()).toBe(true);
  });

  it('denies a non-tester email', () => {
    const { service } = buildService({ active: true, user: { userId: 'u2', email: 'student@example.com' } });
    expect(service.isCurrentUserTester()).toBe(false);
  });

  it('denies when CLS has no active request context (e.g. unauthenticated)', () => {
    const { service } = buildService({ active: false });
    expect(service.getCurrentUserEmail()).toBeUndefined();
    expect(service.isCurrentUserTester()).toBe(false);
  });

  it('fails closed when AUTOMATION_TESTER_EMAIL is not configured', () => {
    const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } }, '');
    expect(service.isCurrentUserTester()).toBe(false);
  });

  describe('canAccessRecord', () => {
    it('allows any record for the tester', () => {
      const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } });
      expect(service.canAccessRecord({ id: 'RWAI-9999', title: AutomationConstants.SCENARIO_TITLE })).toBe(true);
      expect(service.canAccessRecord({ id: AutomationConstants.UNIT_ID })).toBe(true);
    });

    it('blocks the automation scenario/unit for a non-tester', () => {
      const { service } = buildService({ active: true, user: { userId: 'u2', email: 'educator@example.com' } });
      expect(service.canAccessRecord({ id: 'RWAI-9999', title: AutomationConstants.SCENARIO_TITLE })).toBe(false);
      expect(service.canAccessRecord({ id: AutomationConstants.UNIT_ID })).toBe(false);
      expect(
        service.canAccessRecord({ id: 'RWAI-9999', unitId: AutomationConstants.UNIT_ID }),
      ).toBe(false);
    });

    it('allows unrelated records for anyone', () => {
      const { service } = buildService({ active: true, user: { userId: 'u2', email: 'educator@example.com' } });
      expect(service.canAccessRecord({ id: 'RWAI-1000', unitId: 'UNIT-1' })).toBe(true);
      expect(service.canAccessRecord(null)).toBe(true);
    });
  });

  describe('filterRecords', () => {
    const records = [
      { id: 'RWAI-1000', unitId: 'UNIT-1', title: 'Other Simulation' },
      { id: 'RWAI-9999', unitId: AutomationConstants.UNIT_ID, title: AutomationConstants.SCENARIO_TITLE },
      { id: 'RWAI-1002', unitId: 'UNIT-2', title: 'Another Simulation' },
    ];

    it('returns every record for the tester', () => {
      const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } });
      expect(service.filterRecords(records)).toEqual(records);
    });

    it('excludes the automation record for non-tester users', () => {
      const { service } = buildService({ active: true, user: { userId: 'u2', email: 'admin@example.com' } });
      expect(service.filterRecords(records)).toEqual([records[0], records[2]]);
    });

    it('excludes the automation record for an unauthenticated caller', () => {
      const { service } = buildService({ active: false });
      expect(service.filterRecords(records)).toEqual([records[0], records[2]]);
    });
  });

  describe('filterRecord', () => {
    it('returns the record for the tester', () => {
      const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } });
      const record = { id: 'RWAI-9999', title: AutomationConstants.SCENARIO_TITLE };
      expect(service.filterRecord(record)).toBe(record);
    });

    it('returns null (not-found style) for a non-tester direct lookup', () => {
      const { service } = buildService({ active: true, user: { userId: 'u2', email: 'student@example.com' } });
      expect(service.filterRecord({ id: 'RWAI-9999', title: AutomationConstants.SCENARIO_TITLE })).toBeNull();
      expect(service.filterRecord({ id: AutomationConstants.UNIT_ID })).toBeNull();
    });

    it('passes through null/undefined unchanged', () => {
      const { service } = buildService({ active: true, user: { userId: 'u1', email: TESTER_EMAIL } });
      expect(service.filterRecord(null)).toBeNull();
      expect(service.filterRecord(undefined)).toBeNull();
    });
  });
});
