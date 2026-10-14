import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { entities } from './database.module';
import { DatabaseConstants } from '../common/constants';
import { createEntraPasswordProvider } from './postgres-entra-auth';

dotenv.config();

// Entra ID (AAD token) auth is opt-in via DB_USE_ENTRA_AUTH=true — dev-only
// today (infra/resources.bicep's enableEntraAuth). Off by default, so
// password auth (DB_PASSWORD) is unchanged for every existing caller. When
// on, DB_USERNAME must be the Entra principal's name registered as a DB
// admin (the backend's managed identity, or 'github-actions-sp' for CI) —
// not the sqladmin login — and DB_PASSWORD is ignored in favor of a token
// provider (see postgres-entra-auth.ts for how TypeORM picks it up via
// `extra`). Azure requires TLS for Entra auth regardless of ALLOW_NONSSL.
const useEntraAuth = process.env.DB_USE_ENTRA_AUTH === 'true';

export const databseConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: useEntraAuth || process.env.ALLOW_NONSSL === 'true' ? { rejectUnauthorized: false } : false,
  entities,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
  extra: {
    options: DatabaseConstants.CONNECTION_OPTIONS,
    ...(useEntraAuth ? { password: createEntraPasswordProvider(process.env.AZURE_CLIENT_ID) } : {}),
  },
};

export const AppDataSource = new DataSource(databseConfig);
