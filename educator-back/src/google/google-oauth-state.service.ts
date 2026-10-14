import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { LoggerService } from 'src/common/services';
import { GoogleConstants } from './google.constants';

export type GoogleOAuthEducatorConnectState = {
  purpose: 'educator_connect';
  schoolId: string;
  educatorId: string;
};

export type GoogleOAuthStudentLoginState = {
  purpose: 'student_login';
  googleCourseId: string | null;
  simulationId: string | null;
};

export type GoogleOAuthStateRecord =
  | GoogleOAuthEducatorConnectState
  | GoogleOAuthStudentLoginState;

/** Legacy Redis payload before `purpose` existed (still valid until TTL expires). */
type LegacyEducatorOAuthState = {
  schoolId: string;
  educatorId: string;
  purpose?: undefined;
};

@Injectable()
export class GoogleOAuthStateService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  private key(state: string): string {
    return `${GoogleConstants.REDIS.STATE_KEY_PREFIX}${state}`;
  }

  async create(schoolId: string, educatorId: string): Promise<string> {
    const state = randomUUID();
    const record: GoogleOAuthEducatorConnectState = {
      purpose: 'educator_connect',
      schoolId,
      educatorId,
    };

    try {
      await this.redisService.setStrict(
        this.key(state),
        record,
        GoogleConstants.REDIS.STATE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(
        `[Google OAuth State] write failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new UnauthorizedException('Unable to start Google Classroom connect');
    }

    this.logger.debug(
      `[Google OAuth State] Created educator connect state for school ${schoolId}. State: ${state.substring(0, 8)}...`,
    );
    return state;
  }

  async createStudentLoginState(params: {
    googleCourseId?: string | null;
    simulationId?: string | null;
  }): Promise<string> {
    const state = randomUUID();
    const record: GoogleOAuthStudentLoginState = {
      purpose: 'student_login',
      googleCourseId: params.googleCourseId?.trim() || null,
      simulationId: params.simulationId?.trim() || null,
    };

    try {
      await this.redisService.setStrict(
        this.key(state),
        record,
        GoogleConstants.REDIS.STATE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(
        `[Google OAuth State] student login write failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      throw new UnauthorizedException(GoogleConstants.MESSAGES.STUDENT_OAUTH_START_FAILED);
    }

    this.logger.debug(
      `[Google OAuth State] Created student login state. State: ${state.substring(0, 8)}...`,
    );
    return state;
  }

  async validateAndConsume(state: string | undefined): Promise<GoogleOAuthStateRecord> {
    if (!state || typeof state !== 'string' || state.trim() === '') {
      this.logger.warn('[Google OAuth State] Missing or empty state parameter');
      throw new UnauthorizedException('Missing state parameter');
    }

    let raw: GoogleOAuthStateRecord | LegacyEducatorOAuthState | null;
    try {
      raw = await this.redisService.getDelStrict<
        GoogleOAuthStateRecord | LegacyEducatorOAuthState
      >(this.key(state));
    } catch (err) {
      this.logger.error(
        `[Google OAuth State] read failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new UnauthorizedException('Unable to validate Google Classroom connect state');
    }

    const record = this.normalizeRecord(raw);
    if (!record) {
      this.logger.warn(
        `[Google OAuth State] State not found: ${state.substring(0, 8)}... (expired, used, or forged)`,
      );
      throw new UnauthorizedException('Invalid or expired state parameter');
    }

    if (record.purpose === 'educator_connect') {
      this.logger.log(
        `[Google OAuth State] Consumed educator connect state for school ${record.schoolId}. State: ${state.substring(0, 8)}...`,
      );
    } else {
      this.logger.log(
        `[Google OAuth State] Consumed student login state. State: ${state.substring(0, 8)}...`,
      );
    }
    return record;
  }

  private normalizeRecord(
    raw: GoogleOAuthStateRecord | LegacyEducatorOAuthState | null,
  ): GoogleOAuthStateRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    if (raw.purpose === 'student_login') {
      return {
        purpose: 'student_login',
        googleCourseId:
          typeof raw.googleCourseId === 'string' && raw.googleCourseId.trim()
            ? raw.googleCourseId.trim()
            : null,
        simulationId:
          typeof raw.simulationId === 'string' && raw.simulationId.trim()
            ? raw.simulationId.trim()
            : null,
      };
    }

    if (raw.purpose === 'educator_connect') {
      if (!raw.schoolId || !raw.educatorId) {
        return null;
      }
      return {
        purpose: 'educator_connect',
        schoolId: raw.schoolId,
        educatorId: raw.educatorId,
      };
    }

    // Legacy educator connect payloads (no purpose field).
    if (raw.schoolId && raw.educatorId) {
      return {
        purpose: 'educator_connect',
        schoolId: raw.schoolId,
        educatorId: raw.educatorId,
      };
    }

    return null;
  }
}
