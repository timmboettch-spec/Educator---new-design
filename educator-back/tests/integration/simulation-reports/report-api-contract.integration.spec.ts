import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { MailService } from '../../../src/mail/mail.service';
import { MailRetryService } from '../../../src/mail/mail-retry.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import {
  NOTIFICATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
} from '../../../src/database/tokens';
import type {
  IReportListingFilters,
  IReportListingPagination,
  IReportListingSort,
  ReportPageParams,
} from '../../../src/common/interfaces';
import { ReportListSortField } from '../../../src/common/constants';
import { buildTestApp, lmsGradePassbackProviders, TEST_USERS } from '../setup/test-app.factory';
import { emptyReportEntryColumns } from '../../test-data/simulation-report.fixture';

type Row = Record<string, unknown>;
type StudentKey = 'alice' | 'bob' | 'carol';

const EDUCATOR_ID = TEST_USERS.educator.educatorId as string;
const CLASS_ID = '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601';
const STUDENT_IDS: Record<StudentKey, string> = {
  alice: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f611',
  bob: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f612',
  carol: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f613',
};
const REPORT_IDS: Record<StudentKey, string> = {
  alice: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f621',
  bob: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f622',
  carol: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f623',
};

const at = (day: number): Date => new Date(Date.UTC(2099, 0, day, 10));

/** One Report per Student and Scenario. Completed order: bob, alice, carol. Name order: A, B, C. */
const seedReports = (): Row[] =>
  (
    [
      ['alice', 'Alice', 'scenario-a', 5],
      ['bob', 'Bob', 'scenario-b', 3],
      ['carol', 'Carol', 'scenario-c', 8],
    ] as const
  ).map(([key, name, scenarioId, day]) => ({
    ...emptyReportEntryColumns(),
    id: REPORT_IDS[key],
    studentId: STUDENT_IDS[key],
    studentName: name,
    scenarioId,
    reportId: `report-${key}`,
    transcriptId: `tr-${key}`,
    userId: 'LIN-4RJR',
    mode: 'Assessment',
    score: 70,
    scoreJson: { overallScore: 70 },
    summary: 'summary',
    createdAt: at(day),
    viewedAt: null,
    viewedBy: null,
  }));

/**
 * The educator Report routes as the Educator App sees them, over HTTP. `SIMULATION_REPORT_REPOSITORY`
 * is an in-memory fake over three seeded Reports (no database): these tests pin response keys and
 * values, what the service asks the repository for, and what it writes when a Report is viewed.
 * SQL-level sorting is covered by `report-reads-from-database.integration.spec.ts`.
 */
describe('Report API contract (Integration, mocked repositories)', () => {
  let app: INestApplication;
  let educatorToken: string;
  let adminToken: string;
  let reports: Row[];

  const byCreatedDesc = (a: Row, b: Row): number =>
    (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();

  const toListingRow = (report: Row): Row => ({
    reportId: report.id,
    studentCode: `CODE-${String(report.studentName)}`,
    studentName: report.studentName,
    scenarioId: report.scenarioId,
    simulationName: report.scenarioId,
    mode: report.mode,
    score: report.score,
    scoreJson: report.scoreJson,
    performanceLabel: null,
    totalTimeSeconds: 100,
    transcriptId: report.transcriptId,
    completedAt: report.createdAt,
    viewedAt: report.viewedAt,
    viewedBy: report.viewedBy,
  });

  const reportRepo = {
    findReportRowsByClassId: jest.fn((classId: string) =>
      Promise.resolve(classId === CLASS_ID ? [...reports].sort(byCreatedDesc) : []),
    ),
    findReportRowsByStudentIds: jest.fn((ids: string[]) =>
      Promise.resolve(
        reports.filter((r) => ids.includes(r.studentId as string)).sort(byCreatedDesc),
      ),
    ),
    findReportRowsPage: jest.fn((params: ReportPageParams) =>
      Promise.resolve(
        reports
          .filter((r) => !params.studentId || r.studentId === params.studentId)
          .filter((r) => !params.scenarioId || r.scenarioId === params.scenarioId)
          .sort(byCreatedDesc)
          .slice(params.skip, params.skip + params.take),
      ),
    ),
    findReportsForListing: jest.fn(
      (
        _educatorId: string,
        _filters: IReportListingFilters,
        sort: IReportListingSort,
        pagination: IReportListingPagination,
      ) => {
        // Stands in for the SQL ORDER BY: only the two sort fields these tests use.
        const sortValue = (r: Row): string =>
          sort.field === ReportListSortField.STUDENT_NAME
            ? String(r.studentName)
            : (r.createdAt as Date).toISOString();
        const sign = sort.direction === 'ASC' ? 1 : -1;
        const sorted = [...reports].sort((a, b) => sign * sortValue(a).localeCompare(sortValue(b)));
        return Promise.resolve({
          rows: sorted.slice(pagination.skip, pagination.skip + pagination.take).map(toListingRow),
          total: sorted.length,
        });
      },
    ),
    findAccessibleById: jest.fn((id: string) =>
      Promise.resolve(reports.find((r) => r.id === id) ?? null),
    ),
    update: jest.fn((id: string, data: Row) => {
      const report = reports.find((r) => r.id === id);
      if (report) Object.assign(report, data);
      return Promise.resolve(report ? 1 : 0);
    }),
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(reports.find((r) => r.id === where.id) ?? null),
    ),
    getAttentionCountsByEducator: jest.fn(() => {
      const unread = reports.filter((r) => r.viewedAt === null).length;
      return Promise.resolve(
        unread > 0
          ? [
              {
                class_id: CLASS_ID,
                report_count: String(reports.length),
                unread_count: String(unread),
              },
            ]
          : [],
      );
    }),
  };

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const dataOf = (res: request.Response): Row[] => {
    const body = res.body as { data?: unknown };
    if (!Array.isArray(body.data)) throw new Error('Expected response data to be an array');
    return body.data as Row[];
  };

  const expectedIds = (...keys: StudentKey[]): string[] => keys.map((key) => REPORT_IDS[key]);

  beforeAll(async () => {
    const built = await buildTestApp({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        {
          provide: NOTIFICATION_REPOSITORY,
          useValue: { existsStudentReportNotification: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: { findAllWithoutChildrenJoined: jest.fn().mockResolvedValue([]) },
        },
        { provide: TRANSCRIPT_REPOSITORY, useValue: {} },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: {} },
        { provide: DataSource, useValue: { getRepository: jest.fn(), manager: {} } },
        { provide: MailService, useValue: { sendMail: jest.fn() } },
        { provide: MailRetryService, useValue: { enqueue: jest.fn() } },
        {
          provide: NotificationsGateway,
          useValue: {
            notifyEducatorStudentReportAvailable: jest.fn(),
            notifyAdminStudentReportAvailable: jest.fn(),
            notifyStudentSimulationsUpdated: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        ...lmsGradePassbackProviders,
      ],
    });
    app = built.app;
    educatorToken = built.signToken(TEST_USERS.educator);
    adminToken = built.signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    reports = seedReports();
    jest.clearAllMocks();
  });

  describe('GET /api/simulation-reports/class/:classId', () => {
    it('returns each Report with studentId and the temporary student_id alias equal to the Student uuid', async () => {
      const res = await request(httpServer())
        .get(`/api/simulation-reports/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const rows = dataOf(res);
      expect(rows).toHaveLength(3);
      const expected = Object.values(STUDENT_IDS).sort();
      expect(rows.map((row) => row.studentId).sort()).toEqual(expected);
      expect(rows.map((row) => row.student_id).sort()).toEqual(expected);
      expect(reportRepo.findReportRowsByClassId).toHaveBeenCalledWith(CLASS_ID);
    });
  });

  describe('GET /api/simulation-reports/student/:studentId', () => {
    it('returns camelCase keys only, without the student_id alias', async () => {
      const res = await request(httpServer())
        .get(`/api/simulation-reports/student/${STUDENT_IDS.alice}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const rows = dataOf(res);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        studentId: STUDENT_IDS.alice,
        studentName: 'Alice',
        scenarioId: 'scenario-a',
      });
      expect(rows[0]).toHaveProperty('createdAt');
      expect(rows[0]).not.toHaveProperty('student_id');
      expect(reportRepo.findReportRowsByStudentIds).toHaveBeenCalledWith([STUDENT_IDS.alice]);
    });
  });

  describe('GET /api/simulation-reports (paginated)', () => {
    it('filters to one Student and returns the Report of that Student', async () => {
      const res = await request(httpServer())
        .get('/api/simulation-reports')
        .query({ studentId: STUDENT_IDS.alice })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(dataOf(res).map((row) => row.id)).toEqual([REPORT_IDS.alice]);
      expect(reportRepo.findReportRowsPage).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: STUDENT_IDS.alice, skip: 0 }),
      );
    });

    it('returns Reports newest first and honours the page size', async () => {
      const page = (take: number, skip: number): Promise<request.Response> =>
        request(httpServer())
          .get('/api/simulation-reports')
          .query({ take, skip })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

      const firstPage = dataOf(await page(2, 0));
      const secondPage = dataOf(await page(2, 2));

      expect(firstPage.map((row) => row.id)).toEqual(expectedIds('carol', 'alice'));
      expect(secondPage.map((row) => row.id)).toEqual(expectedIds('bob'));
      expect(reportRepo.findReportRowsPage.mock.calls.map(([params]) => params)).toEqual([
        { studentId: undefined, scenarioId: undefined, skip: 0, take: 2 },
        { studentId: undefined, scenarioId: undefined, skip: 2, take: 2 },
      ]);
    });
  });

  describe('GET /api/simulation-reports/list', () => {
    const listIds = async (sortBy: string, sortDirection: 'ASC' | 'DESC'): Promise<string[]> => {
      const res = await request(httpServer())
        .get('/api/simulation-reports/list')
        .query({ classIds: CLASS_ID, sortBy, sortDirection })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
      return dataOf(res).map((row) => String(row.reportId));
    };

    const lastListingCall = (): [
      string,
      IReportListingFilters,
      IReportListingSort,
      IReportListingPagination,
    ] => reportRepo.findReportsForListing.mock.calls.at(-1)!;

    it('sorts by completed date ascending and descending', async () => {
      expect(await listIds('completedAt', 'ASC')).toEqual(expectedIds('bob', 'alice', 'carol'));
      expect(lastListingCall()).toEqual([
        EDUCATOR_ID,
        expect.objectContaining({ classIds: [CLASS_ID] }),
        { field: ReportListSortField.COMPLETED_AT, direction: 'ASC' },
        { skip: 0, take: 10 },
      ]);

      expect(await listIds('completedAt', 'DESC')).toEqual(expectedIds('carol', 'alice', 'bob'));
      expect(lastListingCall()[2]).toEqual({
        field: ReportListSortField.COMPLETED_AT,
        direction: 'DESC',
      });
    });

    it('sorts by Student name ascending and descending', async () => {
      expect(await listIds('studentName', 'ASC')).toEqual(expectedIds('alice', 'bob', 'carol'));
      expect(lastListingCall()[2]).toEqual({
        field: ReportListSortField.STUDENT_NAME,
        direction: 'ASC',
      });

      expect(await listIds('studentName', 'DESC')).toEqual(expectedIds('carol', 'bob', 'alice'));
      expect(lastListingCall()[2]).toEqual({
        field: ReportListSortField.STUDENT_NAME,
        direction: 'DESC',
      });
    });
  });

  describe('PATCH /api/simulation-reports/:id/viewed', () => {
    const unreadCount = async (): Promise<number | undefined> => {
      const res = await request(httpServer())
        .get('/api/simulation-reports/classes/needing-attention')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
      const row = dataOf(res).find((item) => item.classId === CLASS_ID);
      return row?.unreadReportCount as number | undefined;
    };

    const markViewed = (id: string): request.Test =>
      request(httpServer())
        .patch(`/api/simulation-reports/${id}/viewed`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

    it('sets the viewed timestamp and viewer and clears the unread count', async () => {
      expect(await unreadCount()).toBe(3);

      await markViewed(REPORT_IDS.alice);

      expect(reportRepo.findAccessibleById).toHaveBeenCalledWith(REPORT_IDS.alice, EDUCATOR_ID);
      expect(reportRepo.update).toHaveBeenCalledWith(REPORT_IDS.alice, {
        viewedAt: expect.any(Date) as Date,
        viewedBy: EDUCATOR_ID,
      });
      const persisted = reports.find((r) => r.id === REPORT_IDS.alice);
      expect(persisted?.viewedAt).toBeInstanceOf(Date);
      expect(persisted?.viewedBy).toBe(EDUCATOR_ID);
      expect(await unreadCount()).toBe(2);

      for (const id of [REPORT_IDS.bob, REPORT_IDS.carol]) {
        await markViewed(id);
      }
      // A Class with no unread Reports no longer needs attention.
      expect(await unreadCount()).toBeUndefined();

      // Viewing an already-viewed Report does not overwrite who viewed it first.
      reportRepo.update.mockClear();
      await markViewed(REPORT_IDS.alice);
      expect(reportRepo.update).not.toHaveBeenCalled();
    });
  });
});
