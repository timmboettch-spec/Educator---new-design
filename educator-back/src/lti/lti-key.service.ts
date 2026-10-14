import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm';
import { LmsConfigStatus, LmsToolType } from 'src/common/enums/lms.enum';

import { publicJwkFromPrivatePem } from 'src/lms/utils/lms-key.util';
import { LMS_SCHOOL_CONFIG_REPOSITORY } from 'src/database/tokens';
import { LmsSchoolConfigRepository } from 'src/database/repositories';
import { LoggerService } from '../common/services';

const LOCAL_NODE_ENVS = new Set(['development', 'test', 'local']);

/**
 * LtiModule is imported unconditionally in AppModule, so this runs on every boot.
 * A missing API_BASE_URL in a deployed env fails the whole Educator API at startup,
 * not just LTI routes — intentional so a half-configured deployment never passes health checks.
 */
@Injectable()
export class LtiKeyService implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    @Inject(LMS_SCHOOL_CONFIG_REPOSITORY)
    private readonly configRepo: LmsSchoolConfigRepository,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.getBaseUrl();
  }

  async getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    return this.buildJwks(LmsToolType.EDUCATOR);
  }

  async getStudentJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    return this.buildJwks(LmsToolType.STUDENT);
  }

  private async buildJwks(toolType: LmsToolType): Promise<{ keys: Record<string, unknown>[] }> {
    // Pending configs are published so the LMS can verify a first save's OAuth check.
    let configs = await this.configRepo.find({
      where: { status: In([LmsConfigStatus.ACTIVE, LmsConfigStatus.PENDING]), toolType },
    });

    // Backward compatible until separate student tool configs exist (issue #3).
    if (toolType === LmsToolType.STUDENT && configs.length === 0) {
      configs = await this.configRepo.find({
        where: { status: LmsConfigStatus.ACTIVE, toolType: LmsToolType.EDUCATOR },
      });
    }

    const keys: Record<string, unknown>[] = [];
    const seenKids = new Set<string>();

    for (const config of configs) {
      const kid = config.platformKeyId?.trim();
      const pem = config.platformPrivateKeyPem?.trim();
      if (!kid || !pem || seenKids.has(kid)) {
        continue;
      }

      try {
        keys.push(await publicJwkFromPrivatePem(pem, kid));
        seenKids.add(kid);
      } catch (err) {
        this.logger.error(
          `[LMS] Failed to build JWK for school "${config.schoolId}" (toolType: ${config.toolType}, kid: ${kid}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Fallback: if no school keys exist, use global fallback keys from env/Key Vault.
    // This ensures JWKS is never empty on fresh installs, unblocking LTI tool registration.
    if (keys.length === 0) {
      const fallback = await this.getFallbackJwk();
      if (fallback) {
        keys.push(fallback.jwk);
        this.logger.warn(
          `[LMS] No school-specific JWKS keys found for toolType "${toolType}". Returning fallback key (kid: ${fallback.kid}). ` +
            `LTI registration will succeed, but launches require a configured school.`,
        );
      } else {
        this.logger.error(
          `[LMS] No JWKS keys available for toolType "${toolType}" and no fallback key configured. ` +
            `Set LTI_FALLBACK_KEY_ID and LTI_FALLBACK_PRIVATE_KEY_PEM in env or Key Vault to enable LTI registration on fresh installs.`,
        );
      }
    }

    return { keys };
  }

  private async getFallbackJwk(): Promise<{ jwk: Record<string, unknown>; kid: string } | null> {
    const kid = this.configService.get<string>('lti.fallbackKeyId')?.trim();
    const pem = this.configService.get<string>('lti.fallbackPrivateKeyPem')?.trim();

    if (!kid || !pem) {
      return null;
    }

    try {
      return { jwk: await publicJwkFromPrivatePem(pem, kid), kid };
    } catch (err) {
      this.logger.error(
        `[LMS] Failed to build fallback JWK (kid: ${kid}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  getBaseUrl(): string {
    const configured = this.configService.get<string>('app.apiBaseUrl')?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }

    const nodeEnv = (this.configService.get<string>('app.nodeEnv') ?? '').toLowerCase();
    const port = this.configService.get<string>('app.appPort', '3000');
    const fallback = `http://localhost:${port}`;
    // Cloud "dev" also uses NODE_ENV=development (Key Vault), so NODE_ENV alone
    // cannot mean "local machine". Only allow localhost fallback when APP_URL
    // clearly points at a local host.
    const appUrlRaw = this.configService.get<string>('app.appUrl')?.trim() ?? '';
    const appUrl = appUrlRaw.toLowerCase();
    const isLocalAppUrl = appUrl.includes('localhost') || appUrl.includes('127.0.0.1');
    const allowLocalhostFallback = LOCAL_NODE_ENVS.has(nodeEnv) && isLocalAppUrl;

    if (!allowLocalhostFallback) {
      const appUrlLabel = appUrlRaw || '(unset)';
      const deployedHint =
        nodeEnv === 'development' && !isLocalAppUrl
          ? ' This looks like a deployed host (cloud-dev uses NODE_ENV=development).'
          : '';
      const errorMessage =
        `API_BASE_URL is not configured (NODE_ENV=${nodeEnv || '(unset)'}, APP_URL=${appUrlLabel}).` +
        `${deployedHint} LTI URLs would incorrectly fall back to localhost. ` +
        `Set API_BASE_URL in environment or Key Vault (edu-api-base-url).`;
      this.logger.error(`[LTI] ${errorMessage}`);
      // Boot-time validation: plain Error is fine for onModuleInit. Request-time callers
      // (lti.service/controller) assume env is stable after a successful boot.
      throw new Error(errorMessage);
    }

    this.logger.warn(
      `[LTI] API_BASE_URL not configured (NODE_ENV=${nodeEnv}, APP_URL=${appUrlRaw}). ` +
        `Using fallback: ${fallback}. Set API_BASE_URL when testing LTI against a public tunnel (e.g. ngrok). ` +
        `Missing API_BASE_URL fails startup in deployed environments (including cloud-dev).`,
    );
    return fallback;
  }
}
