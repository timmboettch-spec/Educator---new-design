import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddRedemptionsTable1777280000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'redemptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'redeem_code',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'sales_order',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'customer',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'line_items',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'ai_seats_granted',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'redeemed_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'redemptions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'redemptions',
      new TableIndex({
        columnNames: ['redeem_code'],
        name: 'IDX_redemptions_redeem_code',
      }),
    );

    await queryRunner.createIndex(
      'redemptions',
      new TableIndex({
        isUnique: true,
        columnNames: ['user_id', 'redeem_code'],
        name: 'UQ_redemptions_user_id_redeem_code',
      }),
    );

    await queryRunner.createIndex(
      'redemptions',
      new TableIndex({
        columnNames: ['user_id'],
        name: 'IDX_redemptions_user_id',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('redemptions', true);
  }
}
