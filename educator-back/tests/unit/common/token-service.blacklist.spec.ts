import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../../src/common/services/token.service';
import { TokenBlacklistConstants } from '../../../src/common/constants';
import type { RedisService } from '../../../src/redis/redis.service';

const SECRET = 'blacklist-test-secret-key-32-chars!';

describe('TokenService — blackListToken / verifyToken', () => {
  let store: Map<string, unknown>;
  let redisService: { set: jest.Mock; get: jest.Mock };
  let jwtService: JwtService;
  let service: TokenService;

  beforeEach(() => {
    store = new Map();
    redisService = {
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    };
    jwtService = new JwtService({ secret: SECRET });
    const configService = {
      get: jest.fn((key: string) => (key === 'jwt.accessSecret' ? SECRET : undefined)),
    };
    service = new TokenService(
      jwtService,
      configService as never,
      redisService as unknown as RedisService,
    );
  });

  it('adds a jti to every generated access token', () => {
    const { access_token } = service.generateTokens({ sub: 'u-1' } as never, 60);
    const decoded = jwtService.decode<{ jti?: string }>(access_token);
    expect(typeof decoded.jti).toBe('string');
  });

  it('round-trips a blacklisted token by its jti', async () => {
    const { access_token } = service.generateTokens({ sub: 'u-1' } as never, 60);
    const { jti } = jwtService.decode<{ jti: string }>(access_token);

    await expect(service.verifyToken(access_token)).resolves.toMatchObject({ jti });
    await service.blackListToken(access_token);

    expect(redisService.set).toHaveBeenCalledWith(
      `${TokenBlacklistConstants.REDIS_KEY_PREFIX}${jti}`,
      true,
      expect.any(Number),
    );
    const ttl = (redisService.set.mock.calls[0] as [string, unknown, number])[2];
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    await expect(service.verifyToken(access_token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not affect other tokens', async () => {
    const first = service.generateTokens({ sub: 'u-1' } as never, 60).access_token;
    const second = service.generateTokens({ sub: 'u-1' } as never, 60).access_token;

    await service.blackListToken(first);

    await expect(service.verifyToken(second)).resolves.toMatchObject({ sub: 'u-1' });
    await expect(service.verifyToken(first)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignores a token without a jti', async () => {
    const token = jwtService.sign({ sub: 'u-1' }, { expiresIn: 60 });

    await service.blackListToken(token);

    expect(redisService.set).not.toHaveBeenCalled();
    await expect(service.verifyToken(token)).resolves.toMatchObject({ sub: 'u-1' });
  });

  it('ignores an undecodable token', async () => {
    await service.blackListToken('not-a-jwt');

    expect(redisService.set).not.toHaveBeenCalled();
    await expect(service.verifyToken('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
