/**
 * @ServiceAuth() — the avatar build pipeline's way past the guards.
 *
 * The pipeline runs on a GitHub runner with no session (the session is an
 * httpOnly cookie issued to a browser), so every @RequiredRoles route is shut
 * to it. This decorator opens POST and PATCH on the avatar catalog to a caller
 * holding the service key, and nothing else.
 *
 * The properties that matter are security properties, so they are tested
 * directly rather than inferred from the route working.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AuthGuard } from '../../../src/common/guards/auth.guard';
import { SERVICE_AUTH_KEY } from '../../../src/common/decorators/service-auth.decorator';

const KEY = 'a'.repeat(40);

function makeContext(headers: Record<string, unknown> = {}): ExecutionContext {
  const req = { headers, cookies: {}, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class { },
  } as unknown as ExecutionContext;
}

/** Reflector that reports only SERVICE_AUTH_KEY, so the route is @ServiceAuth(). */
const serviceRouteReflector = {
  getAllAndOverride: (key: string) => key === SERVICE_AUTH_KEY,
} as never;

/** Reflector that reports nothing — an ordinary role-gated route. */
const plainRouteReflector = {
  getAllAndOverride: () => undefined,
} as never;

const authService = {
  validateUserToken: jest.fn(),
};
const logger = { warn: jest.fn() };
const cls = { isActive: jest.fn().mockReturnValue(false), set: jest.fn() };

function guardFor(reflector: never): AuthGuard {
  // No token is ever presented, so a caller that fails the service-key check
  // falls through to the JWT path and is refused there with a 401.
  const authService = { validateUserToken: jest.fn() } as never;
  const clsService = { isActive: () => false, set: jest.fn() } as never;
  return new AuthGuard(reflector, authService, clsService, logger);
}

describe('@ServiceAuth() — AuthGuard', () => {
  const original = process.env.AVATAR_SERVICE_KEY;
  afterEach(() => {
    process.env.AVATAR_SERVICE_KEY = original;
    jest.restoreAllMocks();
  });

  it('lets a correct key through on a @ServiceAuth route', async () => {
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': KEY })),
    ).resolves.toBe(true);
  });

  it('REFUSES the same key on a route that is not marked', async () => {
    // The decorator is the opt-in. A key holder must not be able to call
    // anything else on the controller just by presenting it.
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(plainRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': KEY })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a wrong key of the same length', async () => {
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': 'b'.repeat(40) })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a key that is a prefix of the real one', async () => {
    // timingSafeEqual throws on a length mismatch; the length check must come
    // first or this is a 500 rather than a 401.
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': 'a'.repeat(39) })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses when no key is presented', async () => {
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses EVERYTHING when no key is configured', async () => {
    // The failure that matters: an unset secret must shut the door, never open
    // it. An empty expected value compared against an empty header must not
    // read as a match.
    delete process.env.AVATAR_SERVICE_KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': '' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': KEY })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses a constant-time comparison, not ===', () => {
    /* A behavioural test cannot catch this: `===` and timingSafeEqual return
     * the same answers, and only differ in HOW LONG they take. Timing that
     * reliably in a unit test is flaky by nature.
     *
     * So this asserts on the source instead. Crude, but it is the only thing
     * that fails when someone "simplifies" the comparison -- verified: swapping
     * in `presented !== expected` passes every other test in this file.
     *
     * Why it matters: `===` on strings short-circuits at the first differing
     * byte, so response time leaks how much of the key an attacker has right.
     * That turns a 40-character secret into 40 sequential guesses.
     */
    const source = readFileSync(
      join(__dirname, '../../../src/common/guards/auth.guard.ts'),
      'utf8',
    );
    expect(source).toContain('timingSafeEqual');
    expect(source).not.toMatch(/presented\s*===\s*expected/);
    expect(source).not.toMatch(/presented\s*!==\s*expected/);
  });

  it('takes the first value when the header is repeated', async () => {
    process.env.AVATAR_SERVICE_KEY = KEY;
    const guard = guardFor(serviceRouteReflector);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': [KEY, 'junk'] })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(makeContext({ 'x-service-key': ['junk', KEY] })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
