import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigureLmsDto } from '../dto/lms.dto';
import { LmsSchoolConfig } from '../entity/lms-school-config.entity';
import { LmsConfigStatus, LmsToolType } from 'src/common/enums/lms.enum';
import { LmsConstants } from '../lms.constants';
import { generatePlatformKeyPair, normalizePem } from '../utils/lms-key.util';
import { Schools } from 'src/schools/entity/schools.entity';

@Injectable()
export class LmsConfigService {
  private readonly logger = new Logger(LmsConfigService.name);

  constructor(
    @InjectRepository(LmsSchoolConfig)
    private readonly configRepo: Repository<LmsSchoolConfig>,
    @InjectRepository(Schools)
    private readonly schoolsRepo: Repository<Schools>,
    private readonly dataSource: DataSource,
  ) {}

  async upsertConfig(dto: ConfigureLmsDto): Promise<LmsSchoolConfig> {
    const toolType = dto.toolType ?? LmsToolType.EDUCATOR;
    this.logger.log(
      `[LMS] upsertConfig called — school: ${dto.schoolId}, toolType: ${toolType}, client_id: ${dto.clientId}, lmsType: ${dto.lmsType}`,
    );

    const existing = await this.configRepo.findOne({
      where: { schoolId: dto.schoolId, toolType },
    });

    if (existing) {
      this.logger.log(
        `[LMS] Existing config found for school ${dto.schoolId} toolType ${toolType} — updating`,
      );
    } else {
      this.logger.log(
        `[LMS] No existing config for school ${dto.schoolId} toolType ${toolType} — creating new`,
      );
    }

    let platformPrivateKeyPem = dto.platformPrivateKeyPem?.trim() ?? '';
    let platformKeyId = dto.platformKeyId?.trim() ?? '';

    if (!platformPrivateKeyPem || !platformKeyId) {
      if (existing?.platformPrivateKeyPem && existing?.platformKeyId) {
        this.logger.log(`[LMS] Reusing existing key pair for school ${dto.schoolId}`);
        platformPrivateKeyPem = platformPrivateKeyPem || existing.platformPrivateKeyPem;
        platformKeyId = platformKeyId || existing.platformKeyId;
      } else {
        this.logger.log(`[LMS] Generating new RSA key pair for school ${dto.schoolId}`);
        const generated = await generatePlatformKeyPair();
        platformPrivateKeyPem = platformPrivateKeyPem || generated.platformPrivateKeyPem;
        platformKeyId = platformKeyId || generated.platformKeyId;
        this.logger.log(`[LMS] Generated key pair with kid: ${platformKeyId}`);
      }
    }

    const entity = this.configRepo.create({
      ...existing,
      schoolId: dto.schoolId,
      toolType,
      lmsType: dto.lmsType,
      issuer: dto.issuer,
      clientId: dto.clientId,
      deploymentId: dto.deploymentId ?? null,
      authEndpoint: dto.authEndpoint,
      tokenEndpoint: dto.tokenEndpoint,
      jwksUrl: dto.jwksUrl,
      platformPrivateKeyPem: normalizePem(platformPrivateKeyPem),
      platformKeyId,
      sharePii: dto.sharePii ?? existing?.sharePii ?? true,
      lmsBaseUrl: dto.lmsBaseUrl?.trim() || dto.moodleUrl?.trim() || existing?.lmsBaseUrl || null,
      lmsApiToken:
        dto.lmsApiToken?.trim() || dto.moodleWsToken?.trim() || existing?.lmsApiToken || null,
      status: LmsConfigStatus.ACTIVE,
    });

    const saved = await this.configRepo.save(entity);
    this.logger.log(
      `[LMS] Config saved for school ${dto.schoolId} — id: ${saved.id}, client_id: ${saved.clientId}, status: ${saved.status}`,
    );

    try {
      await this.dataSource.manager.update(Schools, { id: dto.schoolId }, { lms_enabled: true });
      this.logger.log(`[LMS] Set lms_enabled=true for school ${dto.schoolId}`);
    } catch (e) {
      this.logger.warn(
        `[LMS] Could not set lms_enabled on school ${dto.schoolId}: ${(e as Error).message}`,
      );
    }

    return saved;
  }

  async findSchoolbyIssuer(issuer: string): Promise<Schools | null> {
    const normalizedIssuer = issuer.trim().replace(/\/+$/, '').toLowerCase();
    if (!normalizedIssuer) {
      return null;
    }

    const lmsConfig = await this.configRepo
      .createQueryBuilder('cfg')
      .where('cfg.status = :status', { status: LmsConfigStatus.ACTIVE })
      .andWhere(
        `(
          regexp_replace(lower(cfg.issuer), '/+$', '') = :normalizedIssuer
          OR regexp_replace(lower(coalesce(cfg.lmsBaseUrl, '')), '/+$', '') = :normalizedIssuer
        )`,
        { normalizedIssuer },
      )
      .getOne();

    if (!lmsConfig?.schoolId) {
      return null;
    }

    const school = await this.schoolsRepo.findOne({
      where: { id: lmsConfig.schoolId },
    });

    return school ?? null;
  }

  async findByIssuer(issuer: string): Promise<LmsSchoolConfig | null> {
    const normalizedIssuer = issuer.trim().replace(/\/+$/, '');
    if (!normalizedIssuer) {
      return null;
    }

    const issuerWithSlash = `${normalizedIssuer}/`;
    return this.configRepo.findOne({
      where: [
        { issuer: normalizedIssuer, status: LmsConfigStatus.ACTIVE },
        { issuer: issuerWithSlash, status: LmsConfigStatus.ACTIVE },
      ],
    });
  }

  /**
   * Resolve educator-tool LMS config for an LTI launch (issuer + client ID).
   * Prefers clientId match; falls back to issuer when clientId is missing.
   * When multiple schools share one tool, pass educatorSchoolIds to pick the matching row.
   */
  async resolveEducatorLaunchConfig(
    issuer: string,
    clientId?: string | null,
    educatorSchoolIds?: string[] | null,
  ): Promise<LmsSchoolConfig | null> {
    const pickConfig = (candidates: LmsSchoolConfig[]): LmsSchoolConfig | null => {
      if (candidates.length === 0) {
        return null;
      }
      const allowedSchoolIds = (educatorSchoolIds ?? []).map((id) => id.trim()).filter(Boolean);
      if (allowedSchoolIds.length > 0) {
        const matched = candidates.find(
          (config) => config.schoolId && allowedSchoolIds.includes(config.schoolId),
        );
        return matched ?? null;
      }
      return candidates[0];
    };

    const candidates = await this.findActiveConfigsByIssuerAndClient(
      issuer,
      clientId,
      LmsToolType.EDUCATOR,
    );
    return pickConfig(candidates);
  }

  /**
   * All active student-tool configs for an LTI launch (issuer + client ID).
   * Falls back to educator-tool rows until separate student configs exist (issue #3).
   */
  async listStudentLaunchConfigs(
    issuer: string,
    clientId?: string | null,
  ): Promise<LmsSchoolConfig[]> {
    let configs = await this.findActiveConfigsByIssuerAndClient(
      issuer,
      clientId,
      LmsToolType.STUDENT,
    );
    if (configs.length === 0) {
      configs = await this.findActiveConfigsByIssuerAndClient(
        issuer,
        clientId,
        LmsToolType.EDUCATOR,
      );
    }
    return configs;
  }

  /** Per-school deployment binding — empty config deploymentId accepts any token deployment. */
  configMatchesLaunchDeployment(
    config: LmsSchoolConfig,
    tokenDeploymentId: string | null | undefined,
  ): boolean {
    const expected = config.deploymentId?.trim();
    if (!expected) {
      return true;
    }
    const tokenDeployment = tokenDeploymentId?.trim();
    if (!tokenDeployment) {
      return false;
    }
    return tokenDeployment === expected;
  }

  filterConfigsByLaunchDeployment(
    configs: LmsSchoolConfig[],
    tokenDeploymentId: string | null | undefined,
  ): LmsSchoolConfig[] {
    return configs.filter((config) =>
      this.configMatchesLaunchDeployment(config, tokenDeploymentId),
    );
  }

  private async findActiveConfigsByIssuerAndClient(
    issuer: string,
    clientId: string | null | undefined,
    toolType: LmsToolType,
  ): Promise<LmsSchoolConfig[]> {
    const normalizedClientId = clientId?.trim();
    if (normalizedClientId) {
      const byClient =
        (await this.configRepo.find({
          where: {
            clientId: normalizedClientId,
            toolType,
            status: LmsConfigStatus.ACTIVE,
          },
        })) ?? [];
      const clientMatches = byClient.filter((config) => this.issuerMatchesLaunch(config, issuer));
      if (clientMatches.length > 0) {
        return clientMatches;
      }
      // JWT was verified against this clientId — do not fall back to issuer-only lookup.
      return [];
    }

    const normalizedIssuer = issuer.trim().replace(/\/+$/, '');
    if (!normalizedIssuer) {
      return [];
    }

    return this.configRepo.find({
      where: [
        {
          issuer: normalizedIssuer,
          toolType,
          status: LmsConfigStatus.ACTIVE,
        },
        {
          issuer: `${normalizedIssuer}/`,
          toolType,
          status: LmsConfigStatus.ACTIVE,
        },
      ],
    });
  }

  private issuerMatchesLaunch(config: LmsSchoolConfig, issuer: string): boolean {
    const normalize = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();
    const launchIssuer = normalize(issuer);
    if (!launchIssuer) {
      return false;
    }
    if (normalize(config.issuer) === launchIssuer) {
      return true;
    }
    if (config.lmsBaseUrl && normalize(config.lmsBaseUrl) === launchIssuer) {
      return true;
    }
    return false;
  }

  async findByClientId(clientId: string): Promise<LmsSchoolConfig | null> {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId) {
      return null;
    }

    return this.configRepo.findOne({
      where: { clientId: normalizedClientId, status: LmsConfigStatus.ACTIVE },
    });
  }

  async findSchoolByClientId(clientId: string): Promise<Schools | null> {
    const config = await this.findByClientId(clientId);
    if (!config?.schoolId) {
      return null;
    }

    const school = await this.schoolsRepo.findOne({
      where: { id: config.schoolId },
    });

    return school ?? null;
  }

  async getBySchoolId(
    schoolId: string,
    toolType: LmsToolType = LmsToolType.EDUCATOR,
  ): Promise<LmsSchoolConfig> {
    const config = await this.configRepo.findOne({ where: { schoolId, toolType } });
    if (!config) {
      throw new NotFoundException(LmsConstants.MESSAGES.CONFIG_NOT_FOUND);
    }
    return config;
  }

  async getOptionalBySchoolId(
    schoolId: string,
    toolType: LmsToolType = LmsToolType.EDUCATOR,
  ): Promise<LmsSchoolConfig | null> {
    return this.configRepo.findOne({ where: { schoolId, toolType } });
  }

  sanitize(config: LmsSchoolConfig): Omit<
    LmsSchoolConfig,
    'platformPrivateKeyPem' | 'lmsApiToken'
  > & {
    moodleUrl?: string | null;
  } {
    const {
      platformPrivateKeyPem: _platformPrivateKeyPem,
      lmsApiToken: _lmsApiToken,
      ...safe
    } = config;
    return {
      ...safe,
      moodleUrl: safe.lmsBaseUrl,
    };
  }
}
