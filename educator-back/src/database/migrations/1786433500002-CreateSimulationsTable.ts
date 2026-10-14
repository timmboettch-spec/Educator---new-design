import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSimulationsTable1786433500002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'simulations',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'unit_id', type: 'varchar', isNullable: true },
          { name: 'title', type: 'varchar' },
          { name: 'difficulty', type: 'varchar', isNullable: true },
          { name: 'avatarId', type: 'varchar', isNullable: true },
          { name: 'contextId', type: 'varchar', isNullable: true },
          { name: 'learnerLevel', type: 'varchar', isNullable: true },
          { name: 'department', type: 'varchar', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'learningObjective', type: 'text', isNullable: true },
          { name: 'class', type: 'varchar', isNullable: true },
          { name: 'disabled', type: 'boolean', default: false },
          { name: 'status', type: 'varchar', isNullable: true },
          { name: 'actions', type: 'jsonb', isNullable: true },
          { name: 'patientData', type: 'jsonb', isNullable: true },
          { name: 'expectedActions', type: 'jsonb', isNullable: true },
          { name: 'historyPrompts', type: 'jsonb', isNullable: true },
          { name: 'assessmentGuidance', type: 'jsonb', isNullable: true },
          { name: 'assessmentNarrativeExpected', type: 'text', isNullable: true },
          { name: 'learningObjectiveCard', type: 'text', isNullable: true },
          { name: 'phases', type: 'jsonb', isNullable: true },
          { name: 'availableMedications', type: 'jsonb', isNullable: true },
          { name: 'grading', type: 'jsonb', isNullable: true },
          { name: 'requiresProductSetup', type: 'boolean', default: false },
          { name: 'productSetup', type: 'jsonb', isNullable: true },
          { name: 'aiPatientData', type: 'jsonb', isNullable: true },
          { name: 'preBriefPdf', type: 'varchar', isNullable: true },
          { name: 'enableStudentBriefing', type: 'boolean', default: false },
          { name: 'studentBriefing', type: 'jsonb', isNullable: true },
          { name: 'sbar', type: 'jsonb', isNullable: true },
          { name: 'orders', type: 'jsonb', isNullable: true },
          { name: 'actionCategories', type: 'jsonb', isNullable: true },
          { name: 'language', type: 'varchar', isNullable: true },
          { name: 'voice', type: 'varchar', isNullable: true },
          { name: 'ethnicity', type: 'varchar', isNullable: true },
          { name: 'age', type: 'varchar', isNullable: true },
          { name: 'actionGroupName', type: 'varchar', isNullable: true },
          { name: 'actionGroupDescription', type: 'text', isNullable: true },
          { name: 'timeline', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('simulations', true);
  }
}
