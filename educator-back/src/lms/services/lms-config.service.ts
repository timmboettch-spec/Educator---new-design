import {
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigureLmsDto, TestLmsConfigDto } from '../dto/lms.dto';

import { LmsConfigStatus, LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import { LmsTestConfigResult } from 'src/common/interfaces';
import { LmsConstants } from '../lms.constants';
import { generatePlatformKeyPair, normalizePem } from '../utils/lms-key.util';
import { resolveMoodleWsCredentials } from '../utils/moodle-ws.util';
import {
  formatLmsHttpFailure,
  isFriendlyOauthError,
  sanitizeLmsErrorBody,
} from '../utils/lms-error.util';
import { assertValidCanvasIssuer } from '../utils/lms-endpoints.util';
import { LmsSchoolConfig, Schools } from 'src/database/entities';
import { LMS_SCHOOL_CONFIG_REPOSITORY, SCHOOLS_REPOSITORY } from 'src/database/tokens';
import { LmsSchoolConfigRepository, SchoolsRepository } from 'src/database/repositories';
import { LoggerService, OutboundHttpClient } from '../../common/services';
import { OutboundIntegration } from '../../common/constants';
import { LmsAuthService } from './lms-auth.service';

@Injectable()
export class LmsConfigService {
  constructor(
    @Inject(LMS_SCHOOL_CONFIG_REPOSITORY)
    private readonly configRepo: LmsSchoolConfigRepository,
    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolsRepo: SchoolsRepository,
    private readonly logger: LoggerService,
    private readonly lmsAuthService: LmsAuthService,
    private readonly outboundHttp: OutboundHttpClient,
  ) { }

  async upsertConfig(dto: ConfigureLmsDto): Promise<LmsSchoolConfig> {
    const toolType = dto.toolType ?? LmsToolType.EDUCATOR;
    this.logger.log(
      `[LMS] upsertConfig called — school: ${dto.schoolId}, toolType: ${toolType}, client_id: ${dto.clientId}, lmsType: ${dto.lmsType}`,
    );

    if (dto.lmsType === LmsType.CANVAS) {
      const baseUrl = dto.lmsBaseUrl?.trim() || dto.moodleUrl?.trim() || '';
      try {
        assertValidCanvasIssuer(dto.issuer ?? '', baseUrl);
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error ? err.message : LmsConstants.MESSAGES.CANVAS_ISSUER_INVALID,
        );
      }
    }

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

    const verifyDto: TestLmsConfigDto = {
      schoolId: dto.schoolId,
      lmsType: dto.lmsType,
      toolType,
      issuer: dto.issuer,
      clientId: dto.clientId,
      deploymentId: dto.deploymentId,
      authEndpoint: dto.authEndpoint,
      tokenEndpoint: dto.tokenEndpoint,
      jwksUrl: dto.jwksUrl,
      platformPrivateKeyPem: normalizePem(platformPrivateKeyPem),
      platformKeyId,
      sharePii: dto.sharePii,
      lmsBaseUrl: dto.lmsBaseUrl,
      moodleUrl: dto.moodleUrl,
      lmsApiToken: dto.lmsApiToken,
      moodleWsToken: dto.moodleWsToken,
    };

    // The LMS verifies our OAuth assertion against /lti/jwks, which serves keys of saved
    // ACTIVE/PENDING configs — unpublished keys are saved as PENDING before verifying.
    const keysPublished =
      existing?.status === LmsConfigStatus.ACTIVE &&
      existing.platformKeyId === platformKeyId &&
      Boolean(existing.platformPrivateKeyPem?.trim());

    if (keysPublished) {
      await this.assertConfigVerified(dto.schoolId!, verifyDto);
    }

    let saved = await this.configRepo.create({
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
      status: keysPublished ? LmsConfigStatus.ACTIVE : LmsConfigStatus.PENDING,
    });

    if (!keysPublished) {
      try {
        await this.assertConfigVerified(dto.schoolId!, verifyDto);
      } catch (err) {
        await this.rollbackUnverifiedConfig(saved, existing);
        throw err;
      }
      saved = await this.configRepo.create({ ...saved, status: LmsConfigStatus.ACTIVE });
    }

    this.logger.log(
      `[LMS] Config saved for school ${dto.schoolId} — id: ${saved.id}, client_id: ${saved.clientId}, status: ${saved.status}`,
    );

    try {
      if (dto.schoolId) {
        await this.schoolsRepo.update(dto.schoolId, { lms_enabled: true });
      }
      this.logger.log(`[LMS] Set lms_enabled=true for school ${dto.schoolId}`);
    } catch (e) {
      this.logger.warn(
        `[LMS] Could not set lms_enabled on school ${dto.schoolId}: ${(e as Error).message}`,
      );
    }

    return saved;
  }

  /** OAuth (Client ID + our keys) must pass; API / WS token is checked only when supplied. */
  private async assertConfigVerified(schoolId: string, dto: TestLmsConfigDto): Promise<void> {
    const verification = await this.testConfig(schoolId, dto);
    if (verification.success && verification.oauthOk === true) {
      return;
    }
    const message = verification.message || LmsConstants.MESSAGES.CONFIG_SAVE_UNVERIFIED;
    this.logger.warn(`[LMS] upsertConfig blocked for school ${schoolId}: ${message}`);
    throw new BadRequestException(message);
  }

  private async rollbackUnverifiedConfig(
    saved: LmsSchoolConfig,
    previous: LmsSchoolConfig | null,
  ): Promise<void> {
    try {
      if (previous) {
        await this.configRepo.create(previous);
      } else {
        await this.configRepo.deleteById(saved.id);
      }
    } catch (err) {
      this.logger.error(
        `[LMS] Failed to roll back unverified config ${saved.id} for school ${saved.schoolId}: ${(err as Error).message}`,
      );
    }
  }

  async findSchoolbyIssuer(issuer: string): Promise<Schools | null> {
    const normalizedIssuer = issuer.trim().replace(/\/+$/, '').toLowerCase();
    if (!normalizedIssuer) {
      return null;
    }

    const lmsConfig = await this.configRepo.findActiveByNormalizedIssuer(normalizedIssuer);

    if (!lmsConfig?.schoolId) {
      return null;
    }

    const school = await this.schoolsRepo.findOne({
      where: { id: lmsConfig.schoolId },
    });

    return school ?? null;
  }

  async findByIssuer(issuer: string): Promise<LmsSchoolConfig | null> {
    // Try EDUCATOR first (most common)
    const educatorConfigs = await this.listEducatorConfigsByIssuer(issuer);
    if (educatorConfigs.length > 0) {
      return educatorConfigs[0];
    }

    // Fall back to STUDENT-only configs for JWKS lookup
    // (verifyIdToken needs jwksUrl regardless of tool type)
    const studentConfigs = await this.findActiveConfigsByIssuerOnly(issuer, LmsToolType.STUDENT);
    return studentConfigs[0] ?? null;
  }

  /** All active educator-tool configs for an issuer (multi-school Moodle deployments). */
  async listEducatorConfigsByIssuer(issuer: string): Promise<LmsSchoolConfig[]> {
    return this.findActiveConfigsByIssuerOnly(issuer, LmsToolType.EDUCATOR);
  }

  async listEducatorLaunchConfigs(
    issuer: string,
    clientId?: string | null,
  ): Promise<LmsSchoolConfig[]> {
    return this.findActiveConfigsByIssuerAndClient(issuer, clientId, LmsToolType.EDUCATOR);
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
   * When the student tool uses a different client ID than educator configs, falls back
   * to issuer-only lookup so shared Moodle deployments keep working.
   */
  async listStudentLaunchConfigs(
    issuer: string,
    clientId?: string | null,
  ): Promise<LmsSchoolConfig[]> {
    const byToolType = async (toolType: LmsToolType): Promise<LmsSchoolConfig[]> => {
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
      }

      return this.findActiveConfigsByIssuerOnly(issuer, toolType);
    };

    let configs = await byToolType(LmsToolType.STUDENT);
    if (configs.length === 0) {
      configs = await byToolType(LmsToolType.EDUCATOR);
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

    return this.findActiveConfigsByIssuerOnly(issuer, toolType);
  }

  private async findActiveConfigsByIssuerOnly(
    issuer: string,
    toolType: LmsToolType,
  ): Promise<LmsSchoolConfig[]> {
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

  async resolveStudentLaunchConfig(
    issuer: string,
    clientId?: string | null,
  ): Promise<LmsSchoolConfig | null> {
    const normalizedClientId = clientId?.trim();
    if (normalizedClientId) {
      const byClient = await this.configRepo.findOne({
        where: {
          clientId: normalizedClientId,
          toolType: LmsToolType.STUDENT,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      if (byClient) {
        return byClient;
      }
    }

    const normalizedIssuer = issuer.trim().replace(/\/+$/, '');
    if (!normalizedIssuer) {
      return null;
    }

    return this.configRepo.findOne({
      where: [
        {
          issuer: normalizedIssuer,
          toolType: LmsToolType.STUDENT,
          status: LmsConfigStatus.ACTIVE,
        },
        {
          issuer: `${normalizedIssuer}/`,
          toolType: LmsToolType.STUDENT,
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

  /** Verified (ACTIVE) config only — use for anything that calls the LMS on the school's behalf. */
  async getActiveBySchoolId(
    schoolId: string,
    toolType: LmsToolType = LmsToolType.EDUCATOR,
  ): Promise<LmsSchoolConfig> {
    const config = await this.getActiveOptionalBySchoolId(schoolId, toolType);
    if (!config) {
      throw new NotFoundException(LmsConstants.MESSAGES.CONFIG_NOT_FOUND);
    }
    return config;
  }

  /**
   * Ping LMS with credentials from the request body merged over any saved school config.
   * Never persists. Used by Test Connection (pre- and post-save).
   *
   * Canvas: Issuer shape + base URL probe + OAuth (Client ID). When an API token is supplied,
   * it must be valid and the Deployment ID (if given) must exist on Canvas.
   * Moodle: OAuth (Client ID). When a web service token is supplied, it must pass site info.
   * Deployment ID without a token is enforced at launch (configMatchesLaunchDeployment).
   */
  async testConfig(schoolId: string, dto: TestLmsConfigDto): Promise<LmsTestConfigResult> {
    const toolType = dto.toolType ?? LmsToolType.EDUCATOR;
    const existing = await this.getOptionalBySchoolId(schoolId, toolType);
    const merged = this.mergeTestConfig(schoolId, toolType, dto, existing);

    const canTestOauth = Boolean(
      merged.tokenEndpoint?.trim() &&
      merged.clientId?.trim() &&
      merged.platformPrivateKeyPem?.trim() &&
      merged.platformKeyId?.trim(),
    );
    const baseUrl = (merged.lmsBaseUrl ?? '').trim();
    const apiToken = (merged.lmsApiToken ?? '').trim();
    const lmsType = merged.lmsType || dto.lmsType || existing?.lmsType || null;
    const isCanvas = lmsType === LmsType.CANVAS;
    const isMoodle = lmsType === LmsType.MOODLE || !lmsType;
    const canProbeCanvasBase = isCanvas && Boolean(baseUrl);
    const canTestMoodleApi = isMoodle && Boolean(baseUrl && apiToken);
    const canTestApi = canProbeCanvasBase || canTestMoodleApi;

    if (isCanvas) {
      const issuer = (merged.issuer ?? '').trim();
      if (!baseUrl) {
        return {
          success: false,
          message: LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_BASE_REQUIRED,
          oauthOk: null,
          apiOk: false,
          lmsType,
        };
      }
      if (issuer || baseUrl) {
        try {
          assertValidCanvasIssuer(issuer || baseUrl, baseUrl || issuer);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : LmsConstants.MESSAGES.CANVAS_ISSUER_INVALID;
          return {
            success: false,
            message,
            oauthOk: false,
            apiOk: false,
            lmsType,
          };
        }
      }
    }

    if (isMoodle && !baseUrl) {
      return {
        success: false,
        message: LmsConstants.MESSAGES.CONFIG_TEST_MOODLE_BASE_REQUIRED,
        oauthOk: null,
        apiOk: false,
        lmsType,
      };
    }

    // OAuth is the required check for LTI platforms; keys only exist once the config is saved.
    if ((isCanvas || isMoodle) && !canTestOauth) {
      return {
        success: false,
        message: merged.clientId?.trim()
          ? LmsConstants.MESSAGES.CONFIG_TEST_KEYS_PENDING
          : LmsConstants.MESSAGES.CONFIG_TEST_INCOMPLETE,
        oauthOk: null,
        apiOk: null,
        lmsType,
      };
    }

    if (!canTestOauth && !canTestApi) {
      return {
        success: false,
        message: LmsConstants.MESSAGES.CONFIG_TEST_INCOMPLETE,
        oauthOk: null,
        apiOk: null,
        lmsType,
      };
    }

    let oauthOk: boolean | null = null;
    let apiOk: boolean | null = null;
    const failures: string[] = [];

    if (canTestOauth) {
      try {
        await this.lmsAuthService.getAccessToken(merged, { bypassCache: true });
        oauthOk = true;
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        oauthOk = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[LMS] testConfig OAuth failed for school ${schoolId}: ${msg}`);
        failures.push(this.toUserFacingTestError(msg, 'oauth'));
      }
    }

    if (canProbeCanvasBase) {
      try {
        if (apiToken) {
          await this.pingLmsApi(LmsType.CANVAS, baseUrl, apiToken);
          const deploymentId = (merged.deploymentId ?? '').trim();
          const clientId = (merged.clientId ?? '').trim();
          if (deploymentId && clientId) {
            await this.assertCanvasDeploymentMatches({
              baseUrl,
              apiToken,
              clientId,
              deploymentId,
            });
          }
        } else {
          await this.pingCanvasBaseUrl(baseUrl);
        }
        apiOk = true;
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        apiOk = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[LMS] testConfig Canvas base/API failed for school ${schoolId}: ${msg}`);
        failures.push(this.toUserFacingTestError(msg, 'api'));
      }
    } else if (canTestMoodleApi) {
      try {
        await this.pingLmsApi(LmsType.MOODLE, baseUrl, apiToken);
        apiOk = true;
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        apiOk = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[LMS] testConfig API ping failed for school ${schoolId}: ${msg}`);
        failures.push(this.toUserFacingTestError(msg, 'api'));
      }
    } else if (lmsType === LmsType.GOOGLE_CLASSROOM) {
      apiOk = null;
    }

    const success =
      (oauthOk === true || oauthOk === null) &&
      (apiOk === true || apiOk === null) &&
      (oauthOk === true || apiOk === true);

    // Canvas/Moodle with a Client ID must pass OAuth — base URL alone is not enough.
    if (success && merged.clientId?.trim() && oauthOk !== true) {
      return {
        success: false,
        message: LmsConstants.MESSAGES.CONFIG_TEST_OAUTH_REQUIRED,
        oauthOk,
        apiOk,
        lmsType,
      };
    }

    // When an API / WS token is supplied, it must pass — do not accept base-URL-only success.
    if (apiToken && apiOk !== true) {
      return {
        success: false,
        message: failures[0] || LmsConstants.MESSAGES.CONFIG_TEST_API_TOKEN_INVALID,
        oauthOk,
        apiOk: apiOk ?? false,
        lmsType,
      };
    }

    const deploymentId = (merged.deploymentId ?? '').trim();
    const successMessage =
      success && isCanvas && deploymentId && !apiToken && oauthOk === true
        ? LmsConstants.MESSAGES.CONFIG_TEST_SUCCESS_CANVAS_DEPLOYMENT_AT_LAUNCH
        : LmsConstants.MESSAGES.CONFIG_TEST_SUCCESS;

    return {
      success,
      message: success ? successMessage : failures[0] || LmsConstants.MESSAGES.CONFIG_TEST_FAILED,
      oauthOk,
      apiOk,
      lmsType,
    };
  }

  private toUserFacingTestError(raw: string, kind: 'oauth' | 'api'): string {
    if (isFriendlyOauthError(raw)) {
      return raw;
    }
    const cleaned = sanitizeLmsErrorBody(raw, 160);
    if (cleaned && !/<[a-z][\s\S]*>/i.test(cleaned)) {
      // Already formatted by formatLmsHttpFailure or a short LMS message
      if (cleaned.toLowerCase().includes('lms connection failed')) {
        return cleaned;
      }
      return kind === 'oauth' ? `OAuth check failed: ${cleaned}` : `API check failed: ${cleaned}`;
    }
    return kind === 'oauth'
      ? 'OAuth check failed. Verify Issuer URL, Client ID, and LTI tool registration.'
      : 'API check failed. Verify LMS base URL and API / web service token.';
  }

  private mergeTestConfig(
    schoolId: string,
    toolType: LmsToolType,
    dto: TestLmsConfigDto,
    existing: LmsSchoolConfig | null,
  ): LmsSchoolConfig {
    const pick = (fromDto?: string | null, fromExisting?: string | null): string =>
      (fromDto?.trim() || fromExisting?.trim() || '').trim();

    const config = {
      id: existing?.id ?? 'test-config-ephemeral',
      schoolId,
      toolType,
      lmsType: dto.lmsType ?? existing?.lmsType ?? LmsType.MOODLE,
      issuer: pick(dto.issuer, existing?.issuer),
      clientId: pick(dto.clientId, existing?.clientId),
      deploymentId: dto.deploymentId?.trim() || existing?.deploymentId || null,
      authEndpoint: pick(dto.authEndpoint, existing?.authEndpoint),
      tokenEndpoint: pick(dto.tokenEndpoint, existing?.tokenEndpoint),
      jwksUrl: pick(dto.jwksUrl, existing?.jwksUrl),
      platformPrivateKeyPem: pick(dto.platformPrivateKeyPem, existing?.platformPrivateKeyPem),
      platformKeyId: pick(dto.platformKeyId, existing?.platformKeyId),
      sharePii: dto.sharePii ?? existing?.sharePii ?? true,
      lmsBaseUrl:
        pick(dto.lmsBaseUrl, null) || pick(dto.moodleUrl, null) || existing?.lmsBaseUrl || null,
      lmsApiToken:
        pick(dto.lmsApiToken, null) ||
        pick(dto.moodleWsToken, null) ||
        existing?.lmsApiToken ||
        null,
      status: existing?.status ?? LmsConfigStatus.ACTIVE,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: existing?.updatedAt ?? new Date(),
    };

    if (config.platformPrivateKeyPem) {
      config.platformPrivateKeyPem = normalizePem(config.platformPrivateKeyPem);
    }

    return config;
  }

  private canvasApiHeaders(apiToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json',
      // Canvas is rolling out a required User-Agent for API requests.
      'User-Agent': 'RealityWorksEducatorBackend/1.0 (LMS config verify)',
    };
  }

  /**
   * Confirm Deployment ID exists for this Client ID on the Canvas base URL.
   * Uses classic external_tools plus the newer Apps / LTI registrations deployments APIs
   * (Canvas Apps UI installs often only show up there).
   * OAuth already proved Client ID — match primarily on deployment_id.
   */
  private async assertCanvasDeploymentMatches(params: {
    baseUrl: string;
    apiToken: string;
    clientId: string;
    deploymentId: string;
  }): Promise<void> {
    const base = params.baseUrl.replace(/\/$/, '');
    const expectedClientId = params.clientId.trim();
    const expectedDeploymentId = params.deploymentId.trim();
    const foundDeploymentIds = new Set<string>();

    const collect = (ids: string[]) => {
      for (const id of ids) {
        const trimmed = id.trim();
        if (trimmed) {
          foundDeploymentIds.add(trimmed);
        }
      }
    };

    // 1) Classic external tools (account + a sample of courses)
    try {
      const accountTools = await this.fetchCanvasExternalToolPages(
        base,
        params.apiToken,
        `${base}/api/v1/accounts/self/external_tools?include_parents=true&per_page=100`,
      );
      collect(accountTools.map((t) => String(t.deployment_id ?? '')));
    } catch (err) {
      this.logger.warn(
        `[LMS] Canvas account external_tools list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!foundDeploymentIds.has(expectedDeploymentId)) {
      const courseIds = await this.listCanvasCourseIdsForDeploymentScan(base, params.apiToken);
      for (const courseId of courseIds) {
        try {
          const courseTools = await this.fetchCanvasExternalToolPages(
            base,
            params.apiToken,
            `${base}/api/v1/courses/${courseId}/external_tools?include_parents=true&per_page=100`,
          );
          collect(courseTools.map((t) => String(t.deployment_id ?? '')));
          if (foundDeploymentIds.has(expectedDeploymentId)) {
            break;
          }
        } catch (err) {
          this.logger.warn(
            `[LMS] Canvas course ${courseId} external_tools skipped: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // 2) Newer Canvas Apps / LTI registrations deployments (matches Admin → Apps UI)
    if (!foundDeploymentIds.has(expectedDeploymentId)) {
      collect(await this.listCanvasAppDeploymentIds(base, params.apiToken, expectedClientId));
    }

    if (!foundDeploymentIds.has(expectedDeploymentId)) {
      const sample = [...foundDeploymentIds].slice(0, 5).join(', ') || '(none)';
      this.logger.warn(
        `[LMS] Canvas deployment mismatch — clientId=${expectedClientId}, expected=${expectedDeploymentId}, foundCount=${foundDeploymentIds.size}, sample=${sample}`,
      );
      throw new Error(LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH);
    }
  }

  /**
   * List deployment_ids from Canvas Apps / LTI registrations APIs for this Client ID.
   */
  private async listCanvasAppDeploymentIds(
    base: string,
    apiToken: string,
    clientId: string,
  ): Promise<string[]> {
    const deploymentIds: string[] = [];
    const accountIds = await this.resolveCanvasAccountIds(base, apiToken);

    for (const accountId of accountIds) {
      const registrationIds = new Set<string>();

      // Direct lookup by client id when available
      for (const path of [
        `${base}/api/v1/accounts/${accountId}/apps/install_status/${encodeURIComponent(clientId)}`,
        `${base}/api/v1/accounts/${accountId}/lti_registrations/install_status/${encodeURIComponent(clientId)}`,
      ]) {
        try {
          const reg = await this.fetchCanvasJson(path, apiToken);
          const id = this.extractCanvasRegistrationId(reg);
          if (id) {
            registrationIds.add(id);
          }
        } catch {
          // endpoint may 404 on older Canvas
        }
      }

      // List apps and match client / developer key id
      for (const listPath of [
        `${base}/api/v1/accounts/${accountId}/apps?per_page=100`,
        `${base}/api/v1/accounts/${accountId}/lti_registrations?per_page=100`,
      ]) {
        try {
          const page = await this.fetchCanvasJson(listPath, apiToken);
          const rows = Array.isArray(page)
            ? page
            : Array.isArray((page as { registrations?: unknown[] })?.registrations)
              ? (page as { registrations: unknown[] }).registrations
              : [];
          for (const row of rows) {
            if (this.canvasRegistrationMatchesClientId(row, clientId)) {
              const id = this.extractCanvasRegistrationId(row);
              if (id) {
                registrationIds.add(id);
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            `[LMS] Canvas apps list failed (${listPath}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      for (const registrationId of registrationIds) {
        for (const depPath of [
          `${base}/api/v1/accounts/${accountId}/apps/${registrationId}/deployments?per_page=100`,
          `${base}/api/v1/accounts/${accountId}/lti_registrations/${registrationId}/deployments?per_page=100`,
        ]) {
          try {
            const deps = await this.fetchCanvasJson(depPath, apiToken);
            const rows = Array.isArray(deps) ? deps : [];
            for (const row of rows) {
              const deploymentId = String(
                (row as { deployment_id?: string }).deployment_id ?? '',
              ).trim();
              if (deploymentId) {
                deploymentIds.push(deploymentId);
              }
            }
          } catch (err) {
            this.logger.warn(
              `[LMS] Canvas deployments list failed (${depPath}): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    return deploymentIds;
  }

  private async resolveCanvasAccountIds(base: string, apiToken: string): Promise<string[]> {
    const ids = new Set<string>(['self', '1']);
    try {
      const selfAcct = await this.fetchCanvasJson(`${base}/api/v1/accounts/self`, apiToken);
      const id = (selfAcct as { id?: number | string })?.id;
      if (id !== undefined && id !== null) {
        ids.add(String(id));
      }
    } catch {
      // keep defaults
    }
    return [...ids];
  }

  private extractCanvasRegistrationId(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const obj = raw as { id?: number | string; registration_id?: number | string };
    const id = obj.id ?? obj.registration_id;
    return id === undefined || id === null ? null : String(id);
  }

  private canvasRegistrationMatchesClientId(raw: unknown, clientId: string): boolean {
    if (!raw || typeof raw !== 'object') {
      return false;
    }
    const obj = raw as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.client_id,
      obj.developer_key_id,
      obj.global_developer_key_id,
      (obj.developer_key as { id?: unknown } | undefined)?.id,
      (obj.configuration as { client_id?: unknown } | undefined)?.client_id,
    ];
    return candidates.some((value) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
        return String(value).trim() === clientId;
      }
      return false;
    });
  }

  private async fetchCanvasJson(url: string, apiToken: string): Promise<unknown> {
    const response = await this.outboundHttp.fetch(OutboundIntegration.Lms, url, {
      method: 'GET',
      headers: this.canvasApiHeaders(apiToken),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(formatLmsHttpFailure(response.status, body, 'canvas'));
    }
    try {
      // Preserve large numeric ids (client / developer key) as strings.
      const safe = body.replace(
        /"(developer_key_id|client_id|global_developer_key_id|id)"\s*:\s*(\d{16,})/g,
        '"$1":"$2"',
      );
      return JSON.parse(safe);
    } catch {
      throw new Error('Canvas REST returned invalid JSON');
    }
  }

  private async fetchCanvasExternalToolPages(
    base: string,
    apiToken: string,
    startUrl: string,
  ): Promise<
    Array<{ developer_key_id?: string | null; deployment_id?: string | null; name?: string | null }>
  > {
    const tools: Array<{
      developer_key_id?: string | null;
      deployment_id?: string | null;
      name?: string | null;
    }> = [];
    let nextUrl: string | null = startUrl;
    let pages = 0;
    const maxPages = 20;

    while (nextUrl && pages < maxPages) {
      pages += 1;
      const absoluteUrl = nextUrl.startsWith('http')
        ? nextUrl
        : `${base}${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
      let response: Response;
      try {
        response = await this.outboundHttp.fetch(OutboundIntegration.Lms, absoluteUrl, {
          method: 'GET',
          headers: this.canvasApiHeaders(apiToken),
        });
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH} (${sanitizeLmsErrorBody(detail, 80)})`,
          { cause: err },
        );
      }

      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          formatLmsHttpFailure(response.status, body, 'canvas') ||
          LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH,
        );
      }

      tools.push(...this.parseCanvasExternalToolsPage(body));

      nextUrl = null;
      const linkHeader = response.headers.get('link');
      if (linkHeader) {
        for (const part of linkHeader.split(',')) {
          const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
          if (match?.[1]) {
            nextUrl = match[1];
            break;
          }
        }
      }
    }

    return tools;
  }

  private async listCanvasCourseIdsForDeploymentScan(
    base: string,
    apiToken: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    const candidates = [
      `${base}/api/v1/courses?per_page=50`,
      `${base}/api/v1/accounts/self/courses?per_page=50`,
    ];

    for (const startUrl of candidates) {
      try {
        let nextUrl: string | null = startUrl;
        let pages = 0;
        while (nextUrl && pages < 3) {
          pages += 1;
          const pageUrl: string = nextUrl;
          const response: Response = await this.outboundHttp.fetch(
            OutboundIntegration.Lms,
            pageUrl,
            {
              method: 'GET',
              headers: this.canvasApiHeaders(apiToken),
            },
          );
          const body: string = await response.text();
          if (!response.ok) {
            break;
          }
          let page: unknown;
          try {
            page = JSON.parse(body) as unknown;
          } catch {
            break;
          }
          if (!Array.isArray(page)) {
            break;
          }
          for (const raw of page) {
            const id = (raw as { id?: number | string }).id;
            if (typeof id === 'string' || typeof id === 'number') {
              ids.add(String(id));
            }
          }
          nextUrl = null;
          const linkHeader: string | null = response.headers.get('link');
          if (linkHeader) {
            for (const part of linkHeader.split(',')) {
              const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
              if (match?.[1]) {
                nextUrl = match[1];
                break;
              }
            }
          }
        }
      } catch {
        // try next candidate
      }
      if (ids.size >= 50) {
        break;
      }
    }

    return [...ids].slice(0, 50);
  }

  /** Parse Canvas external-tools JSON without corrupting large developer_key_id values. */
  private parseCanvasExternalToolsPage(body: string): Array<{
    developer_key_id?: string | null;
    deployment_id?: string | null;
    name?: string | null;
  }> {
    // Quote oversized numeric IDs before JSON.parse so they stay exact strings.
    const safeBody = body.replace(/"developer_key_id"\s*:\s*(\d{16,})/g, '"developer_key_id":"$1"');
    let page: unknown;
    try {
      page = JSON.parse(safeBody);
    } catch {
      throw new Error(LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH);
    }
    if (!Array.isArray(page)) {
      throw new Error(LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_DEPLOYMENT_MISMATCH);
    }
    return page.map((raw) => {
      const tool = raw as {
        developer_key_id?: number | string | null;
        deployment_id?: string | null;
        name?: string | null;
      };
      return {
        name: tool.name ?? null,
        deployment_id: tool.deployment_id ?? null,
        developer_key_id:
          tool.developer_key_id === null || tool.developer_key_id === undefined
            ? null
            : String(tool.developer_key_id),
      };
    });
  }

  /**
   * Verify Canvas base URL without an API token.
   * A real Canvas host answers GET /api/v1/users/self with 401/403.
   * Wrong / unreachable hosts fail DNS, connection, or return non-Canvas responses.
   */
  private async pingCanvasBaseUrl(baseUrl: string): Promise<void> {
    const base = baseUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/users/self`;
    let response: Response;
    try {
      response = await this.outboundHttp.fetch(OutboundIntegration.Lms, url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      if (err instanceof GatewayTimeoutException) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${LmsConstants.MESSAGES.CONFIG_TEST_CANVAS_BASE_UNREACHABLE} (${sanitizeLmsErrorBody(detail, 80)})`,
        { cause: err },
      );
    }

    // Unauthenticated Canvas API typically returns 401 (sometimes 403).
    if (response.status === 401 || response.status === 403) {
      return;
    }

    if (response.ok) {
      return;
    }

    const text = await response.text();
    throw new Error(formatLmsHttpFailure(response.status, text, 'canvas'));
  }

  private async pingLmsApi(lmsType: LmsType, baseUrl: string, apiToken: string): Promise<void> {
    const base = baseUrl.replace(/\/$/, '');

    if (lmsType === LmsType.MOODLE) {
      const credentials = resolveMoodleWsCredentials({
        lmsBaseUrl: base,
        lmsApiToken: apiToken,
      });
      if (!credentials) {
        throw new Error('Moodle base URL and WS token are required');
      }
      const url =
        `${credentials.moodleUrl}/webservice/rest/server.php` +
        `?wstoken=${encodeURIComponent(credentials.wsToken)}` +
        `&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`;
      const response = await this.outboundHttp.fetch(OutboundIntegration.Moodle, url);
      const raw = await response.text();
      let body: { exception?: string; message?: string };
      try {
        body = JSON.parse(raw) as { exception?: string; message?: string };
      } catch {
        throw new Error(formatLmsHttpFailure(response.status || 502, raw, 'moodle'));
      }
      if (!response.ok || body.exception) {
        throw new Error(
          formatLmsHttpFailure(
            response.status || 400,
            body.message || body.exception || raw,
            'moodle',
          ),
        );
      }
      return;
    }

    if (lmsType === LmsType.CANVAS) {
      const response = await this.outboundHttp.fetch(
        OutboundIntegration.Lms,
        `${base}/api/v1/users/self`,
        {
          headers: this.canvasApiHeaders(apiToken),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(formatLmsHttpFailure(response.status, text, 'canvas'));
      }
      return;
    }

    throw new Error(`API ping not supported for ${lmsType}`);
  }

  async getActiveOptionalBySchoolId(
    schoolId: string,
    toolType: LmsToolType = LmsToolType.EDUCATOR,
  ): Promise<LmsSchoolConfig | null> {
    return this.configRepo.findOne({
      where: { schoolId, toolType, status: LmsConfigStatus.ACTIVE },
    });
  }

  /**
   * Resolve LMS OAuth config for grade passback. Uses the client ID from the
   * student launch when stored on the mapping; falls back to active student tool
   * row, then active educator row. Moodle often stores only an educator config
   * while the mapping carries the student-tool client_id from launch — in that
   * case reuse platform keys from the stored row but override clientId for OAuth.
   */
  async resolveOAuthConfigForClient(
    schoolId: string,
    lmsClientId?: string | null,
    preferredToolType: LmsToolType = LmsToolType.STUDENT,
  ): Promise<LmsSchoolConfig> {
    const normalizedClientId = lmsClientId?.trim();

    if (normalizedClientId) {
      const exact = await this.configRepo.findOne({
        where: {
          schoolId,
          clientId: normalizedClientId,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      if (exact) {
        return exact;
      }
    }

    const preferred =
      (await this.getActiveOptionalBySchoolId(schoolId, preferredToolType)) ??
      (await this.getActiveOptionalBySchoolId(schoolId, LmsToolType.EDUCATOR));

    if (!preferred) {
      throw new NotFoundException(LmsConstants.MESSAGES.CONFIG_NOT_FOUND);
    }

    if (normalizedClientId && preferred.clientId !== normalizedClientId) {
      this.logger.debug(
        `[LMS] resolveOAuthConfigForClient: using ${preferred.toolType} config for school ${schoolId} with launch clientId override`,
      );
      const override = Object.create(Object.getPrototypeOf(preferred) as object) as LmsSchoolConfig;
      Object.assign(override, preferred, { clientId: normalizedClientId });
      return override;
    }

    return preferred;
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
