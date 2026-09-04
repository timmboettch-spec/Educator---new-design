import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { Educator } from '../../../src/educators/entity/educator.entity';

/**
 * The report-email gate is pure logic over ConfigService, so the service is
 * built without its constructor: none of the repositories or gateways are
 * touched by these code paths.
 */
const buildService = (
  env: Record<string, string | undefined> = {},
): SimulationReportsService => {
  const service = Object.create(
    SimulationReportsService.prototype,
  ) as SimulationReportsService;

  Object.assign(service, {
    configService: { get: (key: string) => env[key] },
  });

  return service;
};

/** Educator carrying only the legacy `school` FK (no junction rows). */
const legacyEducator = (schoolName: string | null): Educator =>
  ({
    email: 'educator@example.test',
    school: schoolName ? { school_name: schoolName } : null,
  }) as unknown as Educator;

/** Educator assigned solely through the EducatorSchool junction table. */
const junctionEducator = (...schoolNames: string[]): Educator =>
  ({
    email: 'educator@example.test',
    school: null,
    schoolAssignments: schoolNames.map((school_name, i) => ({
      is_primary: i === 0,
      school: { school_name },
    })),
  }) as unknown as Educator;

const suppressionReason = (
  service: SimulationReportsService,
  educator: Educator | null,
): string | null =>
  (service as unknown as {
    getReportEmailSuppressionReason(e: Educator | null): string | null;
  }).getReportEmailSuppressionReason(educator);

const REAL_SCHOOL = 'Northgate Bay Nursing Preparatory';

describe('SimulationReportsService — report email gate', () => {
  describe('REPORT_EMAILS_DISABLED kill switch', () => {
    it('suppresses every report email when set to "true"', () => {
      const service = buildService({ REPORT_EMAILS_DISABLED: 'true' });
      expect(suppressionReason(service, legacyEducator(REAL_SCHOOL))).toBe(
        'REPORT_EMAILS_DISABLED',
      );
    });

    it('bypasses school logic entirely, including junction-only educators', () => {
      const service = buildService({ REPORT_EMAILS_DISABLED: 'true' });
      expect(suppressionReason(service, junctionEducator(REAL_SCHOOL))).toBe(
        'REPORT_EMAILS_DISABLED',
      );
      expect(suppressionReason(service, null)).toBe('REPORT_EMAILS_DISABLED');
    });

    it('does not suppress when set to "false"', () => {
      const service = buildService({ REPORT_EMAILS_DISABLED: 'false' });
      expect(suppressionReason(service, legacyEducator(REAL_SCHOOL))).toBeNull();
    });

    it('does not suppress when unset', () => {
      const service = buildService();
      expect(suppressionReason(service, legacyEducator(REAL_SCHOOL))).toBeNull();
    });

    it('only honours the exact string "true", not truthy variants', () => {
      const service = buildService({ REPORT_EMAILS_DISABLED: '1' });
      expect(suppressionReason(service, legacyEducator(REAL_SCHOOL))).toBeNull();
    });
  });

  describe('test-school gate — legacy school FK', () => {
    it.each([
      'Beta Test',
      'beta test',
      'Beta-Test',
      'BETA_TEST',
      'Beta Test School',
      'RW Beta Test Academy',
      'Test Academy',
    ])('suppresses email for test school %p', (schoolName) => {
      const service = buildService();
      expect(suppressionReason(service, legacyEducator(schoolName))).toBe(
        `test school "${schoolName}"`,
      );
    });

    it.each([
      REAL_SCHOOL,
      'Cedar Hollow Health Sciences Academy',
      'Betamax Testing Institute',
      'St John Protestant Academy',
    ])('sends email for real school %p', (schoolName) => {
      const service = buildService();
      expect(suppressionReason(service, legacyEducator(schoolName))).toBeNull();
    });

    it('sends when the educator has no school at all, rather than silently dropping', () => {
      const service = buildService();
      expect(suppressionReason(service, legacyEducator(null))).toBeNull();
    });

    it('sends when the educator could not be loaded', () => {
      const service = buildService();
      expect(suppressionReason(service, null)).toBeNull();
    });
  });

  /**
   * Regression cover for the gap that would have let automation email escape:
   * an educator assigned only through the junction table has school === null.
   */
  describe('test-school gate — schoolAssignments junction', () => {
    it('suppresses a junction-assigned Beta Test educator with a null legacy FK', () => {
      const service = buildService();
      const educator = junctionEducator('Beta Test');

      expect(educator.school).toBeNull();
      expect(suppressionReason(service, educator)).toBe('test school "Beta Test"');
    });

    it('suppresses when the test school is a non-primary secondary assignment', () => {
      const service = buildService();
      expect(suppressionReason(service, junctionEducator(REAL_SCHOOL, 'Beta Test'))).toBe(
        'test school "Beta Test"',
      );
    });

    it('still sends when every junction school is a real school', () => {
      const service = buildService();
      expect(
        suppressionReason(
          service,
          junctionEducator(REAL_SCHOOL, 'Cedar Hollow Health Sciences Academy'),
        ),
      ).toBeNull();
    });

    it('suppresses when the legacy FK is real but a junction row is the test school', () => {
      const service = buildService();
      const educator = {
        email: 'educator@example.test',
        school: { school_name: REAL_SCHOOL },
        schoolAssignments: [{ is_primary: true, school: { school_name: 'Beta Test' } }],
      } as unknown as Educator;

      expect(suppressionReason(service, educator)).toBe('test school "Beta Test"');
    });

    it('tolerates an empty or missing schoolAssignments array', () => {
      const service = buildService();
      const noAssignments = { email: 'e@example.test', school: null } as unknown as Educator;
      const emptyAssignments = {
        email: 'e@example.test',
        school: null,
        schoolAssignments: [],
      } as unknown as Educator;

      expect(suppressionReason(service, noAssignments)).toBeNull();
      expect(suppressionReason(service, emptyAssignments)).toBeNull();
    });
  });

  describe('REPORT_EMAILS_TEST_SCHOOLS override', () => {
    it('honours a custom pattern list', () => {
      const service = buildService({ REPORT_EMAILS_TEST_SCHOOLS: 'QA Sandbox' });
      expect(suppressionReason(service, legacyEducator('QA Sandbox'))).toBe(
        'test school "QA Sandbox"',
      );
      expect(suppressionReason(service, legacyEducator('Beta Test'))).toBeNull();
    });

    it('applies the override to junction-assigned schools too', () => {
      const service = buildService({ REPORT_EMAILS_TEST_SCHOOLS: 'QA Sandbox' });
      expect(suppressionReason(service, junctionEducator('QA Sandbox'))).toBe(
        'test school "QA Sandbox"',
      );
    });

    it('ignores empty entries so a stray comma cannot mute everything', () => {
      const service = buildService({ REPORT_EMAILS_TEST_SCHOOLS: 'Beta Test,,' });
      expect(suppressionReason(service, legacyEducator(REAL_SCHOOL))).toBeNull();
    });
  });
});
