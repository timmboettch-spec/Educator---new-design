import { DataSource, QueryRunner } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { Educator, Invite, UserRole } from '../../../src/database/entities';
import { EducatorRepository } from '../../../src/database/repositories/educator.repository';
import { InviteRepository } from '../../../src/database/repositories/invite.repository';
import { UserRoleRepository } from '../../../src/database/repositories/user-role.repository';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { ExpireOrphanedEducatorInvites1791790891728 } from '../../../src/database/migrations/1791790891728-ExpireOrphanedEducatorInvites';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
const describeWithDb = hasDbConfig ? describe : describe.skip;

// Unique per run so concurrent runs against a shared DB never touch each other's rows.
const RUN_TAG = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = `RE248-${RUN_TAG}`;

type Row = Record<string, unknown>;

/**
 * Runs the RE-248 queries against real Postgres: the case-insensitive invite deletes, the
 * live-educator check that decides whether a deleted educator's role is reused, the role status
 * write, and the migration that expires invites orphaned before the fix.
 */
describeWithDb('Educator re-invite after delete (DB Integration)', () => {
  let dataSource: DataSource;
  let inviteRepository: InviteRepository;
  let educatorRepository: EducatorRepository;
  let userRoleRepository: UserRoleRepository;
  let seq = 0;

  const q = <T = Row>(sql: string, params: unknown[] = []): Promise<T[]> =>
    dataSource.query(sql, params);
  const one = async <T = Row>(sql: string, params: unknown[] = []): Promise<T> =>
    (await q<T>(sql, params))[0];

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    inviteRepository = new InviteRepository(dataSource.getRepository(Invite));
    educatorRepository = new EducatorRepository(dataSource.getRepository(Educator));
    userRoleRepository = new UserRoleRepository(dataSource.getRepository(UserRole));
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanup();
      await dataSource.destroy();
    }
  });

  // ── Seeding ───────────────────────────────────────────────────────────

  function email(label: string): string {
    seq += 1;
    return `re248-${RUN_TAG}-${label}-${seq}@example.com`;
  }

  async function invite(inviteEmail: string, status: string): Promise<string> {
    return (
      await one<{ id: string }>(
        `INSERT INTO invites (email, status) VALUES ($1, $2) RETURNING id`,
        [inviteEmail, status],
      )
    ).id;
  }

  async function inviteStatus(id: string): Promise<string | undefined> {
    return (await q<{ status: string }>(`SELECT status FROM invites WHERE id = $1`, [id]))[0]
      ?.status;
  }

  /** An account with an EDUCATOR role and, unless `withEducator` is false, a linked educator row. */
  async function educatorAccount(
    accountEmail: string,
    opts: { roleStatus?: string; withEducator?: boolean; deleted?: boolean } = {},
  ): Promise<{ userRoleId: string }> {
    const user = await one<{ id: string }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [
      accountEmail,
    ]);
    const role = await one<{ id: string }>(`SELECT id FROM role WHERE slug = 'educator'`);
    const ur = await one<{ user_role_id: string }>(
      `INSERT INTO user_roles (user_id, role_id, status) VALUES ($1, $2, $3) RETURNING user_role_id`,
      [user.id, role.id, opts.roleStatus ?? CommonStatus.PENDING],
    );
    if (opts.withEducator !== false) {
      await q(
        `INSERT INTO educators (full_name, is_active, user_role_id, deleted_at)
         VALUES ($1, $2, $3, $4)`,
        [`${TAG} educator`, !opts.deleted, ur.user_role_id, opts.deleted ? new Date() : null],
      );
    }
    return { userRoleId: ur.user_role_id };
  }

  async function cleanup(): Promise<void> {
    const like = `re248-${RUN_TAG}-%`;
    await q(`DELETE FROM invites WHERE lower(email) LIKE $1`, [like]);
    await q(`DELETE FROM educators WHERE full_name LIKE $1`, [`${TAG}%`]);
    await q(`DELETE FROM users WHERE email LIKE $1`, [like]); // cascades to user_roles
  }

  // ── Repositories ──────────────────────────────────────────────────────

  describe('InviteRepository.deleteByEmail', () => {
    it('deletes every invite for the email in any letter case, of any status, and nothing else', async () => {
      const target = email('target');
      const mixedCase = await invite(target.toUpperCase(), 'PENDING');
      const accepted = await invite(target, 'ACCEPTED');
      const other = await invite(email('other'), 'PENDING');

      const affected = await inviteRepository.deleteByEmail(target);

      expect(affected).toBe(2);
      expect(await inviteStatus(mixedCase)).toBeUndefined();
      expect(await inviteStatus(accepted)).toBeUndefined();
      expect(await inviteStatus(other)).toBe('PENDING');
    });
  });

  describe('InviteRepository.deletePendingByEmail', () => {
    it('deletes only the PENDING invites for the email, in any letter case', async () => {
      const target = email('target');
      const pending = await invite(target.toUpperCase(), 'PENDING');
      const accepted = await invite(target, 'ACCEPTED');

      const affected = await inviteRepository.deletePendingByEmail(target);

      expect(affected).toBe(1);
      expect(await inviteStatus(pending)).toBeUndefined();
      expect(await inviteStatus(accepted)).toBe('ACCEPTED');
    });
  });

  describe('EducatorRepository.existsByUserRoleId', () => {
    it('is true for a live educator', async () => {
      const { userRoleId } = await educatorAccount(email('live'));
      expect(await educatorRepository.existsByUserRoleId(userRoleId)).toBe(true);
    });

    it('is false once the educator is soft-deleted', async () => {
      const { userRoleId } = await educatorAccount(email('deleted'), {
        roleStatus: CommonStatus.INACTIVE,
        deleted: true,
      });
      expect(await educatorRepository.existsByUserRoleId(userRoleId)).toBe(false);
    });

    it('is false for a role that never had an educator row', async () => {
      const { userRoleId } = await educatorAccount(email('none'), { withEducator: false });
      expect(await educatorRepository.existsByUserRoleId(userRoleId)).toBe(false);
    });
  });

  describe('UserRoleRepository.updateStatus', () => {
    it('reopens a deleted educator role as PENDING', async () => {
      const { userRoleId } = await educatorAccount(email('reopen'), {
        roleStatus: CommonStatus.INACTIVE,
        deleted: true,
      });

      await userRoleRepository.updateStatus(userRoleId, CommonStatus.PENDING);

      const row = await one<{ status: string }>(
        `SELECT status FROM user_roles WHERE user_role_id = $1`,
        [userRoleId],
      );
      expect(row.status).toBe(CommonStatus.PENDING);
    });
  });

  // ── Migration ─────────────────────────────────────────────────────────

  describe('ExpireOrphanedEducatorInvites migration', () => {
    // up()/down() touch every matching invite in the database, so they run inside a transaction
    // that is always rolled back — only this run's seeded rows are asserted on.
    let runner: QueryRunner;

    beforeEach(async () => {
      runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
    });

    afterEach(async () => {
      await runner.rollbackTransaction();
      await runner.release();
    });

    const seedInRunner = async (inviteEmail: string, status: string): Promise<string> =>
      (
        (await runner.query(`INSERT INTO invites (email, status) VALUES ($1, $2) RETURNING id`, [
          inviteEmail,
          status,
        ])) as { id: string }[]
      )[0].id;

    const statusInRunner = async (id: string): Promise<string> =>
      (
        (await runner.query(`SELECT status FROM invites WHERE id = $1`, [id])) as {
          status: string;
        }[]
      )[0].status;

    it('expires only orphaned PENDING invites, and down() restores them', async () => {
      // Seeded outside the runner's transaction, so they are committed before up() reads them.
      const liveEmail = email('live');
      const deletedEmail = email('deleted');
      await educatorAccount(liveEmail);
      await educatorAccount(deletedEmail, { roleStatus: CommonStatus.INACTIVE, deleted: true });

      const live = await seedInRunner(liveEmail, 'PENDING');
      const liveMixedCase = await seedInRunner(liveEmail.toUpperCase(), 'PENDING');
      const deleted = await seedInRunner(deletedEmail, 'PENDING');
      const noAccount = await seedInRunner(email('ghost'), 'PENDING');
      const accepted = await seedInRunner(deletedEmail, 'ACCEPTED');

      const migration = new ExpireOrphanedEducatorInvites1791790891728();
      await migration.up(runner);

      expect(await statusInRunner(live)).toBe('PENDING');
      expect(await statusInRunner(liveMixedCase)).toBe('PENDING');
      expect(await statusInRunner(deleted)).toBe('EXPIRED');
      expect(await statusInRunner(noAccount)).toBe('EXPIRED');
      expect(await statusInRunner(accepted)).toBe('ACCEPTED');

      await migration.down(runner);

      expect(await statusInRunner(deleted)).toBe('PENDING');
      expect(await statusInRunner(noAccount)).toBe('PENDING');
      expect(await statusInRunner(accepted)).toBe('ACCEPTED');
    });
  });
});
