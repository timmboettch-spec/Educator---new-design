import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { I18nService } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { databseConfig } from '../../../src/database/data-source';
import {
  Class,
  ClassTransferAudit,
  Educator,
  GoogleSchoolConnection,
} from '../../../src/database/entities';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { EducatorRepository } from '../../../src/database/repositories/educator.repository';
import { ClassTransferAuditRepository } from '../../../src/database/repositories/class-transfer-audit.repository';
import { GoogleSchoolConnectionRepository } from '../../../src/database/repositories/google-school-connection.repository';
import { ClassTransferService } from '../../../src/class-transfer/class-transfer.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { LoggerService } from '../../../src/common/services';
import { ClassTransferFailureReason } from '../../../src/common/constants';
import { ClassTransferConflictException } from '../../../src/common/exceptions/class-transfer-conflict.exception';
import type { ICurrentUser } from '../../../src/common/interfaces';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
const describeWithDb = hasDbConfig ? describe : describe.skip;
// The 50-class timing check seeds ~1,500 students; opt in with CLASS_TRANSFER_PERF=1.
const describePerf = hasDbConfig && process.env.CLASS_TRANSFER_PERF ? describe : describe.skip;

// Unique per run so concurrent runs against a shared DB never touch each other's rows.
const RUN_TAG = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = `BULK-XFER-${RUN_TAG}`;

type Row = Record<string, unknown>;

/**
 * Runs `ClassTransferService.bulkTransfer` against real Postgres, so the per-class transaction, the
 * guarded owner UPDATE, the `class_educators` swap, the Google mapping handover and the audit
 * rows are exercised for real. Notifications, i18n and the request context are stubbed.
 */
describeWithDb('Bulk class transfer (DB Integration)', () => {
  jest.setTimeout(180000);

  let dataSource: DataSource;
  let classRepository: ClassRepository;
  let service: ClassTransferService;
  const gateway = {
    notifyClassesTransferredSource: jest.fn().mockResolvedValue(undefined),
    notifyClassesTransferredTarget: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  // Fixture ids, filled by seedPeople().
  const ids = {
    adminA: '',
    adminB: '',
    adminAUser: '',
    source: '',
    target: '',
    coInstructor: '',
    otherOwnerSameAdmin: '',
    educatorOfAdminB: '',
    schoolA: '',
    schoolB: '',
    schoolC: '',
  };
  let seq = 0;
  let adminUser: ICurrentUser;

  const q = <T = Row>(sql: string, params: unknown[] = []): Promise<T[]> =>
    dataSource.query(sql, params);
  const one = async <T = Row>(sql: string, params: unknown[] = []): Promise<T> =>
    (await q<T>(sql, params))[0];

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    classRepository = new ClassRepository(dataSource.getRepository(Class));
    service = new ClassTransferService(
      classRepository,
      new EducatorRepository(dataSource.getRepository(Educator)),
      new ClassTransferAuditRepository(dataSource.getRepository(ClassTransferAudit)),
      gateway as unknown as NotificationsGateway,
      logger as unknown as LoggerService,
      new GoogleSchoolConnectionRepository(dataSource.getRepository(GoogleSchoolConnection)),
      { t: (key: string) => key } as unknown as I18nService,
      { get: () => undefined } as unknown as ClsService,
      { get: () => undefined } as unknown as ConfigService,
    );
    await seedPeople();
    adminUser = { userId: ids.adminAUser, email: 'admin@example.com', adminId: ids.adminA };
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanup();
      await dataSource.destroy();
    }
  });

  beforeEach(() => jest.clearAllMocks());

  // ── Seeding ───────────────────────────────────────────────────────────

  async function roleId(slug: string): Promise<string> {
    return (await one<{ id: string }>(`SELECT id FROM role WHERE slug = $1`, [slug])).id;
  }

  async function userRole(
    slug: string,
    status = 'ACTIVE',
  ): Promise<{ userId: string; userRoleId: string }> {
    seq += 1;
    const user = await one<{ id: string }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [
      `bulk-xfer-${RUN_TAG}-${seq}@example.com`,
    ]);
    const ur = await one<{ user_role_id: string }>(
      `INSERT INTO user_roles (user_id, role_id, status) VALUES ($1, $2, $3) RETURNING user_role_id`,
      [user.id, await roleId(slug), status],
    );
    return { userId: user.id, userRoleId: ur.user_role_id };
  }

  async function districtAdmin(): Promise<{ adminId: string; userId: string }> {
    const { userId, userRoleId } = await userRole('district_admin');
    const row = await one<{ district_admin_id: string }>(
      `INSERT INTO district_admins (user_role_id) VALUES ($1) RETURNING district_admin_id`,
      [userRoleId],
    );
    return { adminId: row.district_admin_id, userId };
  }

  async function educator(
    name: string,
    adminId: string,
    schoolIds: string[],
    opts: { status?: string; isActive?: boolean } = {},
  ): Promise<string> {
    const { userRoleId } = await userRole('educator', opts.status ?? 'ACTIVE');
    const row = await one<{ id: string }>(
      `INSERT INTO educators (full_name, is_active, district_admin_id, user_role_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${TAG} ${name}`, opts.isActive ?? true, adminId, userRoleId],
    );
    for (const schoolId of schoolIds) {
      await q(`INSERT INTO educator_schools (educator_id, school_id) VALUES ($1, $2)`, [
        row.id,
        schoolId,
      ]);
    }
    return row.id;
  }

  async function school(name: string): Promise<string> {
    return (
      await one<{ id: string }>(`INSERT INTO schools (school_name) VALUES ($1) RETURNING id`, [
        `${TAG}-${name}`,
      ])
    ).id;
  }

  async function seedPeople(): Promise<void> {
    ids.schoolA = await school('A');
    ids.schoolB = await school('B');
    ids.schoolC = await school('C');

    const adminA = await districtAdmin();
    const adminB = await districtAdmin();
    ids.adminA = adminA.adminId;
    ids.adminAUser = adminA.userId;
    ids.adminB = adminB.adminId;

    ids.source = await educator('Source', ids.adminA, [ids.schoolA, ids.schoolB]);
    ids.target = await educator('Target', ids.adminA, [ids.schoolA, ids.schoolC]);
    ids.coInstructor = await educator('CoInstructor', ids.adminA, [ids.schoolA]);
    ids.otherOwnerSameAdmin = await educator('OtherOwner', ids.adminA, [ids.schoolA]);
    ids.educatorOfAdminB = await educator('AdminB Educator', ids.adminB, [ids.schoolA]);

    // The target is Google-connected for school A only.
    await q(
      `INSERT INTO google_school_connections (school_id, connected_by_educator_id, access_token, scopes)
       VALUES ($1, $2, 'test-token', 'classroom')`,
      [ids.schoolA, ids.target],
    );
  }

  interface ClassSpec {
    owner?: string;
    schoolId?: string | null;
    isActive?: boolean;
    status?: string;
    googleCourseId?: string | null;
    deleted?: boolean;
    students?: number;
  }

  async function makeClass(label: string, spec: ClassSpec = {}): Promise<string> {
    const owner = spec.owner ?? ids.source;
    const schoolId = spec.schoolId === undefined ? ids.schoolA : spec.schoolId;
    const row = await one<{ id: string }>(
      `INSERT INTO classes (class_name, educator_id, school_id, start_date, end_date, status, is_active,
                            google_course_id, deleted_at)
       VALUES ($1, $2, $3, '2026-01-01', '2026-12-31', $4, $5, $6, $7) RETURNING id`,
      [
        `${TAG}-${label}`,
        owner,
        schoolId,
        spec.status ?? 'ACTIVE',
        spec.isActive ?? true,
        spec.googleCourseId ?? null,
        spec.deleted ? new Date() : null,
      ],
    );
    const studentCount = spec.students ?? 2;
    for (let i = 0; i < studentCount; i += 1) {
      await q(
        `INSERT INTO students (student_id, class_id, educator_id, school_id) VALUES ($1, $2, $3, $4)`,
        [`${TAG}-${label}-${i}`, row.id, owner, schoolId],
      );
    }
    return row.id;
  }

  async function cleanup(): Promise<void> {
    const like = `${TAG}%`;
    await q(`DROP TRIGGER IF EXISTS bulk_xfer_boom ON class_transfer_audits`);
    await q(`DROP FUNCTION IF EXISTS bulk_xfer_boom_fn()`);
    await q(`DELETE FROM class_transfer_audits WHERE class_name LIKE $1`, [like]);
    await q(
      `DELETE FROM google_course_mappings WHERE class_id IN (SELECT id FROM classes WHERE class_name LIKE $1)`,
      [like],
    );
    const educatorIds = (
      await q<{ id: string }>(`SELECT id FROM educators WHERE full_name LIKE $1`, [like])
    ).map((r) => r.id);
    if (educatorIds.length) {
      await q(`DELETE FROM google_school_connections WHERE connected_by_educator_id = ANY($1)`, [
        educatorIds,
      ]);
      await q(`DELETE FROM educator_simulations WHERE educator_id = ANY($1)`, [educatorIds]);
      // Deleted explicitly so cleanup doesn't depend on the classes → educators FK cascading.
      await q(`DELETE FROM classes WHERE educator_id = ANY($1)`, [educatorIds]);
      // Cascades to students, class_educators, educator_schools.
      await q(`DELETE FROM educators WHERE id = ANY($1)`, [educatorIds]);
    }
    await q(`DELETE FROM schools WHERE school_name LIKE $1`, [like]);
    await q(
      `DELETE FROM users WHERE email LIKE $1`, // cascades to user_roles → district_admins
      [`bulk-xfer-${RUN_TAG}-%@example.com`],
    );
  }

  const ownerOf = async (classId: string): Promise<string> =>
    (await one<{ educator_id: string }>(`SELECT educator_id FROM classes WHERE id = $1`, [classId]))
      .educator_id;
  const studentOwners = async (classId: string): Promise<string[]> =>
    (
      await q<{ educator_id: string }>(`SELECT educator_id FROM students WHERE class_id = $1`, [
        classId,
      ])
    ).map((r) => r.educator_id);
  const coInstructorRows = (
    classId: string,
  ): Promise<Array<{ educator_id: string; is_primary: boolean }>> =>
    q(
      `SELECT educator_id, is_primary FROM class_educators WHERE class_id = $1 ORDER BY educator_id`,
      [classId],
    );
  const auditsFor = (classId: string): Promise<Row[]> =>
    q(`SELECT status, notes, batch_id, admin_id FROM class_transfer_audits WHERE class_id = $1`, [
      classId,
    ]);

  const transfer = (classIds: string[], over: Partial<{ source: string; target: string }> = {}) =>
    service.bulkTransfer(adminUser, {
      sourceEducatorId: over.source ?? ids.source,
      targetEducatorId: over.target ?? ids.target,
      classIds,
    });

  // ── Tests ─────────────────────────────────────────────────────────────

  it('moves classes, students, co-instructor rows, Google mapping and library, with one batch id', async () => {
    const plain = await makeClass('plain', { status: 'INACTIVE' }); // status column is not a gate
    const coTaught = await makeClass('co-taught');
    const google = await makeClass('google', { googleCourseId: `${TAG}-course` });

    await q(
      `INSERT INTO class_educators (class_id, educator_id, is_primary) VALUES ($1, $2, true), ($1, $3, false)`,
      [coTaught, ids.source, ids.coInstructor],
    );
    await q(
      `INSERT INTO google_course_mappings (school_id, class_id, google_course_id, linked_by_educator_id)
       VALUES ($1, $2, $3, $4)`,
      [ids.schoolA, google, `${TAG}-course`, ids.source],
    );
    const scenarioId = `${TAG}-scenario`;
    await q(
      `INSERT INTO class_simulations (class_id, simulation_id, is_active) VALUES ($1, $2, true)`,
      [plain, scenarioId],
    );
    await q(
      `INSERT INTO educator_simulations (educator_id, unit_id, scenario_id) VALUES ($1, 'unit-1', $2)`,
      [ids.source, scenarioId],
    );

    const { data } = await transfer([plain, coTaught, google]);

    expect(data).toMatchObject({ transferredCount: 3, failedCount: 0, failed: [] });
    for (const classId of [plain, coTaught, google]) {
      expect(await ownerOf(classId)).toBe(ids.target);
      expect(await studentOwners(classId)).toEqual([ids.target, ids.target]);
      expect(await auditsFor(classId)).toEqual([
        { status: 'SUCCESS', notes: null, batch_id: data!.batchId, admin_id: ids.adminAUser },
      ]);
    }

    // Source's co-instructor row is gone, the target is primary, other co-instructors untouched.
    expect(await coInstructorRows(coTaught)).toEqual(
      [
        { educator_id: ids.target, is_primary: true },
        { educator_id: ids.coInstructor, is_primary: false },
      ].sort((a, b) => a.educator_id.localeCompare(b.educator_id)),
    );
    expect(await coInstructorRows(plain)).toEqual([{ educator_id: ids.target, is_primary: true }]);

    // Google mapping handed over; school ids never change.
    expect(
      await one(`SELECT linked_by_educator_id FROM google_course_mappings WHERE class_id = $1`, [
        google,
      ]),
    ).toEqual({ linked_by_educator_id: ids.target });
    expect(await one(`SELECT school_id FROM classes WHERE id = $1`, [google])).toEqual({
      school_id: ids.schoolA,
    });
    expect(data!.transferred.find((t) => t.classId === google)?.notice).toBe(
      'class.TRANSFER.GOOGLE_ADD_TARGET_TO_COURSE',
    );

    // Library sync copied the class's simulation to the target.
    expect(
      await q(
        `SELECT unit_id FROM educator_simulations WHERE educator_id = $1 AND scenario_id = $2`,
        [ids.target, scenarioId],
      ),
    ).toEqual([{ unit_id: 'unit-1' }]);

    expect(gateway.notifyClassesTransferredSource).toHaveBeenCalledTimes(1);
    expect(gateway.notifyClassesTransferredTarget).toHaveBeenCalledTimes(1);
  });

  // `classes.is_active` is NOT NULL, so the NULL case can't be seeded here; the unit spec covers it.
  it('reports each per-class failure, changes nothing for them, and audits only in-scope classes', async () => {
    const ok = await makeClass('ok');
    const inactive = await makeClass('inactive', { isActive: false });
    const wrongSchool = await makeClass('wrong-school', { schoolId: ids.schoolB });
    const googleNoConn = await makeClass('google-no-conn', {
      schoolId: ids.schoolC,
      googleCourseId: `${TAG}-course-c`,
    });
    const softDeleted = await makeClass('soft-deleted', { deleted: true });
    const notOwned = await makeClass('not-owned', { owner: ids.otherOwnerSameAdmin });
    const otherAdmins = await makeClass('other-admin', { owner: ids.educatorOfAdminB });
    const missing = randomUUID();

    const { data } = await transfer([
      ok,
      inactive,
      wrongSchool,
      googleNoConn,
      softDeleted,
      notOwned,
      otherAdmins,
      missing,
    ]);

    expect(data!.transferred.map((t) => t.classId)).toEqual([ok]);
    expect(Object.fromEntries(data!.failed.map((f) => [f.classId, f.reasonCode]))).toEqual({
      [inactive]: ClassTransferFailureReason.CLASS_INACTIVE,
      [wrongSchool]: ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
      [googleNoConn]: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
      [softDeleted]: ClassTransferFailureReason.CLASS_NOT_FOUND,
      [notOwned]: ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE,
      [otherAdmins]: ClassTransferFailureReason.CLASS_NOT_FOUND,
      [missing]: ClassTransferFailureReason.CLASS_NOT_FOUND,
    });
    expect(data!.failed.find((f) => f.classId === otherAdmins)?.className).toBeNull();

    for (const [classId, owner] of [
      [inactive, ids.source],
      [wrongSchool, ids.source],
      [googleNoConn, ids.source],
      [notOwned, ids.otherOwnerSameAdmin],
      [otherAdmins, ids.educatorOfAdminB],
    ]) {
      expect(await ownerOf(classId)).toBe(owner);
    }

    for (const [classId, reason] of [
      [inactive, 'CLASS_INACTIVE'],
      [wrongSchool, 'TARGET_NOT_IN_CLASS_SCHOOL'],
      [googleNoConn, 'TARGET_NO_GOOGLE_CONNECTION'],
      [softDeleted, 'CLASS_NOT_FOUND'],
      [notOwned, 'CLASS_NOT_OWNED_BY_SOURCE'],
    ]) {
      expect(await auditsFor(classId)).toEqual([
        { status: 'FAILED', notes: reason, batch_id: data!.batchId, admin_id: ids.adminAUser },
      ]);
    }
    // Nothing is recorded about another admin's class or an unknown id.
    expect(await auditsFor(otherAdmins)).toEqual([]);
    expect(await auditsFor(missing)).toEqual([]);
  });

  it('rolls a class back completely when its transaction fails, and records it as FAILED', async () => {
    const boom = await makeClass('boom');
    const fine = await makeClass('fine');
    await q(
      `INSERT INTO class_educators (class_id, educator_id, is_primary) VALUES ($1, $2, true)`,
      [boom, ids.source],
    );
    await q(
      `INSERT INTO google_course_mappings (school_id, class_id, google_course_id, linked_by_educator_id)
       VALUES ($1, $2, $3, $4)`,
      [ids.schoolA, boom, `${TAG}-course-boom`, ids.source],
    );
    // Make the SUCCESS audit insert — the last write before the library sync — fail for one class.
    await q(`CREATE OR REPLACE FUNCTION bulk_xfer_boom_fn() RETURNS trigger AS $$
      BEGIN
        IF NEW.class_name = '${TAG}-boom' AND NEW.status = 'SUCCESS' THEN
          RAISE EXCEPTION 'forced failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER bulk_xfer_boom BEFORE INSERT ON class_transfer_audits
             FOR EACH ROW EXECUTE FUNCTION bulk_xfer_boom_fn()`);

    try {
      const { data } = await transfer([boom, fine]);

      expect(data!.failed).toEqual([
        expect.objectContaining({
          classId: boom,
          reasonCode: ClassTransferFailureReason.TRANSFER_FAILED,
        }),
      ]);
      expect(data!.transferred.map((t) => t.classId)).toEqual([fine]);
    } finally {
      await q(`DROP TRIGGER IF EXISTS bulk_xfer_boom ON class_transfer_audits`);
      await q(`DROP FUNCTION IF EXISTS bulk_xfer_boom_fn()`);
    }

    expect(await ownerOf(boom)).toBe(ids.source);
    expect(await studentOwners(boom)).toEqual([ids.source, ids.source]);
    expect(await coInstructorRows(boom)).toEqual([{ educator_id: ids.source, is_primary: true }]);
    expect(
      await one(`SELECT linked_by_educator_id FROM google_course_mappings WHERE class_id = $1`, [
        boom,
      ]),
    ).toEqual({ linked_by_educator_id: ids.source });
    expect(await auditsFor(boom)).toEqual([
      expect.objectContaining({ status: 'FAILED', notes: 'TRANSFER_FAILED' }),
    ]);
    expect(await ownerOf(fine)).toBe(ids.target);
  });

  it('lets only one of two concurrent bulk calls move the same class', async () => {
    const contested = await makeClass('contested');

    const [first, second] = await Promise.all([transfer([contested]), transfer([contested])]);
    const outcomes = [first.data!, second.data!];

    expect(outcomes.map((o) => o.transferredCount).sort()).toEqual([0, 1]);
    expect(outcomes.find((o) => o.failedCount === 1)?.failed[0].reasonCode).toBe(
      ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE,
    );
    expect(await ownerOf(contested)).toBe(ids.target);
    const statuses = (await auditsFor(contested)).map((a) => a.status).sort();
    expect(statuses).toEqual(['FAILED', 'SUCCESS']);
  });

  describe('guarded write', () => {
    const write = (classId: string, label: string) =>
      classRepository.transferClassInBatch({
        batchId: randomUUID(),
        classId,
        className: `${TAG}-${label}`,
        sourceEducatorId: ids.source,
        sourceEducatorName: 'Source',
        targetEducatorId: ids.coInstructor,
        targetEducatorName: 'Co',
        adminId: ids.adminAUser,
        adminEmail: null,
      });

    it.each([
      [
        'now owned by someone else',
        { owner: 'target' },
        ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE,
      ],
      [
        'deactivated since the checks',
        { isActive: false },
        ClassTransferFailureReason.CLASS_INACTIVE,
      ],
      [
        'soft-deleted since the checks',
        { deleted: true },
        ClassTransferFailureReason.CLASS_NOT_FOUND,
      ],
      [
        'archived since the checks',
        { status: 'ARCHIVED' },
        ClassTransferFailureReason.CLASS_ARCHIVED,
      ],
    ] as const)(
      'refuses a class %s, reporting why and changing nothing',
      async (label, spec, reason) => {
        const classId = await makeClass(`guard-${label.split(' ')[0]}`, {
          ...spec,
          owner: 'owner' in spec ? ids.target : ids.source,
        });
        const ownerBefore = await ownerOf(classId);

        const error = await write(classId, `guard-${label}`).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ClassTransferConflictException);
        expect((error as ClassTransferConflictException).reason).toBe(reason);
        expect(await ownerOf(classId)).toBe(ownerBefore);
        expect(await auditsFor(classId)).toEqual([]);
      },
    );
  });

  it('refuses the same educator sent in different letter case, writing nothing', async () => {
    const untouched = await makeClass('same-educator-case');

    await expect(transfer([untouched], { target: ids.source.toUpperCase() })).rejects.toMatchObject(
      { status: 400 },
    );

    expect(await ownerOf(untouched)).toBe(ids.source);
    expect(await auditsFor(untouched)).toEqual([]);
  });

  it('stops when out of time: reports untouched classes as NOT_PROCESSED with FAILED audit rows', async () => {
    // A zero request timeout leaves no budget, so not a single class is attempted.
    const outOfTime = new ClassTransferService(
      classRepository,
      new EducatorRepository(dataSource.getRepository(Educator)),
      new ClassTransferAuditRepository(dataSource.getRepository(ClassTransferAudit)),
      gateway as unknown as NotificationsGateway,
      logger as unknown as LoggerService,
      new GoogleSchoolConnectionRepository(dataSource.getRepository(GoogleSchoolConnection)),
      { t: (key: string) => key } as unknown as I18nService,
      { get: () => undefined } as unknown as ClsService,
      { get: () => 0 } as unknown as ConfigService,
    );
    const first = await makeClass('budget-1');
    const second = await makeClass('budget-2');

    const { data } = await outOfTime.bulkTransfer(adminUser, {
      sourceEducatorId: ids.source,
      targetEducatorId: ids.target,
      classIds: [first, second],
    });

    expect(data).toMatchObject({ transferredCount: 0, failedCount: 2, transferredAt: null });
    expect(data!.failed.map((f) => f.reasonCode)).toEqual([
      ClassTransferFailureReason.NOT_PROCESSED,
      ClassTransferFailureReason.NOT_PROCESSED,
    ]);
    for (const classId of [first, second]) {
      expect(await ownerOf(classId)).toBe(ids.source);
      expect(await auditsFor(classId)).toEqual([
        {
          status: 'FAILED',
          notes: 'NOT_PROCESSED',
          batch_id: data!.batchId,
          admin_id: ids.adminAUser,
        },
      ]);
    }
    expect(gateway.notifyClassesTransferredSource).not.toHaveBeenCalled();
  });

  it('refuses the whole request when the target belongs to another admin, writing nothing', async () => {
    const untouched = await makeClass('untouched');

    await expect(transfer([untouched], { target: ids.educatorOfAdminB })).rejects.toMatchObject({
      status: 404,
    });

    expect(await ownerOf(untouched)).toBe(ids.source);
    expect(await auditsFor(untouched)).toEqual([]);
  });

  it('refuses the whole request when the source is not active', async () => {
    const pendingSource = await educator('Pending', ids.adminA, [ids.schoolA], {
      status: 'PENDING',
    });
    const theirs = await makeClass('pending-owned', { owner: pendingSource });

    await expect(transfer([theirs], { source: pendingSource })).rejects.toMatchObject({
      status: 400,
    });
    expect(await ownerOf(theirs)).toBe(pendingSource);
  });

  it('leaves the legacy single transfer writing batch_id NULL, exposed as batchId: null', async () => {
    const legacy = await makeClass('legacy');

    const audit = await classRepository.transferToEducator({
      classId: legacy,
      className: `${TAG}-legacy`,
      sourceEducatorId: ids.source,
      sourceEducatorName: 'Source',
      targetEducatorId: ids.target,
      targetEducatorName: 'Target',
      adminId: ids.adminAUser,
      adminEmail: null,
    });

    expect(await auditsFor(legacy)).toEqual([
      { status: 'SUCCESS', notes: null, batch_id: null, admin_id: ids.adminAUser },
    ]);
    // Legacy POST /class-transfers returns this row: existing fields unchanged, plus `batchId: null`.
    expect(JSON.parse(JSON.stringify(audit))).toMatchObject({
      classId: legacy,
      sourceEducatorId: ids.source,
      targetEducatorId: ids.target,
      status: 'SUCCESS',
      notes: null,
      batchId: null,
    });
  });

  describe('Google connection status (only ACTIVE counts)', () => {
    const receivers: Record<string, string> = {};

    beforeAll(async () => {
      // Each receiver teaches at school A; their Google connection there differs by status.
      receivers.none = await educator('Google None', ids.adminA, [ids.schoolA]);
      for (const status of ['active', 'revoked', 'error']) {
        receivers[status] = await educator(`Google ${status}`, ids.adminA, [ids.schoolA]);
        await q(
          `INSERT INTO google_school_connections (school_id, connected_by_educator_id, access_token, scopes, status)
           VALUES ($1, $2, 'test-token', 'classroom', $3)`,
          [ids.schoolA, receivers[status], status],
        );
      }
    });

    it.each([
      ['no connection row', 'none', ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION],
      ['an active connection', 'active', null],
      ['a revoked connection', 'revoked', ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION],
      ['an error connection', 'error', ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION],
    ])('class list: a receiver with %s', async (_label, receiver, expected) => {
      const googleClass = await makeClass(`gstatus-list-${receiver}`, {
        googleCourseId: `${TAG}-gstatus-list-${receiver}`,
      });

      const { data } = await service.listTransferClasses(adminUser, ids.source, {
        page: 1,
        pageSize: 50,
        search: `gstatus-list-${receiver}`,
        targetEducatorId: receivers[receiver],
      });

      expect(data!.map((c) => [c.classId, c.googleLinked, c.reasonCode])).toEqual([
        [googleClass, true, expected],
      ]);
    });

    it.each([
      ['a revoked connection', 'revoked'],
      ['an error connection', 'error'],
    ])(
      'bulk transfer: refuses a Google class for a receiver with %s, moving nothing',
      async (_label, receiver) => {
        const googleClass = await makeClass(`gstatus-bulk-${receiver}`, {
          googleCourseId: `${TAG}-gstatus-bulk-${receiver}`,
        });

        const { data } = await transfer([googleClass], { target: receivers[receiver] });

        expect(data!.failed).toEqual([
          expect.objectContaining({
            classId: googleClass,
            reasonCode: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
          }),
        ]);
        expect(await ownerOf(googleClass)).toBe(ids.source);
      },
    );
  });

  describe('class status (archived blocked; INACTIVE and DRAFT allowed)', () => {
    it('bulk transfer: moves INACTIVE and DRAFT classes and refuses archived ones', async () => {
      const inactive = await makeClass('status-inactive', { status: 'INACTIVE' });
      const draft = await makeClass('status-draft', { status: 'DRAFT' });
      const archived = await makeClass('status-archived', { status: 'ARCHIVED' });
      const archieved = await makeClass('status-archieved', { status: 'ARCHIEVED' });

      const { data } = await transfer([inactive, draft, archived, archieved]);

      expect(data!.transferred.map((t) => t.classId).sort()).toEqual([inactive, draft].sort());
      expect(Object.fromEntries(data!.failed.map((f) => [f.classId, f.reasonCode]))).toEqual({
        [archived]: ClassTransferFailureReason.CLASS_ARCHIVED,
        [archieved]: ClassTransferFailureReason.CLASS_ARCHIVED,
      });
      expect(await ownerOf(inactive)).toBe(ids.target);
      expect(await ownerOf(draft)).toBe(ids.target);
      expect(await ownerOf(archived)).toBe(ids.source);
      expect(await ownerOf(archieved)).toBe(ids.source);
      expect(await auditsFor(archived)).toEqual([
        expect.objectContaining({ status: 'FAILED', notes: 'CLASS_ARCHIVED' }),
      ]);
    });

    it('class list: flags archived classes, and transferableOnly hides them', async () => {
      const statusOwner = await educator('StatusOwner', ids.adminA, [ids.schoolA]);
      const draft = await makeClass('list-status-draft', {
        owner: statusOwner,
        status: 'DRAFT',
        students: 0,
      });
      const archived = await makeClass('list-status-archived', {
        owner: statusOwner,
        status: 'ARCHIVED',
        students: 0,
      });
      const list = (dto: Record<string, unknown> = {}) =>
        service.listTransferClasses(adminUser, statusOwner, { page: 1, pageSize: 50, ...dto });

      const all = await list();
      expect(Object.fromEntries(all.data!.map((c) => [c.classId, c.reasonCode]))).toEqual({
        [draft]: null,
        [archived]: ClassTransferFailureReason.CLASS_ARCHIVED,
      });

      const transferableOnly = await list({ transferableOnly: true });
      expect(transferableOnly.data!.map((c) => c.classId)).toEqual([draft]);
      expect(transferableOnly.meta).toMatchObject({ total: 1 });
    });
  });

  describe('class list for the transfer picker', () => {
    let listSource: string;
    const classIds: Record<string, string> = {};

    beforeAll(async () => {
      listSource = await educator('ListSource', ids.adminA, [ids.schoolA, ids.schoolB]);
      const specs: Array<[string, ClassSpec & { students?: number }]> = [
        ['alpha', { students: 3 }],
        ['bravo', { students: 1 }],
        ['charlie-inactive', { isActive: false, students: 0 }],
        ['delta-school-b', { schoolId: ids.schoolB, students: 0 }],
        [
          'echo-google-c',
          { schoolId: ids.schoolC, googleCourseId: `${TAG}-list-course`, students: 0 },
        ],
        ['foxtrot-deleted', { deleted: true, students: 0 }],
      ];
      for (const [index, [label, spec]] of specs.entries()) {
        classIds[label] = await makeClass(`list-${label}`, { ...spec, owner: listSource });
        // Deterministic "newest first": later entries are newer.
        await q(`UPDATE classes SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [
          classIds[label],
          100 - index,
        ]);
      }
      // A class owned by someone else must never appear.
      await makeClass('list-not-mine', { owner: ids.source });
      // Live count: a soft-deleted and an inactive student in "alpha" are not counted.
      await q(
        `UPDATE students SET deleted_at = now() WHERE id = (SELECT id FROM students WHERE class_id = $1 LIMIT 1)`,
        [classIds['alpha']],
      );
      await q(
        `INSERT INTO students (student_id, class_id, educator_id, is_active) VALUES ($1, $2, $3, false)`,
        [`${TAG}-list-inactive-student`, classIds['alpha'], listSource],
      );
    });

    const list = (dto: Record<string, unknown> = {}, educatorId = listSource) =>
      service.listTransferClasses(adminUser, educatorId, { page: 1, pageSize: 10, ...dto });

    it('lists every non-deleted class the educator owns, newest first, with live counts and flags', async () => {
      const { data, meta } = await list();

      expect(meta).toMatchObject({ total: 5, page: 1, pageSize: 10, totalPages: 1 });
      expect(data!.map((c) => c.className)).toEqual([
        `${TAG}-list-echo-google-c`,
        `${TAG}-list-delta-school-b`,
        `${TAG}-list-charlie-inactive`,
        `${TAG}-list-bravo`,
        `${TAG}-list-alpha`,
      ]);
      const alpha = data!.find((c) => c.classId === classIds['alpha'])!;
      expect(alpha).toMatchObject({
        studentsCount: 2,
        schoolId: ids.schoolA,
        schoolName: `${TAG}-A`,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        transferable: true,
        reasonCode: null,
      });
      expect(data!.find((c) => c.classId === classIds['charlie-inactive'])).toMatchObject({
        isActive: false,
        transferable: false,
        reasonCode: ClassTransferFailureReason.CLASS_INACTIVE,
      });
      expect(data!.find((c) => c.classId === classIds['echo-google-c'])?.googleLinked).toBe(true);
    });

    it('paginates with a true total, including a page past the end', async () => {
      const second = await list({ page: 2, pageSize: 2 });
      expect(second.data!.map((c) => c.className)).toEqual([
        `${TAG}-list-charlie-inactive`,
        `${TAG}-list-bravo`,
      ]);
      expect(second.meta).toMatchObject({
        total: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });

      const pastEnd = await list({ page: 9, pageSize: 2 });
      expect(pastEnd.data).toEqual([]);
      expect(pastEnd.meta).toMatchObject({ total: 5, hasNextPage: false });
    });

    it('searches class names case-insensitively, with a matching total', async () => {
      const { data, meta } = await list({ search: 'BRAVO' });
      expect(data!.map((c) => c.classId)).toEqual([classIds['bravo']]);
      expect(meta).toMatchObject({ total: 1 });
    });

    it('sorts by the live student count', async () => {
      const { data } = await list({ sortBy: 'students', sortDir: 'desc', pageSize: 2 });
      expect(data!.map((c) => [c.classId, c.studentsCount])).toEqual([
        [classIds['alpha'], 2],
        [classIds['bravo'], 1],
      ]);
    });

    it('with a target, flags the classes it could not receive', async () => {
      const { data } = await list({ targetEducatorId: ids.target });
      const reasons = Object.fromEntries(data!.map((c) => [c.classId, c.reasonCode]));
      expect(reasons).toEqual({
        [classIds['alpha']]: null,
        [classIds['bravo']]: null,
        [classIds['charlie-inactive']]: ClassTransferFailureReason.CLASS_INACTIVE,
        [classIds['delta-school-b']]: ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
        [classIds['echo-google-c']]: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
      });
    });

    it('with transferableOnly, hides inactive classes from the page and the total', async () => {
      const { data, meta } = await list({ transferableOnly: true });
      expect(meta).toMatchObject({ total: 4 });
      expect(data!.map((c) => c.classId)).not.toContain(classIds['charlie-inactive']);
      expect(data!.every((c) => c.isActive)).toBe(true);
    });

    it('with transferableOnly and a target, still flags classes the receiver cannot take', async () => {
      const { data } = await list({ transferableOnly: true, targetEducatorId: ids.target });
      const reasons = Object.fromEntries(data!.map((c) => [c.classId, c.reasonCode]));
      expect(reasons).toEqual({
        [classIds['alpha']]: null,
        [classIds['bravo']]: null,
        [classIds['delta-school-b']]: ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
        [classIds['echo-google-c']]: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
      });
    });

    it('treats % and _ in the search as literal characters, not wildcards', async () => {
      const wildcardOwner = await educator('WildcardOwner', ids.adminA, [ids.schoolA]);
      const percent = await makeClass('wild-score-100%-club', {
        owner: wildcardOwner,
        students: 0,
      });
      await makeClass('wild-1000-club', { owner: wildcardOwner, students: 0 });
      const underscore = await makeClass('wild-under_score', { owner: wildcardOwner, students: 0 });
      await makeClass('wild-underxscore', { owner: wildcardOwner, students: 0 });
      const search = (term: string) =>
        service.listTransferClasses(adminUser, wildcardOwner, {
          page: 1,
          pageSize: 50,
          search: term,
        });

      // `%` alone would match every class if it were a wildcard.
      expect((await search('%')).data!.map((c) => c.classId)).toEqual([percent]);
      // "100%" must not also match "1000".
      expect((await search('100%')).data!.map((c) => c.classId)).toEqual([percent]);
      // `_` must not match any single character ("underxscore").
      const underscoreHits = await search('under_score');
      expect(underscoreHits.data!.map((c) => c.classId)).toEqual([underscore]);
      expect(underscoreHits.meta).toMatchObject({ total: 1 });
    });

    it("refuses another admin's educator with 404", async () => {
      await expect(list({}, ids.educatorOfAdminB)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('receiving-educator list for the transfer picker', () => {
    // Its own district admin, so educators seeded by other tests never show up here.
    let adminCUser: ICurrentUser;
    const t: Record<string, string> = {};
    const emailOf = (key: string): string => `bulk-xfer-${RUN_TAG}-tgt-${key}@example.com`;
    const setEmail = (educatorId: string, email: string) =>
      q(
        `UPDATE users SET email = $2 WHERE id = (
           SELECT ur.user_id FROM user_roles ur JOIN educators e ON e.user_role_id = ur.user_role_id
            WHERE e.id = $1)`,
        [educatorId, email],
      );

    beforeAll(async () => {
      const adminC = await districtAdmin();
      adminCUser = { userId: adminC.userId, email: 'admin-c@example.com', adminId: adminC.adminId };
      const adminId = adminC.adminId;

      t.source = await educator('Tgt Source', adminId, [ids.schoolA]);
      // Listed.
      t.max = await educator('Tgt Max', adminId, [ids.schoolA, ids.schoolB]);
      t.mia = await educator('Tgt Mia', adminId, [ids.schoolA]);
      t.zed = await educator('Tgt Zed', adminId, []);
      t.nameless = await educator('Tgt Nameless', adminId, []);
      // Not listed.
      t.switchedOff = await educator('Tgt SwitchedOff', adminId, [ids.schoolA], {
        isActive: false,
      });
      t.pending = await educator('Tgt Pending', adminId, [ids.schoolA], { status: 'PENDING' });
      t.inactive = await educator('Tgt Inactive', adminId, [ids.schoolA], { status: 'INACTIVE' });
      t.deleted = await educator('Tgt Deleted', adminId, [ids.schoolA]);
      t.roleDeleted = await educator('Tgt RoleDeleted', adminId, [ids.schoolA]);

      // Mia's legacy school is also one of her assignments: counted once.
      await q(`UPDATE educators SET school_id = $2 WHERE id = $1`, [t.mia, ids.schoolA]);
      // The nameless educator has only a legacy school, and no name.
      await q(`UPDATE educators SET school_id = $2, full_name = NULL WHERE id = $1`, [
        t.nameless,
        ids.schoolB,
      ]);
      await q(`UPDATE educators SET deleted_at = now() WHERE id = $1`, [t.deleted]);
      await q(
        `UPDATE user_roles SET deleted_at = now()
          WHERE user_role_id = (SELECT user_role_id FROM educators WHERE id = $1)`,
        [t.roleDeleted],
      );
      await setEmail(t.mia, emailOf('a'));
      await setEmail(t.zed, emailOf('b'));
      await setEmail(t.max, emailOf('c'));
      await setEmail(t.nameless, emailOf('nameless'));
    });

    afterAll(async () => {
      // The nameless educator (and any class moved to it) isn't caught by the name-based cleanup.
      const educatorIds = Object.values(t);
      await q(
        `DELETE FROM class_transfer_audits WHERE class_id IN (SELECT id::text FROM classes WHERE educator_id = ANY($1))`,
        [educatorIds],
      );
      await q(`DELETE FROM educator_simulations WHERE educator_id = ANY($1)`, [educatorIds]);
      await q(`DELETE FROM classes WHERE educator_id = ANY($1)`, [educatorIds]);
      await q(`DELETE FROM educators WHERE id = ANY($1)`, [educatorIds]);
    });

    const listTargets = (dto: Record<string, unknown> = {}, educatorId = t.source) =>
      service.listTransferTargetEducators(adminCUser, educatorId, {
        page: 1,
        pageSize: 10,
        ...dto,
      });

    it('lists only active, non-deleted educators of the same admin, never the source', async () => {
      const { data, meta } = await listTargets();

      expect(meta).toMatchObject({ total: 4, page: 1, pageSize: 10, totalPages: 1 });
      expect(data!.map((e) => e.educatorId).sort()).toEqual(
        [t.max, t.mia, t.zed, t.nameless].sort(),
      );
    });

    it('counts schools once each: assignments plus the legacy school, without listing them', async () => {
      const { data } = await listTargets();
      const counts = Object.fromEntries(data!.map((e) => [e.educatorId, e.schoolsCount]));
      expect(counts).toEqual({ [t.max]: 2, [t.mia]: 1, [t.zed]: 0, [t.nameless]: 1 });
      expect(
        data!.every((e) => Object.keys(e).sort().join() === 'educatorId,email,name,schoolsCount'),
      ).toBe(true);
    });

    it('falls back to the email when the educator has no name', async () => {
      const { data } = await listTargets({ search: 'tgt-nameless' });
      expect(data).toEqual([
        {
          educatorId: t.nameless,
          name: emailOf('nameless'),
          email: emailOf('nameless'),
          schoolsCount: 1,
        },
      ]);
    });

    it('sorts by name by default, in both directions', async () => {
      const named = (rows: Array<{ educatorId: string }>) =>
        rows.map((e) => e.educatorId).filter((id) => id !== t.nameless);
      expect(named((await listTargets()).data!)).toEqual([t.max, t.mia, t.zed]);
      expect(named((await listTargets({ sortDir: 'desc' })).data!)).toEqual([t.zed, t.mia, t.max]);
    });

    it('sorts by email and pages through with a true total', async () => {
      const first = await listTargets({ sortBy: 'email', page: 1, pageSize: 2 });
      const second = await listTargets({ sortBy: 'email', page: 2, pageSize: 2 });

      expect(first.data!.map((e) => e.educatorId)).toEqual([t.mia, t.zed]);
      expect(second.data!.map((e) => e.educatorId)).toEqual([t.max, t.nameless]);
      expect(second.meta).toMatchObject({ total: 4, totalPages: 2, hasNextPage: false });
    });

    it('combines search, sortDir=desc and page=2 with a total that counts only the matches', async () => {
      // "tgt" matches every seeded educator by name or email; only the four eligible ones count.
      const all = await listTargets({ search: 'tgt', sortDir: 'desc', pageSize: 50 });
      const second = await listTargets({ search: 'tgt', sortDir: 'desc', page: 2, pageSize: 2 });

      expect(all.data!.map((e) => e.educatorId).sort()).toEqual(
        [t.max, t.mia, t.zed, t.nameless].sort(),
      );
      expect(second.data!.map((e) => e.educatorId)).toEqual(
        all.data!.slice(2, 4).map((e) => e.educatorId),
      );
      expect(second.meta).toMatchObject({
        total: 4,
        page: 2,
        pageSize: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
      });
      // desc is the mirror of the default ascending order for the same search.
      const asc = await listTargets({ search: 'tgt', pageSize: 50 });
      expect(all.data!.map((e) => e.educatorId)).toEqual(
        asc.data!.map((e) => e.educatorId).reverse(),
      );
    });

    it('searches the name or the email case-insensitively, with a matching total', async () => {
      const byName = await listTargets({ search: 'TGT MIA' });
      expect(byName.data!.map((e) => e.educatorId)).toEqual([t.mia]);
      expect(byName.meta).toMatchObject({ total: 1 });

      const byEmail = await listTargets({ search: 'tgt-c@' });
      expect(byEmail.data!.map((e) => e.educatorId)).toEqual([t.max]);
    });

    it('treats % and _ in the search as literal characters, not wildcards', async () => {
      for (const term of ['%', '_']) {
        const { data, meta } = await listTargets({ search: term });
        expect(data).toEqual([]);
        expect(meta).toMatchObject({ total: 0 });
      }
    });

    it("refuses another admin's educator as the source with 404", async () => {
      await expect(listTargets({}, ids.educatorOfAdminB)).rejects.toMatchObject({ status: 404 });
    });

    it('sorts an educator with no name and no email by its id, the label it is shown with', async () => {
      t.anonymous = await educator('Tgt Anonymous', adminCUser.adminId!, []);
      await q(`UPDATE educators SET full_name = NULL WHERE id = $1`, [t.anonymous]);
      const userId = (
        await one<{ user_id: string }>(
          `SELECT ur.user_id FROM user_roles ur JOIN educators e ON e.user_role_id = ur.user_role_id
            WHERE e.id = $1`,
          [t.anonymous],
        )
      ).user_id;
      // `users.email` is NOT NULL; the email reads as null once the users row is soft-deleted.
      await q(`UPDATE users SET deleted_at = now() WHERE id = $1`, [userId]);
      try {
        const asc = (await listTargets()).data!;
        const desc = (await listTargets({ sortDir: 'desc' })).data!;

        expect(asc.find((e) => e.educatorId === t.anonymous)).toMatchObject({
          name: t.anonymous,
          email: null,
        });
        // With a NULL sort key the row would sit last in both directions; on its label the two
        // orders are exact mirrors.
        expect(desc.map((e) => e.educatorId)).toEqual(asc.map((e) => e.educatorId).reverse());
      } finally {
        // Out of the list for the tests below; the email-based cleanup still removes the user.
        await q(`UPDATE educators SET deleted_at = now() WHERE id = $1`, [t.anonymous]);
      }
    });

    it('every listed educator is accepted by the bulk transfer; an unlisted one is not', async () => {
      const { data } = await listTargets();
      for (const target of data!) {
        const classId = await makeClass(`tgt-to-${target.educatorId}`, {
          owner: t.source,
          schoolId: null,
          students: 0,
        });
        const result = await service.bulkTransfer(adminCUser, {
          sourceEducatorId: t.source,
          targetEducatorId: target.educatorId,
          classIds: [classId],
        });
        expect(result.data!.transferredCount).toBe(1);
      }

      // `is_active = false` with an ACTIVE role: not listed, and the transfer refuses it too.
      const classId = await makeClass('tgt-to-switched-off', {
        owner: t.source,
        schoolId: null,
        students: 0,
      });
      await expect(
        service.bulkTransfer(adminCUser, {
          sourceEducatorId: t.source,
          targetEducatorId: t.switchedOff,
          classIds: [classId],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describePerf('timing (opt-in)', () => {
    it('transfers 50 classes × 30 students × 5 simulations well inside the request timeout', async () => {
      const classIds: string[] = [];
      for (let i = 0; i < 50; i += 1) {
        const classId = await makeClass(`perf-${i}`, { students: 0 });
        await q(
          `INSERT INTO students (student_id, class_id, educator_id, school_id)
           SELECT $1 || g, $2, $3, $4 FROM generate_series(1, 30) g`,
          [`${TAG}-perf-${i}-`, classId, ids.source, ids.schoolA],
        );
        await q(
          `INSERT INTO class_simulations (class_id, simulation_id, is_active)
           SELECT $1, $2 || g, true FROM generate_series(1, 5) g`,
          [classId, `${TAG}-perf-sim-`],
        );
        classIds.push(classId);
      }

      const started = Date.now();
      const { data } = await transfer(classIds);
      const elapsedMs = Date.now() - started;
      // eslint-disable-next-line no-console
      console.log(`Bulk class transfer of 50 classes took ${elapsedMs} ms`);

      expect(data!.transferredCount).toBe(50);
      expect(elapsedMs).toBeLessThan(30000);
    });
  });
});
