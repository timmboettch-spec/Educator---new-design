import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { LmsSchoolConfig } from '../lms/entity/lms-school-config.entity';
import { LmsClassMapping } from '../lms/entity/lms-class-mapping.entity';
import { isRotationInProgress } from '../lms/utils/lms-secret-crypto';

// update() not save(): save() diffs against the unchanged plaintext snapshot
// and skips the write, silently leaving rows on the old key.
async function reencryptSchoolConfigs(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(LmsSchoolConfig);
  const rows = await repo.find();

  for (const row of rows) {
    await repo.update(
      { id: row.id },
      {
        lmsApiToken: row.lmsApiToken,
        platformPrivateKeyPem: row.platformPrivateKeyPem,
      },
    );
  }

  return rows.length;
}

async function reencryptClassMappings(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(LmsClassMapping);
  const rows = await repo.find({ where: {} });

  for (const row of rows) {
    await repo.update({ id: row.id }, { lmsApiToken: row.lmsApiToken });
  }

  return rows.length;
}

async function run(): Promise<void> {
  if (!isRotationInProgress()) {
    console.warn(
      'LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS is not set. Rows encrypted with a retired key ' +
        'cannot be read and will fail. Set it before running this script.',
    );
  }

  await AppDataSource.initialize();

  try {
    const configs = await reencryptSchoolConfigs(AppDataSource);
    console.log(`Re-encrypted ${configs} row(s) in lms_school_config`);

    const mappings = await reencryptClassMappings(AppDataSource);
    console.log(`Re-encrypted ${mappings} row(s) in lms_class_mapping`);

    console.log(
      'Done. Remove LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS and redeploy to retire the old key.',
    );
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error: unknown) => {
  console.error('Re-encryption failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
