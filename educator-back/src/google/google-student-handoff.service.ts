import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { LoggerService } from 'src/common/services';
import { LtiConstants } from 'src/lti/lti.constants';
import type {
  EducatorLtiSessionPayload,
  StudentLtiSessionPayload,
} from 'src/lti/lti-session.types';

/**
 * Writes one-time handoff codes into the same Redis namespace as LTI
 * (`lti:session:*`) so Educator FE / HS Online can reuse `POST /lti/session/exchange`.
 *
 * Cookie / CSRF notes:
 * - This service intentionally does NOT call `setAuthCookies`. Auth cookies (and CSRF)
 *   are set by the caller before redirect (`studentLogin` / `authService.ltiLogin` with
 *   `res`), and again by `POST /api/lti/session/exchange` when the FE redeems the code.
 * - `/api/lti/session/exchange` is `@Public()` on `LtiController` and is CSRF-exempt
 *   in `CsrfGuard`, so the student app can POST the code without a CSRF cookie.
 *
 * Lives in GoogleModule (not LtiModule) to avoid a Nest circular import:
 * GoogleModule → LtiModule → ClassSimulationsModule → GoogleModule.
 */
@Injectable()
export class GoogleStudentHandoffService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async createStudentSessionCode(
    session: Omit<StudentLtiSessionPayload, 'audience'> & {
      audience?: 'student';
    },
  ): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const payload: StudentLtiSessionPayload = {
      ...session,
      audience: 'student',
    };

    await this.redisService.setStrict(
      `${LtiConstants.REDIS.SESSION_KEY_PREFIX}${code}`,
      payload,
      LtiConstants.REDIS.SESSION_TTL_SECONDS,
    );

    this.logger.log(
      `[Google Student Handoff] session created code=${code.substring(0, 8)}... student=${payload.studentCode}`,
    );
    return code;
  }

  async createEducatorSessionCode(
    session: Omit<EducatorLtiSessionPayload, 'audience'> & {
      audience?: 'educator';
    },
  ): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const payload: EducatorLtiSessionPayload = {
      ...session,
      audience: 'educator',
    };

    await this.redisService.setStrict(
      `${LtiConstants.REDIS.SESSION_KEY_PREFIX}${code}`,
      payload,
      LtiConstants.REDIS.SESSION_TTL_SECONDS,
    );

    this.logger.log(
      `[Google Educator Handoff] session created code=${code.substring(0, 8)}... educator=${payload.userId}`,
    );
    return code;
  }
}
