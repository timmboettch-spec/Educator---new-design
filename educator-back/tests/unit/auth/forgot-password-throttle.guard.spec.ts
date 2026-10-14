import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ForgotPasswordThrottleGuard } from '../../../src/auth/guards/forgot-password-throttle.guard';
import { ForgotPasswordRateLimiterService } from '../../../src/auth/services/forgot-password-rate-limiter.service';
import { LoggerService } from '../../../src/common/services';

describe('ForgotPasswordThrottleGuard', () => {
  let guard: ForgotPasswordThrottleGuard;
  let mockRateLimiter: Partial<ForgotPasswordRateLimiterService>;
  let mockLogger: LoggerService;

  const buildContext = (
    req: Partial<Record<string, unknown>> = {},
    res: Partial<Record<string, unknown>> = {},
  ): ExecutionContext => {
    const request = {
      ip: '10.0.0.1',
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
      body: { email: 'student@example.com' },
      ...req,
    };

    const response = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      ...res,
    };

    return {
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => request),
        getResponse: jest.fn(() => response),
      })),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as LoggerService;

    mockRateLimiter = {
      consume: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
    };

    guard = new ForgotPasswordThrottleGuard(
      mockRateLimiter as ForgotPasswordRateLimiterService,
      mockLogger,
    );
  });

  it('allows request when rate limiter allows', async () => {
    const ctx = buildContext();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith('student@example.com', '10.0.0.1');
  });

  it('sets Retry-After header and throws HttpException(429) when rate limited', async () => {
    mockRateLimiter.consume = jest.fn().mockResolvedValue({
      allowed: false,
      reason: 'cooldown',
      retryAfter: 45,
      message: 'Please wait before requesting another password reset code.',
    });

    const setHeader = jest.fn();
    const ctx = buildContext({}, { setHeader });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '45');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Throttled forgot-password request'),
    );

    try {
      await guard.canActivate(ctx);
    } catch (err) {
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(httpErr.getResponse()).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Please wait before requesting another password reset code.',
          retryAfter: 45,
        }),
      );
    }
  });

  it('extracts IP from x-forwarded-for header prioritizing the first IP', async () => {
    const ctx = buildContext({
      headers: {
        'x-forwarded-for': '203.0.113.195, 198.51.100.1',
      },
    });

    await guard.canActivate(ctx);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith('student@example.com', '203.0.113.195');
  });

  it('handles missing email in body gracefully without throwing in guard', async () => {
    const ctx = buildContext({ body: {} });
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith(undefined, '10.0.0.1');
  });
});
