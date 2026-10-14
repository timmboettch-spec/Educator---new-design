import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expires PENDING invites whose educator was deleted before accepting.
 *
 * `EducatorsService.remove` used to soft-delete the educator without touching its invite, so
 * the PENDING row outlived it. `POST /invites/create` rejects any email with a PENDING invite
 * ("A pending invitation for this email already exists"), so every educator deleted that way
 * can never be re-invited. `remove` now deletes the invite itself; this clears the rows left
 * behind before that fix.
 *
 * An invite is orphaned when no non-deleted educator owns its email, matched both through the
 * v2 identity (`users` -> `user_roles` -> `educators`) and the legacy `educators.email` column.
 * Such an invite can't be accepted anyway: acceptance requires a PENDING educator role, and
 * deletion set that role INACTIVE.
 *
 * Expired rather than deleted so `down()` can restore them. Nothing in the app writes
 * `EXPIRED`, so every EXPIRED row after this runs is one it wrote. Re-inviting an email deletes
 * all of its invites (matched case-insensitively) before creating the new one, so a re-invited
 * educator's expired row is removed then; the rest stay EXPIRED.
 */
export class ExpireOrphanedEducatorInvites1791790891728 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // This real timestamp sorts before the legacy-timestamped migrations that create
    // `user_roles` and `educators.user_role_id`. On a fresh database it runs before them, when
    // there are no invites to clean up either, so it does nothing.
    if (
      !(await queryRunner.hasTable('user_roles')) ||
      !(await queryRunner.hasColumn('educators', 'user_role_id'))
    ) {
      return;
    }

    const rows = (await queryRunner.query(
      `WITH updated AS (
         UPDATE "invites" i
            SET "status" = 'EXPIRED'
          WHERE i."status" = 'PENDING'
            AND NOT EXISTS (
              SELECT 1
                FROM "users" u
                JOIN "user_roles" ur ON ur."user_id" = u."id"
                JOIN "educators" e ON e."user_role_id" = ur."user_role_id"
               WHERE e."deleted_at" IS NULL
                 AND lower(u."email") = lower(i."email")
            )
            AND NOT EXISTS (
              SELECT 1
                FROM "educators" e
               WHERE e."deleted_at" IS NULL
                 AND lower(e."email") = lower(i."email")
            )
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`,
    )) as Array<{ count: string }>;

    const expired = rows?.[0]?.count ?? '0';
    if (expired !== '0') {
      await queryRunner.query(
        `DO $$ BEGIN RAISE NOTICE 'ExpireOrphanedEducatorInvites: expired ${expired.replace(/'/g, "''")} orphaned invite(s)'; END $$`,
      );
    }
  }

  /** Puts every EXPIRED invite back to PENDING — only this migration writes EXPIRED. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "invites" SET "status" = 'PENDING' WHERE "status" = 'EXPIRED'`);
  }
}
