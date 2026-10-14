import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { LmsAdapter } from '../interfaces/lms.interfaces';
import { LmsAdapterFactory } from '../factories/lms-adapter.factory';

import { LmsRosterResponse } from '../interfaces/lms.interfaces';
import { extractCourseIdFromNrpsUrl } from '../utils/nrps.util';
import { assertNrpsUrlAllowed, assertSafeLmsOutboundUrl } from '../utils/lms-url.util';
import { LmsAuthService } from './lms-auth.service';
import { LmsSchoolConfig } from 'src/database/entities';
import { LoggerService } from '../../common/services';

@Injectable()
export class LmsRosterService {
  constructor(
    private readonly authService: LmsAuthService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly logger: LoggerService,
  ) {}

  private getAdapter(config: LmsSchoolConfig): LmsAdapter {
    return this.lmsAdapterFactory.getAdapter(config.lmsType);
  }

  /** SSRF gate: host allowlist when config exists; HTTPS + private/metadata block otherwise. */
  private assertNrpsFetchAllowed(nrpsUrl: string, config: LmsSchoolConfig | null): void {
    if (config) {
      assertNrpsUrlAllowed(nrpsUrl, config);
      return;
    }
    assertSafeLmsOutboundUrl(nrpsUrl);
  }

  async fetchRoster(config: LmsSchoolConfig, nrpsUrl: string): Promise<LmsRosterResponse> {
    this.assertNrpsFetchAllowed(nrpsUrl, config);
    const accessToken = await this.authService.getAccessToken(config);
    return this.getAdapter(config).fetchRoster(nrpsUrl, accessToken);
  }

  async fetchRosterWithAccessToken(
    config: LmsSchoolConfig,
    nrpsUrl: string,
    accessToken: string,
  ): Promise<LmsRosterResponse> {
    this.assertNrpsFetchAllowed(nrpsUrl, config);
    const roster = await this.getAdapter(config).fetchRoster(nrpsUrl, accessToken);
    try {
      return await this.enrichRosterRolesFromWs(config, nrpsUrl, roster);
    } catch (err) {
      this.logger.warn(
        `[LMS Roster] WS role enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return roster;
    }
  }

  /**
   * Prefer platform enrollment roles over stale NRPS roles when the adapter supports it.
   */
  async enrichRosterRolesFromWs(
    config: LmsSchoolConfig,
    nrpsUrl: string,
    roster: LmsRosterResponse,
  ): Promise<LmsRosterResponse> {
    const adapter = this.lmsAdapterFactory.tryGetAdapter(config.lmsType);
    if (!adapter?.enrichRosterRoles) {
      return roster;
    }
    return adapter.enrichRosterRoles(config, nrpsUrl, roster);
  }

  /** Fetch roster with platform WS fallback if NRPS fails. */
  async fetchRosterWithWsFallback(
    config: LmsSchoolConfig,
    nrpsUrl: string,
  ): Promise<LmsRosterResponse> {
    try {
      const roster = await this.fetchRoster(config, nrpsUrl);
      try {
        return await this.enrichRosterRolesFromWs(config, nrpsUrl, roster);
      } catch (enrichError) {
        this.logger.warn(
          `[LMS Roster] WS role enrichment skipped: ${enrichError instanceof Error ? enrichError.message : String(enrichError)}`,
        );
        return roster;
      }
    } catch (nrpsError) {
      // SSRF / validation failures must not fall through to platform WS.
      if (nrpsError instanceof HttpException) {
        throw nrpsError;
      }
      const courseId = extractCourseIdFromNrpsUrl(nrpsUrl);
      const adapter = this.lmsAdapterFactory.tryGetAdapter(config.lmsType);
      if (!courseId || !adapter?.fetchRosterFromPlatformWs) {
        const missing: string[] = [];
        if (!courseId) missing.push('course_id_from_nrps_url');
        if (!adapter?.fetchRosterFromPlatformWs) {
          missing.push('platform_ws_adapter');
        }
        if (!config.lmsBaseUrl) missing.push('lms_base_url');
        if (!config.lmsApiToken) missing.push('lms_api_token');
        throw new Error(
          `NRPS token flow failed (${(nrpsError as Error).message}) and platform WS fallback is unavailable${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. Configure school lmsBaseUrl/lmsApiToken.`,
          { cause: nrpsError },
        );
      }

      try {
        this.logger.warn(
          `[LMS Roster] NRPS failed; falling back to platform WS for course ${courseId}: ${(nrpsError as Error).message}`,
        );
        return await adapter.fetchRosterFromPlatformWs(config, courseId);
      } catch (wsError) {
        throw new Error(
          `NRPS token flow failed (${(nrpsError as Error).message}) and platform WS fallback failed (${(wsError as Error).message}).`,
          { cause: wsError },
        );
      }
    }
  }

  /**
   * Live roster for Educator portal — requires an active `lms_school_config` row
   * (no launch NRPS token fallback after LTI-15).
   */
  async fetchRosterForLiveEndpoint(
    config: LmsSchoolConfig | null,
    nrpsUrl: string,
  ): Promise<LmsRosterResponse> {
    this.assertNrpsFetchAllowed(nrpsUrl, config);
    if (!config) {
      throw new BadRequestException('No LMS configuration found for roster fetch.');
    }
    return this.fetchRosterWithWsFallback(config, nrpsUrl);
  }
}
