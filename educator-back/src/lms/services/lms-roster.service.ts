import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LmsType } from 'src/common/enums/lms.enum';
import { MoodleAdapter } from '../adapters/moodle.adapter';
import { LmsAdapterFactory } from '../factories/lms-adapter.factory';
import { LmsSchoolConfig } from '../entity/lms-school-config.entity';
import { LmsRosterResponse } from '../interfaces/lms.interfaces';
import { resolveMoodleWsCredentials } from '../utils/moodle-ws.util';
import { extractCourseIdFromNrpsUrl } from '../utils/nrps.util';
import { LmsAuthService } from './lms-auth.service';

@Injectable()
export class LmsRosterService {
  private readonly logger = new Logger(LmsRosterService.name);

  constructor(
    private readonly authService: LmsAuthService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly configService: ConfigService,
  ) {}

  async fetchRoster(config: LmsSchoolConfig, nrpsUrl: string): Promise<LmsRosterResponse> {
    const accessToken = await this.authService.getAccessToken(config);
    const adapter = this.lmsAdapterFactory.getAdapter(config.lmsType);
    return adapter.fetchRoster(nrpsUrl, accessToken);
  }

  /**
   * Moodle NRPS often reports stale LTI roles (e.g. Instructor after demotion to student).
   * Prefer Moodle WS enrollment roles when available so roster sync can reactivate correctly.
   */
  async enrichRosterRolesFromWs(
    config: LmsSchoolConfig,
    nrpsUrl: string,
    roster: LmsRosterResponse,
  ): Promise<LmsRosterResponse> {
    if (config.lmsType !== LmsType.MOODLE) {
      return roster;
    }

    const courseId = extractCourseIdFromNrpsUrl(nrpsUrl);
    const credentials = resolveMoodleWsCredentials(
      config,
      this.configService.get<string>('MOODLE_URL', ''),
      this.configService.get<string>('MOODLE_WS_TOKEN', ''),
    );

    if (!courseId || !credentials) {
      return roster;
    }

    return this.getMoodleAdapter().enrichRosterRolesFromWs(credentials, courseId, roster);
  }

  /** Fetch roster with Moodle WS fallback if NRPS fails. */
  async fetchRosterWithWsFallback(
    config: LmsSchoolConfig,
    nrpsUrl: string,
  ): Promise<LmsRosterResponse> {
    try {
      const roster = await this.fetchRoster(config, nrpsUrl);
      return this.enrichRosterRolesFromWs(config, nrpsUrl, roster);
    } catch (nrpsError) {
      if (config.lmsType !== LmsType.MOODLE) {
        throw nrpsError;
      }

      const courseId = extractCourseIdFromNrpsUrl(nrpsUrl);
      const credentials = resolveMoodleWsCredentials(
        config,
        this.configService.get<string>('MOODLE_URL', ''),
        this.configService.get<string>('MOODLE_WS_TOKEN', ''),
      );

      if (!courseId || !credentials) {
        const missing: string[] = [];
        if (!courseId) missing.push('course_id_from_nrps_url');
        if (!credentials) missing.push('lms_base_url_or_api_token');
        throw new Error(
          `NRPS token flow failed (${(nrpsError as Error).message}) and Moodle WS fallback is unavailable (missing: ${missing.join(', ')}). Configure school lmsBaseUrl/lmsApiToken or backend MOODLE_URL/MOODLE_WS_TOKEN.`,
        );
      }

      this.logger.warn(
        `[LMS Roster] NRPS failed; falling back to Moodle WS for course ${courseId}: ${(nrpsError as Error).message}`,
      );

      return this.getMoodleAdapter().fetchRosterFromWs(credentials, courseId);
    }
  }

  private getMoodleAdapter(): MoodleAdapter {
    return this.lmsAdapterFactory.getAdapter(LmsType.MOODLE) as MoodleAdapter;
  }
}
