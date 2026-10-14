import { isLtiClassroomBurstPath } from '../../../src/common/utils/lti-rate-limit-path.util';
import { RATE_LIMIT } from '../../../src/common/constants/throttle.constants';
import { AuthThrottlerGuard } from '../../../src/common/guards/auth-throttler.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { LoggerService, TokenService } from '../../../src/common/services';

describe('isLtiClassroomBurstPath', () => {
  it.each([
    '/api/lti/login',
    '/api/lti/studentlogin',
    '/api/lti/callback',
    '/api/lti/studentcallback',
    '/api/lti/launch',
    '/api/lti/studentlaunch',
    '/api/lti/session/exchange',
    '/lti/login',
    '/api/lti/launch/',
    '/api/lti/login?iss=https://canvas.example',
  ])('matches classroom burst path %s', (path) => {
    expect(isLtiClassroomBurstPath(path)).toBe(true);
  });

  it.each([
    '/api/lti/jwks',
    '/api/lti/metadata',
    '/api/lti/deep-linking/exchange',
    '/api/lti/deep-linking/submit',
    '/api/auth/login',
    '/api/students/login',
    '',
    undefined,
    null,
  ])('does not match non-burst path %s', (path) => {
    expect(isLtiClassroomBurstPath(path as string | null | undefined)).toBe(false);
  });
});

describe('RATE_LIMIT.LTI_LAUNCH', () => {
  it('defines a higher limit than PUBLIC for classroom bursts', () => {
    expect(RATE_LIMIT.LTI_LAUNCH.LIMIT).toBeGreaterThan(RATE_LIMIT.PUBLIC.LIMIT);
    expect(RATE_LIMIT.LTI_LAUNCH.TTL).toBeGreaterThan(0);
  });
});

describe('AuthThrottlerGuard — LTI classroom burst bucket', () => {
  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  const buildContext = (path: string, ip = '203.0.113.10'): ExecutionContext => {
    const request = {
      ip,
      method: 'POST',
      path,
      url: path,
      originalUrl: path,
      headers: { 'user-agent': 'jest' },
      socket: { remoteAddress: ip },
    };

    return {
      getClass: jest.fn(() => class TestController {}),
      getHandler: jest.fn(() => jest.fn()),
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => request),
        getResponse: jest.fn(() => ({ setHeader: jest.fn() })),
        getNext: jest.fn(() => undefined),
      })),
      getArgs: jest.fn(() => [request]),
      getArgByIndex: jest.fn(),
      getType: jest.fn(() => 'http'),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as unknown as ExecutionContext;
  };

  const buildGuard = (): AuthThrottlerGuard => {
    const options: ThrottlerModuleOptions = { throttlers: [{ ttl: 1000, limit: 1 }] };
    const storage = { increment: jest.fn() } as unknown as ThrottlerStorage;
    return new AuthThrottlerGuard(
      options,
      storage,
      new Reflector(),
      mockLogger,
      { verifyToken: jest.fn() } as unknown as TokenService,
    );
  };

  const generateKey = (guard: AuthThrottlerGuard, ctx: ExecutionContext): string =>
    (
      guard as unknown as {
        generateKey: (c: ExecutionContext, tracker: string, name: string) => string;
      }
    ).generateKey(ctx, 'tracker', 'rateLimit');

  it('shares one rate-limit key across LTI burst routes for the same IP', () => {
    const guard = buildGuard();
    const loginKey = generateKey(guard, buildContext('/api/lti/login'));
    const launchKey = generateKey(guard, buildContext('/api/lti/studentlaunch'));
    const exchangeKey = generateKey(guard, buildContext('/api/lti/session/exchange'));

    expect(loginKey).toBe(launchKey);
    expect(launchKey).toBe(exchangeKey);
  });

  it('uses different keys for different IPs on LTI burst routes', () => {
    const guard = buildGuard();
    const a = generateKey(guard, buildContext('/api/lti/launch', '203.0.113.1'));
    const b = generateKey(guard, buildContext('/api/lti/launch', '203.0.113.2'));
    expect(a).not.toEqual(b);
  });

  it('does not share the LTI burst key with unrelated public routes', () => {
    const guard = buildGuard();
    const ltiKey = generateKey(guard, buildContext('/api/lti/login'));
    const authKey = generateKey(guard, buildContext('/api/auth/login'));
    expect(ltiKey).not.toEqual(authKey);
  });
});
