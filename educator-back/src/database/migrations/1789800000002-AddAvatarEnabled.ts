import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarEnabled1789800000002 implements MigrationInterface {
  name = 'AddAvatarEnabled1789800000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    ALTER TABLE "simulations"
    ADD COLUMN "avatarEnabled" boolean NOT NULL DEFAULT false
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
  }
}
