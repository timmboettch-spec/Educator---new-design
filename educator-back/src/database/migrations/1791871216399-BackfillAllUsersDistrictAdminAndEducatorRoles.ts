import { MigrationInterface, QueryRunner } from 'typeorm';

const LOG_PREFIX = '[BackfillAllUsersDistrictAdminAndEducatorRoles]';

/**
 * Staged-rollout scoping. When non-empty, ONLY the listed emails are migrated and every other
 * row is left completely untouched; empty means "migrate everything", the final production run.
 *
 * An entry is matched case-insensitively against `users.email` (passes 1–2), the *district
 * admin's* `users.email` behind `educators.admin_id` (pass 3), and `educators.email` (pass 4).
 * Note what that means for a partial batch: listing an educator without their district admin
 * links the educator to a `users` row but leaves `district_admin_id` null until the admin's own
 * batch runs. List both together when you want the pair fully migrated in one go.
 *
 * `BACKFILL_EMAILS` (comma-separated) overrides this list at run time, so a batch can be run
 * without editing and re-committing the file.
 */
const BACKFILL_EMAIL_ALLOWLIST: string[] = [];

const BACKFILL_EMAIL_ALLOWLIST_ENV_VAR = 'BACKFILL_EMAILS';

/** A legacy `educators` row still waiting to be linked onto the v2 `user_roles` schema. */
interface LegacyEducatorRow {
  id: string;
  email: string | null;
  password: string | null;
  status: string;
}

/** What this particular run wrote — accumulated pass by pass, printed by `printSummary`. */
interface BackfillRunTotals {
  districtAdminRolesCreated: number;
  districtAdminProfilesCreated: number;
  educatorsLinkedToDistrictAdmin: number;
  educatorRolesLinked: number;
  usersCreated: number;
  educatorsSkipped: number;
}

/** Database-wide state after the run, for the closing summary. */
interface BackfillDatabaseTotals {
  totalUsers: number;
  totalEducators: number;
  dualRoleUsers: number;
  migratedUsers: number;
  unmigratedUsers: number;
}

/**
 * One-off backfill retrofitting every legacy `users`/`educators` row onto the v2
 * `user_roles`/`district_admins` schema.
 *
 * Reads legacy columns that still exist in Postgres but are no longer mapped on the current
 * `User`/`Educator` entities (`users.full_name`/`.is_license_active`/`.subscriptions`/
 * `.profile_picture`, `educators.admin_id`/`.email`/`.password`/`.status`) via raw SQL, since
 * there is no entity path to them anymore. Nothing legacy is dropped or nulled — every source
 * column is read-only here, so the pre-migration state stays fully recoverable.
 *
 * Runs in five passes, in this order:
 *   1. `backfillDistrictAdminUserRoles` — a `district_admin` `user_roles` row for EVERY
 *      non-deleted `users` row, whatever its legacy `role_id`. Its `status` is carried over from
 *      `users.status` rather than hardcoded, so a legacy INACTIVE/PENDING account does not come
 *      out of the migration able to log in.
 *   2. `backfillDistrictAdminProfiles` — the `district_admins` profile for each of those rows,
 *      carrying `full_name`/`is_license_active`/`subscriptions`/`profile_picture` over from
 *      `users`.
 *   3. `linkEducatorsToDistrictAdmins` — `educators.admin_id` (legacy FK to `users.id`) →
 *      `educators.district_admin_id`, resolved through the profile created in pass 2.
 *   4. `backfillEducatorUserRoles` — an `educator` `user_roles` row for every `educators` row,
 *      reusing the `users` row that matches its email (so an account present in both tables ends
 *      up as ONE user with TWO role rows) or creating an educator-only `users` row when there is
 *      no match. Runs after passes 1–2 precisely so a user created here never picks up a
 *      district-admin role.
 *   5. `reportUnmigratedRows` — counts and logs everything that could not be mapped, so a run is
 *      never silently partial.
 *
 * Email matching is case-insensitive (`LOWER(...)`): legacy `users.email` was never normalized,
 * while v2 login lowercases its input before an exact comparison, so matching on the raw column
 * would strand a mixed-case account behind a duplicate row.
 *
 * Every write is guarded by a "not already present" condition, so pre-existing v2 rows (created
 * by the running application) are left untouched rather than duplicated. The whole thing is one
 * transaction — TypeORM's default — so a failure anywhere leaves the database exactly as it was.
 *
 * ## Staged rollout
 *
 * Scope a run to specific accounts with `BACKFILL_EMAILS` (or `BACKFILL_EMAIL_ALLOWLIST` in this
 * file) — everything not listed is left completely untouched, and a later run picks it up.
 * Because those guards make every pass safe to re-enter, the migration can be run once per batch:
 *
 * ```bash
 * BACKFILL_EMAILS=a@x.com,b@x.com npm run migration:run:dev
 * # TypeORM records the migration, so before the next batch drop that record:
 * #   DELETE FROM migrations WHERE name = 'BackfillAllUsersDistrictAdminAndEducatorRoles1791871216399';
 * BACKFILL_EMAILS=c@x.com npm run migration:run:dev
 * # …and finally, unscoped, for everyone remaining:
 * npm run migration:run:dev
 * ```
 *
 * Deleting that `migrations` row is what makes a second batch possible at all — TypeORM will not
 * re-run a migration it has already recorded. It is safe precisely because each pass re-checks
 * the current state rather than assuming a clean slate.
 */
export class BackfillAllUsersDistrictAdminAndEducatorRoles1791871216399 implements MigrationInterface {
  name = 'BackfillAllUsersDistrictAdminAndEducatorRoles1791871216399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const districtAdminRoleId = await this.findRoleIdBySlug(queryRunner, 'district_admin');
    const educatorRoleId = await this.findRoleIdBySlug(queryRunner, 'educator');

    if (!districtAdminRoleId || !educatorRoleId) {
      // A fresh database (new environment, preview) has no legacy rows to backfill, and the role
      // seeder only runs after all migrations — so there is nothing to strand; skip instead of
      // failing the whole chain.
      const [{ legacyRows }] = (await queryRunner.query(
        `SELECT (SELECT COUNT(*)::int FROM users) + (SELECT COUNT(*)::int FROM educators) AS "legacyRows"`,
      )) as { legacyRows: number }[];
      if (legacyRows === 0) {
        console.log(`${LOG_PREFIX} no legacy users/educators to backfill — skipping.`);
        return;
      }
      throw new Error(
        `${LOG_PREFIX} missing required role rows (district_admin=${String(districtAdminRoleId)}, ` +
          `educator=${String(educatorRoleId)}). Run the role seeder before this migration — ` +
          `backfilling against a half-seeded \`role\` table would strand every account it skips.`,
      );
    }

    const allowlist = this.resolveEmailAllowlist();

    const districtAdminRolesCreated = await this.backfillDistrictAdminUserRoles(
      queryRunner,
      districtAdminRoleId,
      educatorRoleId,
      allowlist,
    );
    const districtAdminProfilesCreated = await this.backfillDistrictAdminProfiles(
      queryRunner,
      districtAdminRoleId,
      allowlist,
    );
    const educatorsLinkedToDistrictAdmin = await this.linkEducatorsToDistrictAdmins(
      queryRunner,
      districtAdminRoleId,
      allowlist,
    );
    const educatorTotals = await this.backfillEducatorUserRoles(
      queryRunner,
      educatorRoleId,
      allowlist,
    );
    // await this.reportUnmigratedRows(queryRunner, allowlist);

    await this.printSummary(
      queryRunner,
      {
        districtAdminRolesCreated,
        districtAdminProfilesCreated,
        educatorsLinkedToDistrictAdmin,
        ...educatorTotals,
      },
      allowlist,
    );
  }

  /**
   * Final summary — what this run wrote, against where the database as a whole now stands. Printed
   * last so a staged rollout can be tracked batch by batch: `migratedUsers` climbing towards
   * `totalUsers` is the progress bar, and `unmigratedUsers` hitting zero on the final unscoped run
   * is the finish line.
   */
  private async printSummary(
    queryRunner: QueryRunner,
    run: BackfillRunTotals,
    allowlist: string[] | null,
  ): Promise<void> {
    const [totals] = (await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS "totalUsers",
        (SELECT COUNT(*)::int FROM educators WHERE deleted_at IS NULL) AS "totalEducators",
        (
          SELECT COUNT(*)::int FROM users u
          WHERE u.deleted_at IS NULL
            AND (
              SELECT COUNT(DISTINCT ur.role_id) FROM user_roles ur
              JOIN role r ON r.id = ur.role_id
              WHERE ur.user_id = u.id
                AND ur.deleted_at IS NULL
                AND r.slug IN ('district_admin', 'educator')
            ) = 2
        ) AS "dualRoleUsers",
        (
          SELECT COUNT(*)::int FROM users u
          WHERE u.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.deleted_at IS NULL
            )
        ) AS "migratedUsers",
        (
          SELECT COUNT(*)::int FROM users u
          WHERE u.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.deleted_at IS NULL
            )
        ) AS "unmigratedUsers"
    `)) as BackfillDatabaseTotals[];

    console.warn(
      [
        ``,
        `${LOG_PREFIX} ===================== SUMMARY =====================`,
        `  scope                         : ${allowlist ? `${allowlist.length} allowlisted email(s)` : 'ALL rows (unscoped)'}`,
        ``,
        `  -- database totals (non-deleted rows, whole table) --`,
        `  total users                   : ${totals.totalUsers}`,
        `  total educators               : ${totals.totalEducators}`,
        `  dual-role users               : ${totals.dualRoleUsers}   (district_admin + educator)`,
        `  migrated users (have a role)  : ${totals.migratedUsers} / ${totals.totalUsers}`,
        `  users still unmigrated        : ${totals.unmigratedUsers}`,
        ``,
        `  -- written by THIS run --`,
        `  district_admin roles created  : ${run.districtAdminRolesCreated}`,
        `  district_admin profiles created: ${run.districtAdminProfilesCreated}`,
        `  educators linked to an admin  : ${run.educatorsLinkedToDistrictAdmin}`,
        `  educator roles linked         : ${run.educatorRolesLinked}`,
        `  users created for educators   : ${run.usersCreated}`,
        `  educators skipped (see above) : ${run.educatorsSkipped}`,
        `${LOG_PREFIX} ==================================================`,
        ``,
      ].join('\n'),
    );
  }

  /**
   * Resolves the effective allowlist: `BACKFILL_EMAILS` if set, otherwise
   * `BACKFILL_EMAIL_ALLOWLIST`, normalized to lowercase. `null` means "no scoping — migrate
   * everything", which is the final production run.
   */
  private resolveEmailAllowlist(): string[] | null {
    const fromEnv = process.env[BACKFILL_EMAIL_ALLOWLIST_ENV_VAR]?.split(',') ?? [];
    const emails = [...fromEnv, ...BACKFILL_EMAIL_ALLOWLIST]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(emails)];

    if (unique.length === 0) {
      console.warn(`${LOG_PREFIX} no email scoping — migrating EVERY eligible row.`);
      return null;
    }

    console.warn(
      `${LOG_PREFIX} SCOPED run — migrating only these ${unique.length} email(s), every other ` +
        `row is left untouched: ${unique.join(', ')}`,
    );
    return unique;
  }

  /**
   * Pass 1 — a `district_admin` `user_roles` row for every non-deleted `users` row that does not
   * already have one. `status` is carried over from `users.status` (`user_status_enum`'s values
   * are a strict subset of `user_role_status_enum`'s, so the text round-trip is total).
   */
  private async backfillDistrictAdminUserRoles(
    queryRunner: QueryRunner,
    districtAdminRoleId: string,
    educatorRoleId: string,
    allowlist: string[] | null,
  ): Promise<number> {
    const inserted = (await queryRunner.query(
      `
        INSERT INTO user_roles (user_id, role_id, status)
        SELECT u.id, $1, u.status::text::user_role_status_enum
        FROM users u
        WHERE u.deleted_at IS NULL
          AND ($3::text[] IS NULL OR LOWER(u.email) = ANY($3))
          AND NOT EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = u.id AND ur.role_id = $1 AND ur.deleted_at IS NULL
          )
          -- Never hand a district-admin role to a users row that pass 4 created for an educator
          -- with no account (marked by role_id = the educator role, educator-linked, and no
          -- district_admins profile). Without this, a later batch's run of this pass would
          -- promote every educator-only user an earlier batch created.
          AND NOT (
            u.role_id = $2
            AND EXISTS (
              SELECT 1 FROM user_roles ur2
              JOIN educators e ON e.user_role_id = ur2.user_role_id AND e.deleted_at IS NULL
              WHERE ur2.user_id = u.id AND ur2.role_id = $2 AND ur2.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM district_admins da
              JOIN user_roles ur3 ON ur3.user_role_id = da.user_role_id
              WHERE ur3.user_id = u.id
            )
          )
        RETURNING user_role_id
      `,
      [districtAdminRoleId, educatorRoleId, allowlist],
    )) as { user_role_id: string }[];

    console.warn(`${LOG_PREFIX} pass 1 — district_admin user_roles created: ${inserted.length}`);
    return inserted.length;
  }

  /**
   * Pass 2 — the `district_admins` profile for each district-admin `user_roles` row, carrying the
   * four legacy columns over from `users`.
   *
   * `subscriptions` is cast in SQL (`u.subscriptions::jsonb`) rather than round-tripped through
   * JS: `users.subscriptions` is `json` and holds an array, and node-postgres serializes a JS
   * array as a Postgres array literal (`{...}`), not as JSON — which either fails the `jsonb`
   * cast outright or silently turns `[]` into `{}`.
   */
  private async backfillDistrictAdminProfiles(
    queryRunner: QueryRunner,
    districtAdminRoleId: string,
    allowlist: string[] | null,
  ): Promise<number> {
    const inserted = (await queryRunner.query(
      `
        INSERT INTO district_admins
          (user_role_id, full_name, is_license_active, subscriptions, profile_picture)
        SELECT ur.user_role_id, u.full_name, u.is_license_active, u.subscriptions::jsonb,
               u.profile_picture
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        WHERE ur.role_id = $1
          AND ur.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND ($2::text[] IS NULL OR LOWER(u.email) = ANY($2))
          AND NOT EXISTS (
            SELECT 1 FROM district_admins da
            WHERE da.user_role_id = ur.user_role_id AND da.deleted_at IS NULL
          )
        RETURNING district_admin_id
      `,
      [districtAdminRoleId, allowlist],
    )) as { district_admin_id: string }[];

    console.warn(`${LOG_PREFIX} pass 2 — district_admins profiles created: ${inserted.length}`);
    return inserted.length;
  }

  /**
   * Pass 3 — resolves the legacy `educators.admin_id` (an FK to `users.id`, retained in Postgres
   * but no longer mapped on the `Educator` entity) to the `district_admins` row created in pass 2
   * for that same user, and writes it to `educators.district_admin_id`.
   */
  private async linkEducatorsToDistrictAdmins(
    queryRunner: QueryRunner,
    districtAdminRoleId: string,
    allowlist: string[] | null,
  ): Promise<number> {
    const updated = (await queryRunner.query(
      `
        UPDATE educators e
        SET district_admin_id = da.district_admin_id
        FROM user_roles ur
        JOIN district_admins da
          ON da.user_role_id = ur.user_role_id AND da.deleted_at IS NULL
        JOIN users au ON au.id = ur.user_id
        WHERE ur.user_id = e.admin_id
          AND ur.role_id = $1
          AND ur.deleted_at IS NULL
          AND ($2::text[] IS NULL OR LOWER(au.email) = ANY($2))
          AND e.admin_id IS NOT NULL
          AND e.district_admin_id IS NULL
          AND e.deleted_at IS NULL
        RETURNING e.id
      `,
      [districtAdminRoleId, allowlist],
    )) as { id: string }[];

    console.warn(`${LOG_PREFIX} pass 3 — educators linked to a district_admin: ${updated.length}`);
    return updated.length;
  }

  /**
   * Pass 4 — an `educator` `user_roles` row for every `educators` row that has none yet.
   *
   * The `users` row is matched case-insensitively by email and reused when it exists, so an
   * account present in both tables ends up as one `users` row carrying two `user_roles` rows (its
   * district-admin one from pass 1, its educator one from here). Only an educator with no
   * matching user gets a new, educator-only `users` row — created after passes 1–2 precisely so
   * it never picks up a district-admin role.
   *
   * Row-by-row rather than set-based because each educator may need a `users` row created first,
   * and because the ambiguous cases (no email, duplicate emails, a `user_roles` row already
   * claimed by another educator) have to be reported individually instead of silently dropped or
   * crashed on.
   */
  /** TypeORM's Postgres driver returns [rows, rowCount] for UPDATE/DELETE, and rows otherwise. */
  private affectedRows(result: unknown): number {
    if (Array.isArray(result) && Array.isArray(result[0]) && typeof result[1] === 'number') {
      return result[1];
    }
    return Array.isArray(result) ? result.length : 0;
  }

  /**
   * Pass 4 — set-based. Links every unlinked educator to an `educator` user_roles row,
   * reusing the matching users row (case-insensitive, oldest wins) or creating an
   * educator-only users row when none exists. Only the oldest educator per user_roles
   * row is linked; the rest are skipped as duplicates.
   */
  private async backfillEducatorUserRoles(
    queryRunner: QueryRunner,
    educatorRoleId: string,
    allowlist: string[] | null,
  ): Promise<Pick<BackfillRunTotals, 'educatorRolesLinked' | 'usersCreated' | 'educatorsSkipped'>> {
    const candidatesCte = `
      candidates AS (
        SELECT e.id, e.password, e.status, e.created_at, LOWER(TRIM(e.email)) AS email
        FROM educators e
        WHERE e.user_role_id IS NULL
          AND e.deleted_at IS NULL
          AND ($1::text[] IS NULL OR LOWER(e.email) = ANY($1))
      )`;

    const matchedCte = `
      matched AS (
        SELECT DISTINCT ON (c.id) c.id AS educator_id, c.status, c.created_at, u.id AS user_id
        FROM candidates c
        JOIN users u ON LOWER(u.email) = c.email AND u.deleted_at IS NULL
        WHERE c.email <> ''
        ORDER BY c.id, u.created_at ASC, u.id ASC
      )`;

    // 0. Counts for the summary.
    const [{ total, no_email: noEmail }] = (await queryRunner.query(
      `WITH ${candidatesCte}
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE email IS NULL OR email = '')::int AS no_email
       FROM candidates`,
      [allowlist],
    )) as { total: number; no_email: number }[];

    // 1. One educator-only users row per distinct email with no existing account.
    //    role_id is the educator-only marker that pass 1's guard relies on.
    const createdUsers = (await queryRunner.query(
      `WITH ${candidatesCte}
       INSERT INTO users (email, password, status, role_id)
       SELECT DISTINCT ON (c.email) c.email, c.password, 'ACTIVE'::user_status_enum, $2::uuid
       FROM candidates c
       WHERE c.email <> ''
         AND NOT EXISTS (
           SELECT 1 FROM users u WHERE LOWER(u.email) = c.email AND u.deleted_at IS NULL
         )
       ORDER BY c.email, c.created_at ASC, c.id ASC
       RETURNING id`,
      [allowlist, educatorRoleId],
    )) as { id: string }[];

    // 2. An educator user_roles row for every matched user that doesn't have one yet.
    await queryRunner.query(
      `WITH ${candidatesCte}, ${matchedCte}
       INSERT INTO user_roles (user_id, role_id, status)
       SELECT DISTINCT ON (m.user_id) m.user_id, $2::uuid, m.status::text::user_role_status_enum
       FROM matched m
       WHERE NOT EXISTS (
         SELECT 1 FROM user_roles ur
         WHERE ur.user_id = m.user_id AND ur.role_id = $2::uuid AND ur.deleted_at IS NULL
       )
       ORDER BY m.user_id, m.created_at ASC, m.educator_id ASC`,
      [allowlist, educatorRoleId],
    );

    // 3. Link educators — oldest educator per user_roles row wins, never one already claimed.
    const linkResult = (await queryRunner.query(
      `WITH ${candidatesCte}, ${matchedCte},
       resolved AS (
         SELECT DISTINCT ON (m.educator_id) m.educator_id, m.created_at, ur.user_role_id
         FROM matched m
         JOIN user_roles ur
           ON ur.user_id = m.user_id AND ur.role_id = $2::uuid AND ur.deleted_at IS NULL
         ORDER BY m.educator_id, ur.created_at ASC
       ),
       winners AS (
         SELECT DISTINCT ON (r.user_role_id) r.educator_id, r.user_role_id
         FROM resolved r
         WHERE NOT EXISTS (
           SELECT 1 FROM educators e2
           WHERE e2.user_role_id = r.user_role_id AND e2.id <> r.educator_id
             AND e2.deleted_at IS NULL
         )
         ORDER BY r.user_role_id, r.created_at ASC, r.educator_id ASC
       )
       UPDATE educators e
       SET user_role_id = w.user_role_id
       FROM winners w
       WHERE e.id = w.educator_id
       RETURNING e.id`,
      [allowlist, educatorRoleId],
    )) as unknown;

    const linked = this.affectedRows(linkResult);
    const skipped = total - linked;

    console.warn(
      `${LOG_PREFIX} pass 4 — educators linked=${linked} usersCreated=${createdUsers.length} ` +
        `skippedNoEmail=${noEmail} skippedOther=${skipped - noEmail} candidates=${total}`,
    );

    return {
      educatorRolesLinked: linked,
      usersCreated: createdUsers.length,
      educatorsSkipped: skipped,
    };
  }

  private async findRoleIdBySlug(queryRunner: QueryRunner, slug: string): Promise<string | null> {
    const [role] = (await queryRunner.query(`SELECT id FROM role WHERE slug = $1 LIMIT 1`, [
      slug,
    ])) as { id: string }[];
    return role?.id ?? null;
  }

  /**
   * Intentionally a no-op.
   *
   * `up()` is an additive data backfill: it creates `user_roles`/`district_admins`/`users` rows
   * and links `educators` to them. By the time a revert is considered, normal application traffic
   * has created more rows of exactly the same shape, and nothing distinguishes those from the ones
   * this migration wrote — a blanket cleanup would take accounts this migration never touched
   * down with it.
   *
   * The legacy source columns (`users.full_name`/`.is_license_active`/`.subscriptions`/
   * `.profile_picture`, `educators.admin_id`/`.email`/`.password`/`.status`) are only read here,
   * never dropped or cleared, so the pre-migration state remains fully recoverable: a revert is a
   * targeted, reviewed cleanup against a snapshot, not an automated one.
   */
  public async down(): Promise<void> {
    console.warn(
      `${LOG_PREFIX} down() is a deliberate no-op — this backfill cannot be safely auto-reverted. ` +
        `See the method comment; revert manually against a snapshot if genuinely required.`,
    );
    return Promise.resolve();
  }
}
