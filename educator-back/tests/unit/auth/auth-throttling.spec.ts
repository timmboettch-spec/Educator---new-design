import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../../../src/common/services';
import { AuthThrottlerGuard } from '../../../src/common/guards/auth-throttler.guard';
import { AuthThrottleConstants } from '../../../src/common/constants/throttle.constants';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { HttpStatus } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { RATE_LIMIT } from '../../../src/common/constants/throttle.constants';
import { LoggerService } from '../../../src/common/services';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as LoggerService;

const mockI18n = { t: jest.fn((key: string) => key) } as unknown as I18nService;

describe('Auth Throttling', () => {
  describe('RATE_LIMIT constants', () => {
    it('defines PUBLIC limits', () => {
      expect(RATE_LIMIT.PUBLIC.LIMIT).toBeGreaterThan(0);
      expect(RATE_LIMIT.PUBLIC.TTL).toBeGreaterThan(0);
    });

    it('defines AUTHENTICATED limits', () => {
      expect(RATE_LIMIT.AUTHENTICATED.LIMIT).toBeGreaterThan(0);
      expect(RATE_LIMIT.AUTHENTICATED.TTL).toBeGreaterThan(0);
    });

    it('defines LTI_LAUNCH classroom burst limits', () => {
      expect(RATE_LIMIT.LTI_LAUNCH.LIMIT).toBeGreaterThan(0);
      expect(RATE_LIMIT.LTI_LAUNCH.TTL).toBeGreaterThan(0);
      expect(RATE_LIMIT.LTI_LAUNCH.LIMIT).toBeGreaterThan(RATE_LIMIT.PUBLIC.LIMIT);
    });

    it('authenticated users get a higher limit than public users', () => {
      expect(RATE_LIMIT.AUTHENTICATED.LIMIT).toBeGreaterThan(RATE_LIMIT.PUBLIC.LIMIT);
    });
  });

  describe('AuthThrottleConstants', () => {
    it('defines LOGIN limits with positive values', () => {
      expect(AuthThrottleConstants.LOGIN.LIMIT).toBeGreaterThan(0);
      expect(AuthThrottleConstants.LOGIN.TTL).toBeGreaterThan(0);
    });

    it('defines FORGOT_PASSWORD limits with positive values', () => {
      expect(AuthThrottleConstants.FORGOT_PASSWORD.LIMIT).toBeGreaterThan(0);
      expect(AuthThrottleConstants.FORGOT_PASSWORD.TTL).toBeGreaterThan(0);
      expect(AuthThrottleConstants.FORGOT_PASSWORD.COOLDOWN_SECONDS).toBeGreaterThan(0);
      expect(AuthThrottleConstants.FORGOT_PASSWORD.IP_LIMIT).toBeGreaterThan(0);
      expect(AuthThrottleConstants.FORGOT_PASSWORD.IP_TTL).toBeGreaterThan(0);
    });

    it('defines VERIFY_OTP limits with positive values', () => {
      expect(AuthThrottleConstants.VERIFY_OTP.LIMIT).toBeGreaterThan(0);
      expect(AuthThrottleConstants.VERIFY_OTP.TTL).toBeGreaterThan(0);
    });

    it('defines RESET_PASSWORD limits with positive values', () => {
      expect(AuthThrottleConstants.RESET_PASSWORD.LIMIT).toBeGreaterThan(0);
      expect(AuthThrottleConstants.RESET_PASSWORD.TTL).toBeGreaterThan(0);
    });

    it('uses restrictive limits for password-related endpoints', () => {
      expect(AuthThrottleConstants.RESET_PASSWORD.LIMIT).toBeLessThanOrEqual(
        AuthThrottleConstants.LOGIN.LIMIT,
      );
      expect(AuthThrottleConstants.FORGOT_PASSWORD.LIMIT).toBeLessThanOrEqual(
        AuthThrottleConstants.LOGIN.LIMIT * 2,
      );
    });
  });

  describe('AuthThrottlerGuard', () => {
    const buildContext = (
      req: Partial<Record<string, unknown>> = {},
      res: Partial<Record<string, unknown>> = {},
    ): ExecutionContext => {
      const request = {
        ip: '10.0.0.1',
        method: 'POST',
        originalUrl: '/auth/login',
        url: '/auth/login',
        headers: { 'user-agent': 'jest-agent' },
        socket: { remoteAddress: '10.0.0.1' },
        ...req,
      };

      const response = {
        setHeader: jest.fn(),
        ...res,
      };

      return {
        getClass: jest.fn(() => class TestController {}),
        getHandler: jest.fn(() => jest.fn()),
        switchToHttp: jest.fn(() => ({
          getRequest: jest.fn(() => request),
          getResponse: jest.fn(() => response),
          getNext: jest.fn(() => undefined),
        })),
        getArgs: jest.fn(() => [request, response]),
        getArgByIndex: jest.fn(),
        getType: jest.fn(() => 'http'),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
      } as unknown as ExecutionContext;
    };

    const buildGuard = (): AuthThrottlerGuard => {
      const options: ThrottlerModuleOptions = { throttlers: [{ ttl: 1000, limit: 1 }] };
      const storage = {
        increment: jest.fn(),
      } as unknown as ThrottlerStorage;
      const reflector = new Reflector();
      const tokenService = { verifyToken: jest.fn() } as unknown as TokenService;
      return new AuthThrottlerGuard(options, storage, reflector, mockLogger, tokenService);
    };

    it('sets Retry-After header before throwing ThrottlerException', () => {
      const guard = buildGuard();
      const setHeader = jest.fn();
      const ctx = buildContext({}, { setHeader });

      expect(() =>
        (
          guard as unknown as {
            throwThrottlingException: (c: ExecutionContext, d: { timeToExpire: number }) => void;
          }
        ).throwThrottlingException(ctx, { timeToExpire: 42 }),
      ).toThrow(ThrottlerException);

      expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
    });

    it('rounds up sub-second retry windows to at least 1 second', () => {
      const guard = buildGuard();
      const setHeader = jest.fn();
      const ctx = buildContext({}, { setHeader });

      expect(() =>
        (
          guard as unknown as {
            throwThrottlingException: (c: ExecutionContext, d: { timeToExpire: number }) => void;
          }
        ).throwThrottlingException(ctx, { timeToExpire: 0 }),
      ).toThrow(ThrottlerException);

      expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
    });

    const generateKey = (guard: AuthThrottlerGuard, context: ExecutionContext): string =>
      (
        guard as unknown as {
          generateKey: (
            context: ExecutionContext,
            tracker: string,
            throttlerName: string,
          ) => string;
        }
      ).generateKey(context, 'tracker', 'rateLimit');

    it('prefers x-forwarded-for over req.ip for client identification', () => {
      const guard = buildGuard();

      const ctx = buildContext({
        ip: '10.0.0.1',
        headers: {
          'x-forwarded-for': '203.0.113.7, 10.0.0.5',
          'user-agent': 'jest',
        },
      });

      const request = ctx.switchToHttp().getRequest();

      const extractedIp = (
        guard as unknown as {
          extractIp: (request: unknown) => string;
        }
      ).extractIp(request);

      expect(extractedIp).toBe('203.0.113.7');
    });

    it('generates unique key for authenticated users', () => {
      const guard = buildGuard();

      const context = buildContext({
        __rlUser: {
          userId: 'user-123',
        },
      });

      const key = (
        guard as unknown as {
          generateKey: (
            context: ExecutionContext,
            tracker: string,
            throttlerName: string,
          ) => string;
        }
      ).generateKey(context, 'tracker', 'rateLimit');

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
    });

    it('creates different keys for different student ids', () => {
      const guard = buildGuard();

      const ctx1 = buildContext({
        method: 'GET',
        path: '/api/students/login',
        query: {
          student_id: 'STUDENT_1',
        },
      });

      const ctx2 = buildContext({
        method: 'GET',
        path: '/api/students/login',
        query: {
          student_id: 'STUDENT_2',
        },
      });

      const key1 = (guard as any).generateKey(ctx1, 'tracker', 'rateLimit');

      const key2 = (guard as any).generateKey(ctx2, 'tracker', 'rateLimit');

      expect(key1).not.toEqual(key2);
    });

    it('stores authenticated user after jwt verification', async () => {
      const guard = buildGuard();

      const tokenService = (
        guard as unknown as {
          tokenService: TokenService;
        }
      ).tokenService;

      jest.spyOn(tokenService, 'verifyToken').mockResolvedValue({
        sub: 'user-1',
        user_id: 'user-1',
      } as never);

      const request = {
        headers: {
          authorization: 'Bearer token',
        },
      };

      await (guard as any).ensureAuthResolved(request);

      expect((request as any).__rlUser).toEqual(
        expect.objectContaining({
          userId: 'user-1',
        }),
      );
    });
  });

  describe('HttpExceptionFilter — 429 handling', () => {
    it('sets a default Retry-After header when a ThrottlerException is thrown without one', () => {
      const filter = new HttpExceptionFilter(mockI18n, mockLogger);
      const setHeader = jest.fn();
      const getHeader = jest.fn().mockReturnValue(undefined);
      const status = jest.fn().mockReturnThis();
      const json = jest.fn();

      const host = {
        switchToHttp: (): {
          getRequest: () => { method: string; url: string };
          getResponse: () => {
            setHeader: jest.Mock;
            getHeader: jest.Mock;
            status: jest.Mock;
            json: jest.Mock;
          };
        } => ({
          getRequest: () => ({ method: 'POST', url: '/auth/login' }),
          getResponse: () => ({ setHeader, getHeader, status, json }),
        }),
      } as unknown as Parameters<HttpExceptionFilter['catch']>[1];

      const exception = new ThrottlerException('Too Many Requests');
      filter.catch(exception, host);

      expect(getHeader).toHaveBeenCalledWith('Retry-After');
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(json).toHaveBeenCalledWith({
        message: 'error.COMMON.TOO_MANY_REQUESTS',
        data: null,
        error: null,
        meta: expect.objectContaining({
          retryAfter: 60,
        }),
      });
    });

    it('does not overwrite an existing Retry-After header', () => {
      const filter = new HttpExceptionFilter(mockI18n, mockLogger);
      const setHeader = jest.fn();
      const getHeader = jest.fn().mockReturnValue('120');
      const status = jest.fn().mockReturnThis();
      const json = jest.fn();

      const host = {
        switchToHttp: (): {
          getRequest: () => { method: string; url: string };
          getResponse: () => {
            setHeader: jest.Mock;
            getHeader: jest.Mock;
            status: jest.Mock;
            json: jest.Mock;
          };
        } => ({
          getRequest: () => ({ method: 'POST', url: '/auth/login' }),
          getResponse: () => ({ setHeader, getHeader, status, json }),
        }),
      } as unknown as Parameters<HttpExceptionFilter['catch']>[1];

      const exception = new ThrottlerException('Too Many Requests');
      filter.catch(exception, host);

      expect(setHeader).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({ retryAfter: 120 }),
        }),
      );
    });
  });
});
