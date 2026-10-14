import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActionCategoriesToSimulationV21791300000000 implements MigrationInterface {
    name = 'AddActionCategoriesToSimulationV21791300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "simulations_v2" ADD COLUMN IF NOT EXISTS "action_categories" jsonb`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "simulations_v2" DROP COLUMN IF EXISTS "action_categories"`,
        );
    }
}