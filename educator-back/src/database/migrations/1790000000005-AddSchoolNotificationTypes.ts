import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolNotificationTypes1790000000005 implements MigrationInterface {
    name = 'AddSchoolNotificationTypes1790000000005';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Postgres requires ADD VALUE to run outside the migration's own transaction block.
        await queryRunner.query(
            `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SCHOOL_STATUS_CHANGED'`,
        );
        await queryRunner.query(
            `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SCHOOL_REMOVED'`,
        );
    }

    public async down(): Promise<void> {
        // Enum values cannot be removed cleanly in Postgres; this migration is
        // additive and safe for live data.
    }
}
