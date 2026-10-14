import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateClassEducatorsTable1789800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'class_educators',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'class_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'educator_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'is_primary',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'class_educators',
      new TableIndex({
        name: 'idx_class_educators_class_id',
        columnNames: ['class_id'],
      }),
    );

    await queryRunner.createIndex(
      'class_educators',
      new TableIndex({
        name: 'idx_class_educators_educator_id',
        columnNames: ['educator_id'],
      }),
    );

    await queryRunner.createIndex(
      'class_educators',
      new TableIndex({
        name: 'UQ_class_educators_pair',
        columnNames: ['class_id', 'educator_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'class_educators',
      new TableForeignKey({
        columnNames: ['class_id'],
        referencedTableName: 'classes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'class_educators',
      new TableForeignKey({
        columnNames: ['educator_id'],
        referencedTableName: 'educators',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('class_educators', true);
  }
}
