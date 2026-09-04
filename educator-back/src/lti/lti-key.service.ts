import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LmsConfigStatus, LmsToolType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/lms/entity/lms-school-config.entity';
import { publicJwkFromPrivatePem } from 'src/lms/utils/lms-key.util';

@Injectable()
export class LtiKeyService {
  private readonly logger = new Logger(LtiKeyService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(LmsSchoolConfig)
    private readonly configRepo: Repository<LmsSchoolConfig>,
  ) {}

  async getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    return this.buildJwks(LmsToolType.EDUCATOR);
  }

  async getStudentJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    return this.buildJwks(LmsToolType.STUDENT);
  }

  private async buildJwks(toolType: LmsToolType): Promise<{ keys: Record<string, unknown>[] }> {
    let configs = await this.configRepo.find({
      where: { status: LmsConfigStatus.ACTIVE, toolType },
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
    const kid = this.configService.get<string>('LTI_FALLBACK_KEY_ID')?.trim();
    const pem = this.configService.get<string>('LTI_FALLBACK_PRIVATE_KEY_PEM')?.trim();

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
    const configured = this.configService.get<string>('API_BASE_URL');
    if (configured) {
      const baseUrl = configured.replace(/\/$/, '');
      return baseUrl;
    }
    const port = this.configService.get<string>('APP_PORT', '3000');
    const fallback = `http://localhost:${port}`;
    return fallback;
  }
}
