import { ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerLimitDetail,
  ThrottlerStorage,
  getOptionsToken,
} from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';
import { Request, Response } from 'express';
import { RATE_LIMIT } from '../constants/throttle.constants';
import { createHash } from 'crypto';
import { TokenService } from '../services/token.service';
import { LoggerService } from '../services';
import { extractAccessToken } from '../utils/token-extractor.util';
import { isLtiClassroomBurstPath } from '../utils/lti-rate-limit-path.util';

export const RATE_LIMIT_THROTTLER_NAME = 'rateLimit';

const MS_PER_SECOND = 1000;
const AUTH_RESOLVED_FLAG = '__rlAuthResolved';
const RATE_LIMIT_USER_KEY = '__rlUser';

interface RateLimitUser {
  userId: string;
  sub?: string;
  email?: string;
}

interface JwtVerifiedPayload {
  sub?: string;
  user_id?: string;
  email?: string;
  type?: string;
  roles?: string[];
}

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(ThrottlerStorage) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtLogger: LoggerService,
    @Optional() private readonly tokenService?: TokenService,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const request = requestProps.context.switchToHttp().getRequest<Request>();
    await this.ensureAuthResolved(request);

    if (requestProps.throttler.name !== RATE_LIMIT_THROTTLER_NAME) {
      return super.handleRequest(requestProps);
    }

    if (isLtiClassroomBurstPath(request.path ?? request.url)) {
      return super.handleRequest({
        ...requestProps,
        limit: RATE_LIMIT.LTI_LAUNCH.LIMIT,
        ttl: RATE_LIMIT.LTI_LAUNCH.TTL * MS_PER_SECOND,
      });
    }

    const user = this.getRateLimitUser(request);
    const bucket = user ? RATE_LIMIT.AUTHENTICATED : RATE_LIMIT.PUBLIC;
    return super.handleRequest({
      ...requestProps,
      limit: bucket.LIMIT,
      ttl: bucket.TTL * MS_PER_SECOND,
    });
  }

  protected generateKey(context: ExecutionContext, tracker: string, throttlerName: string): string {
    const request = context.switchToHttp().getRequest<Request>();
    const user = this.getRateLimitUser(request);

    // One shared per-IP bucket across login → callback → launch → session/exchange
    // so a classroom NAT does not get 4× the allowance by hopping routes.
    if (isLtiClassroomBurstPath(request.path ?? request.url)) {
      const ip = this.extractIp(request);
      return createHash('sha256').update(`${throttlerName}:lti-launch:${ip}`).digest('hex');
    }

    if (request.method === 'GET' && request.path === '/api/students/login') {
      const rawStudentId = request.query.student_id;
      const studentId = typeof rawStudentId === 'string' ? rawStudentId.trim() : '';

      if (studentId) {
        return this.generateStudentKey(throttlerName, 'login', studentId, request);
      }
    }

    if (request.method === 'GET' && request.path?.startsWith('/api/students/lookup/')) {
      const rawStudentCode = request.params?.studentCode;
      const studentCode = typeof rawStudentCode === 'string' ? rawStudentCode.trim() : '';

      if (studentCode) {
        return this.generateStudentKey(throttlerName, 'lookup', studentCode, request);
      }
    }

    if (request.method === 'POST' && request.path?.endsWith('/start-assessment')) {
      const rawStudentId = request.params?.studentId;
      const studentId = typeof rawStudentId === 'string' ? rawStudentId.trim() : '';

      if (studentId) {
        return this.generateStudentKey(throttlerName, 'start-assessment', studentId, request);
      }
    }

    if (user) {
      const id = user.userId ?? user.sub;

      if (id) {
        return createHash('sha256').update(`${throttlerName}:auth:${id}`).digest('hex');
      }
    }

    return super.generateKey(context, tracker, throttlerName);
  }

  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const retryAfterSeconds = Math.max(1, Math.ceil(throttlerLimitDetail.timeToExpire ?? 0));

    if (typeof response?.setHeader === 'function') {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }
    throw new ThrottlerException('Too many requests. Please try again later.');
  }

  private async ensureAuthResolved(request: Request): Promise<void> {
    const state = request as unknown as {
      [AUTH_RESOLVED_FLAG]?: boolean;
      [RATE_LIMIT_USER_KEY]?: RateLimitUser;
    };

    if (state[AUTH_RESOLVED_FLAG]) {
      return;
    }

    state[AUTH_RESOLVED_FLAG] = true;

    if (!this.tokenService) {
      return;
    }

    const token = extractAccessToken(request);

    if (!token) {
      return;
    }

    try {
      const payload = await this.tokenService.verifyToken<JwtVerifiedPayload>(token);
      const userId = payload.user_id ?? payload.sub;

      if (!userId) {
        return;
      }

      state[RATE_LIMIT_USER_KEY] = {
        userId,
        sub: payload.sub,
        email: payload.email,
      };
    } catch (err) {
      this.jwtLogger.debug?.(`JWT verification failed for rate-limit: ${(err as Error).message}`);
    }
  }

  private getRateLimitUser(request: Request): RateLimitUser | null {
    const state = request as unknown as {
      [RATE_LIMIT_USER_KEY]?: RateLimitUser;
    };
    const user = state[RATE_LIMIT_USER_KEY];
    if (!user || typeof user !== 'object') {
      return null;
    }
    return user;
  }

  private extractIp(request: Request): string {
    const xff = request.headers?.['x-forwarded-for'];
    const xffFirst = Array.isArray(xff)
      ? xff[0]
      : typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : undefined;

    return xffFirst || request.ip || request.socket?.remoteAddress || 'unknown';
  }

  private generateStudentKey(
    throttlerName: string,
    route: string,
    studentIdentifier: string,
    request: Request,
  ): string {
    const customTracker = `student:${route}:${this.extractIp(request)}:${studentIdentifier}`;
    return createHash('sha256').update(`${throttlerName}:${customTracker}`).digest('hex');
  }
}
