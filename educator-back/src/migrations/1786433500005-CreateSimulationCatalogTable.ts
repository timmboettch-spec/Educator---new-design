import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSimulationCatalogTable1786433500005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'simulation_catalog',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'title', type: 'varchar' },
          { name: 'unit', type: 'varchar' },
          { name: 'category', type: 'varchar' },
          { name: 'target_audience', type: 'varchar' },
          { name: 'difficulty_level', type: 'varchar', isNullable: true },
          { name: 'estimated_duration', type: 'varchar', isNullable: true },
          { name: 'language', type: 'varchar', default: "'English'" },
          { name: 'purpose', type: 'text', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'learning_objectives', type: 'text', isNullable: true },
          { name: 'rating', type: 'decimal', precision: 3, scale: 1, default: 0 },
          { name: 'total_ratings', type: 'int', default: 0 },
          { name: 'usage', type: 'varchar', isNullable: true },
          { name: 'image_url', type: 'varchar', isNullable: true },
          { name: 'images', type: 'jsonb', isNullable: true, default: "'[]'" },
          { name: 'rating_breakdown', type: 'jsonb', isNullable: true, default: "'[]'" },
          { name: 'reviews', type: 'jsonb', isNullable: true, default: "'[]'" },
          { name: 'whats_new', type: 'jsonb', isNullable: true },
          { name: 'simulation_privacy', type: 'text', isNullable: true },
          { name: 'developer', type: 'varchar', isNullable: true },
          { name: 'institution', type: 'varchar', isNullable: true },
          { name: 'last_update', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true, // ifNotExists = true — safe to run on existing DBs
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('simulation_catalog', true);
  }
}
