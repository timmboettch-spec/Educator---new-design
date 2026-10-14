import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailNotificationPreferenceTypes1790000000004 implements MigrationInterface {
    name = 'AddEmailNotificationPreferenceTypes1790000000004';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const notificationTypes = [
            'EMAIL_REPORT',
            'ASSESSMENT_REPORT',
            'BATCH_EMAIL',
            'SEND_STUDENT_CODE',
            'ACCOUNT_REACTIVATED',
            'FORGOT_PASSWORD',
            'INVITE',
        ];

        for (const notificationType of notificationTypes) {
            await queryRunner.query(
                `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS '${notificationType}'`,
            );
        }
    }

    public async down(): Promise<void> {
        // PostgreSQL enum values cannot be removed safely.
    }
}