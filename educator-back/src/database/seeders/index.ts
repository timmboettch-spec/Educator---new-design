import { readdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';

type Seeder = (dataSource: DataSource) => Promise<void>;
enum SeederRunType {
  ONCE = 'once',
  EVERYTIME = 'everytime'
}
// type SeederRunType = 'once' | 'everytime';
interface SeedRunRow {
  type: SeederRunType;
  last_run_at: Date | null;
}

/**
 * Default run type per seeder, keyed by seeder name (the file name with the
 * `.seeder.ts`/`.seeder.js` suffix stripped — see seederNameFromFile).
 * Anything not listed here defaults to 'everytime' (re-run on every boot,
 * the behavior every seeder had before this table existed).
 *
 * Only seeders whose cost scales with an external data source need 'once' —
 * currently the Azure-Blob-backed `units`/`simulations` seeders, which would
 * otherwise re-fetch their full source on every container start (see the
 * Dockerfile's CMD, which runs `npm run seed:prod` unconditionally).
 *
 * This default only applies the first time a seeder is ever seen — once a
 * `seed_runs` row exists for it, that row's `type` column is authoritative
 * (see run()), so an operator can flip a seeder's type directly in the table
 * without a code change.
 */
const SEEDER_RUN_TYPES: Record<string, SeederRunType> = {
  units: SeederRunType.ONCE,
  simulation: SeederRunType.ONCE,
  transcript: SeederRunType.ONCE,
  'sales-order-lines': SeederRunType.ONCE,
  role: SeederRunType.EVERYTIME
};

function isSeeder(value: unknown): value is Seeder {
  return typeof value === 'function';
}

function seederNameFromFile(file: string): string {
  return file.replace(/\.seeder\.(ts|js)$/, '');
}

function loadSeeders(): { file: string; name: string; seeder: Seeder }[] {
  const seederFiles = readdirSync(__dirname)
    .filter((file) => file.endsWith('.seeder.js') || file.endsWith('.seeder.ts'))
    .sort();

  return seederFiles.map((file) => {
    // These compiled seeder modules are CommonJS, and `require` (unlike dynamic `import()`)
    // resolves `.default` straight to the seeder function rather than to a wrapped namespace object.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seederModule: unknown = require(join(__dirname, file));
    const candidate =
      typeof seederModule === 'object' && seederModule !== null
        ? (seederModule as { default?: unknown }).default
        : undefined;

    if (!isSeeder(candidate)) {
      throw new Error(
        `Seeder file "${file}" must have a default export of type (dataSource: DataSource) => Promise<void>`,
      );
    }
    return { file, name: seederNameFromFile(file), seeder: candidate };
  });
}



async function getSeedRun(dataSource: DataSource, name: string): Promise<SeedRunRow | null> {
  const rows: SeedRunRow[] = await dataSource.query(
    'SELECT type, last_run_at FROM seed_runs WHERE seeder_name = $1',
    [name],
  );
  return rows[0] ?? null;
}

/** Records a completed run. Deliberately does not overwrite `type` on conflict — see SEEDER_RUN_TYPES. */
async function recordSeedRun(
  dataSource: DataSource,
  name: string,
  type: SeederRunType,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO seed_runs (seeder_name, type, last_run_at)
     VALUES ($1, $2, now())
     ON CONFLICT (seeder_name) DO UPDATE SET last_run_at = now()`,
    [name, type],
  );
}

async function run(): Promise<void> {
  console.log('Initializing Data Source...');
  await AppDataSource.initialize();

  try {
    const seeders = loadSeeders();
    console.log(
      `Discovered ${seeders.length} seeder(s) in ${__dirname}: ${seeders.map((s) => s.file).join(', ')}`,
    );

    for (const { file, name, seeder } of seeders) {
      const existingRun = await getSeedRun(AppDataSource, name);
      const type = existingRun?.type ?? SEEDER_RUN_TYPES[name] ?? 'everytime';

      if (type === SeederRunType.ONCE && existingRun?.last_run_at) {
        console.log(
          `Seeder "${file}" is type "once" and already ran at ${existingRun.last_run_at.toISOString()} — skipping.`,
        );
        continue;
      }

      try {
        await seeder(AppDataSource);
        await recordSeedRun(AppDataSource, name, type);
      } catch (error) {
        console.error(`Error running seeder "${file}":`, error);
      }
    }

    console.info('Database seeders successfully executed');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void run();
