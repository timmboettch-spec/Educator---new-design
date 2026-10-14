import { Logger } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

import { AiProvider } from '../constants/ai.constants';

const logger = new Logger('EnvValidation');

/**
 * Single source of truth for every environment variable this app (root + student-backend,
 * one shared process) reads. Fields with no `@IsOptional()` fail app startup immediately
 * if missing — reserved for values with no safe fallback that the app cannot run without
 * (DB connection, JWT signing, NODE_ENV). Everything else is optional: either the consuming
 * code already has a working default/degrades gracefully, or the feature is opt-in.
 */
class EnvironmentVariables {
  // ── Core ───────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  // ── Database (PostgreSQL) ─────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @Type(() => Number)
  @IsNotEmpty()
  @IsInt()
  DB_PORT!: number;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  ALLOW_NONSSL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  DB_POOL_MAX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  DB_POOL_IDLE_TIMEOUT_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  DB_POOL_ACQUIRE_TIMEOUT_MS?: number;

  // ── Auth (JWT) ─────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  /**
   * Shared secret for @ServiceAuth() routes — the avatar build pipeline's key.
   *
   * Optional deliberately: an environment that has no pipeline pointed at it
   * should not fail to start. AuthGuard treats an unset value as "no service
   * caller is valid", never as "everyone is", so leaving it out shuts the door
   * rather than opening it.
   */
  @IsOptional()
  @IsString()
  @MinLength(32, { message: 'AVATAR_SERVICE_KEY must be at least 32 characters' })
  AVATAR_SERVICE_KEY?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  // ── App / URLs ─────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  APP_URL?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  STUDENT_FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  APP_PORT?: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  API_BASE_URL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  API_TIMEOUT_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SERVER_KEEP_ALIVE_TIMEOUT_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SERVER_HEADERS_TIMEOUT_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  HEAP_LOG_INTERVAL_MS?: number;

  // ── Redis ──────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  REDIS_TLS?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  IS_MANAGED_REDIS?: string;

  @IsOptional()
  @IsString()
  REDIS_USERNAME?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  REDIS_CACHE_TTL_SECONDS?: number;

  // ── Azure Blob Storage ─────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  AZURE_STORAGE_CONNECTION_STRING?: string;

  @IsOptional()
  @IsString()
  AZURE_STORAGE_ACCOUNT?: string;

  @IsOptional()
  @IsString()
  AZURE_STORAGE_CONTAINER?: string;

  @IsOptional()
  @IsString()
  AZURE_BLOB_CONTAINER_NAME?: string;

  @IsOptional()
  @IsString()
  AZURE_BLOB_DATA_CONTAINER_NAME?: string;

  @IsOptional()
  @IsString()
  AZURE_BLOB_VOICE_PROFILES_CONTAINER_NAME?: string;

  @IsOptional()
  @IsString()
  AZURE_BLOB_PREFIX?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  BLOB_DOWNLOAD_TIMEOUT_MS?: number;

  // ── Mail (Azure Communication Services) ───────────────────────────────
  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  // Selects MailService's transport — 'acs' (default) or 'noop' (disables
  // real delivery, e.g. for test/CI environments). See mail.config.ts.
  @IsOptional()
  @IsString()
  MAIL_PROVIDER?: string;

  @IsOptional()
  @IsString()
  REPORT_EMAIL_TO?: string;

  @IsOptional()
  @IsString()
  EMAIL_MODE?: string;

  @IsOptional()
  @IsString()
  EMAIL_LOGO_URL?: string;

  // ACS Communication Services endpoint for the 'acs' MailProvider
  // (AcsMailProvider calls getOrThrow via mail.config.ts's acsEndpoint, so a
  // missing value fails at onModuleInit rather than here — same treatment as
  // MAIL_FROM above).
  @IsOptional()
  @IsString()
  ACS_ENDPOINT?: string;

  // Explicit per-report sender override — read via mail.config.ts's
  // mail.emailFrom by reports.service.ts's sendReportEmail(). Omitting it
  // lets MailService fall back to its own MAIL_FROM. Conditionally
  // provisioned by keyVaultSecrets.bicep (edu-email-from, only written when
  // non-empty) but not yet wired as a container env var — see the
  // kvSecretNames comment in containerApp-backend.bicep — so it always
  // resolves to undefined today; kept declared for when that changes.
  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  // ── Mail (dead legacy SMTP fallback — never read; containerApp-backend.bicep
  // still wires EMAIL_HOST/EMAIL_PORT secretRefs, kept declared here only for
  // that reason. EMAIL_USER/EMAIL_PASS/ACS_SMTP_USERNAME/
  // ACS_SMTP_CLIENT_SECRET aren't even wired in infra anymore — removed) ────
  @IsOptional()
  @IsString()
  EMAIL_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EMAIL_PORT?: number;

  // ── Microsoft Graph (legacy — superseded by ACS Email, see mail.config.ts
  // above and docs/adr/0001-mail-service-managed-identity.md) ─────────────
  // mail.service.ts no longer reads these; kept declared (and optional)
  // only because containerApp-backend.bicep still wires the corresponding
  // secretRefs as unused-but-kept until the still-active old revision that
  // references them rotates out (Container Apps refuses to remove a secret
  // an active revision still references).
  @IsOptional()
  @IsString()
  GRAPH_TENANT_ID?: string;

  @IsOptional()
  @IsString()
  GRAPH_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GRAPH_CLIENT_SECRET?: string;

  // ── LTI ────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  LTI_FALLBACK_KEY_ID?: string;

  @IsOptional()
  @IsString()
  LTI_FALLBACK_PRIVATE_KEY_PEM?: string;

  @IsOptional()
  @IsString()
  LTI_STUDENT_CODE_SECRET?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  LMS_ENABLE_LTI_AUTO_PROVISION?: string;

  @IsOptional()
  @IsString()
  MOODLE_URL?: string;

  @IsOptional()
  @IsString()
  MOODLE_WS_TOKEN?: string;

  // ── Google Classroom OAuth ──────────────────────────────────────────────
  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_REDIRECT_URI?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_SCOPES?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_INCLUDE_GRANTED_SCOPES?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_AUTH_URL?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_TOKEN_URL?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLASSROOM_USERINFO_URL?: string;

  // ── LMS secrets encryption ─────────────────────────────────────────────
  // No fallback by design (never chain to JWT_SECRET) — kept as a soft warning,
  // not a hard-crash, since LMS/LTI secret storage degrades independently of
  // the rest of the app when unset. See warnLmsEncryptionKey() below.
  @IsOptional()
  @IsString()
  LMS_SECRETS_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS?: string;

  // ── Generic token encryption ──────────────────────────────────────────
  // No fallback by design (never chain to JWT_SECRET) — soft warning only, since invite
  // issuance/acceptance degrades independently of the rest of the app when unset. See
  // warnCryptoSecret() below.
  @IsOptional()
  @IsString()
  CRYPTO_SECRET?: string;

  // ── Student-backend consolidation ─────────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SCENARIO_HYDRATION_CONCURRENCY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  JSON_CACHE_METADATA_CHECK_INTERVAL_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  LOCALIZED_SCENARIOS_CACHE_TTL_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  NOTIFICATION_DUE_REMINDER_DAYS?: number;

  // ── Application Insights / telemetry ──────────────────────────────────
  @IsOptional()
  @IsString()
  APPLICATIONINSIGHTS_CONNECTION_STRING?: string;

  @IsOptional()
  @IsIn(['api-key', 'managed-identity'])
  APPINSIGHTS_AUTH_TYPE?: string;

  @IsOptional()
  @IsString()
  APPLICATIONINSIGHTS_APP_ID?: string;

  @IsOptional()
  @IsString()
  APPLICATIONINSIGHTS_API_KEY?: string;

  @IsOptional()
  @IsString()
  AZURE_CLIENT_ID?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  TELEMETRY_SAMPLING_PRIORITY?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  TELEMETRY_LIFECYCLE_ENABLED?: string;

  // ── AI conversation ────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  CONVERSATION_PROVIDER?: string;

  @IsOptional()
  @IsIn(Object.values(AiProvider))
  AI_PROVIDER?: AiProvider;

  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  // ── Speech engine (Phase 2 — not yet active) ──────────────────────────
  @IsOptional()
  @IsString()
  SPEECH_ENGINE_PROVIDER?: string;

  @IsOptional()
  @IsString()
  SPEECH_ENGINE_API_KEY?: string;

  @IsOptional()
  @IsString()
  SPEECH_ENGINE_API_URL?: string;

  @IsOptional()
  @IsString()
  SPEECH_ENGINE_MODEL?: string;

  @IsOptional()
  @IsString()
  SPEECH_ENGINE_LANGUAGE?: string;

  @IsOptional()
  @IsString()
  SOCKET_IO_REDIS_ADAPTER_ENABLED?: string;
}

const LMS_KEY = 'LMS_SECRETS_ENCRYPTION_KEY';
const LMS_KEY_PREVIOUS = 'LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS';

function warnLmsEncryptionKey(config: Record<string, unknown>): void {
  const key = config[LMS_KEY];
  if (typeof key !== 'string' || !key.trim()) {
    logger.warn(
      `${LMS_KEY} is not set. LMS and LTI operations that read or write stored secrets ` +
      'will fail until it is provided; the rest of the app is unaffected. ' +
      'Generate a value with: openssl rand -base64 32',
    );
  }

  const previous = config[LMS_KEY_PREVIOUS];
  if (typeof previous === 'string' && previous.trim()) {
    logger.warn(
      `${LMS_KEY_PREVIOUS} is set — an LMS secret key rotation is in progress and the retired ` +
      'key still decrypts. Run "npm run reencrypt:lms-secrets", then remove this variable.',
    );
  }
}

const CRYPTO_SECRET_KEY = 'CRYPTO_SECRET';

function warnCryptoSecret(config: Record<string, unknown>): void {
  const secret = config[CRYPTO_SECRET_KEY];
  if (typeof secret !== 'string' || !secret.trim()) {
    logger.warn(
      `${CRYPTO_SECRET_KEY} is not set. Invite-link token issuance and verification ` +
      'will fail until it is provided; the rest of the app is unaffected. ' +
      'Generate a value with: openssl rand -hex 32',
    );
  }
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    stopAtFirstError: true,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment variable validation failed:\n${errors
        .map((e) => Object.values(e.constraints as unknown as Record<string, unknown>).join(','))
        .join('\n')}`,
    );
  }

  warnLmsEncryptionKey(config);
  warnCryptoSecret(config);

  return config;
}
