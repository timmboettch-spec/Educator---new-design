import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEducatorSeatRequestNotificationType1789700000002 implements MigrationInterface {
  name = 'AddEducatorSeatRequestNotificationType1789700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres requires ADD VALUE to run in its own transaction; use a
    // separate statement to stay compatible with typeorm's per-migration tx.
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'EDUCATOR_SEAT_REQUEST'`,
    );
  }

  public async down(): Promise<void> {
    // Enum values cannot be removed cleanly in Postgres; this migration is
    // additive and safe for live data.
  }
}
