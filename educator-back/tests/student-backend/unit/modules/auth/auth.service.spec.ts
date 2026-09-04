import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AuthService } from '@/modules/auth/auth.service';
import { JsonDataService } from '@/data/json-data.service';
import { RedisService } from 'src/redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

type JwtPayload = {
  userId: string;
};

describe('AuthService', () => {
  let service: AuthService;

  const mockJsonDataService = {
    getUserByEmail: jest.fn(),
    getUserById: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn((payload: JwtPayload) => `token-${payload.userId}`),
    verify: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JsonDataService,
          useValue: mockJsonDataService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully with valid credentials and map role', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        password: '1234',
        name: 'Test User',
        role: 'student',
      };

      mockJsonDataService.getUserByEmail.mockReturnValue(mockUser);

      const result = await service.login({
        email: 'test@test.com',
        password: '1234',
      });

      expect(result.access_token).toBe('token-u1');
      expect(result.user).toEqual({
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'STUDENT',
      });
      expect(mockRedisService.set).toHaveBeenCalledWith('user:u1', 'token-u1');
    });

    it('should map instructor role to EDUCATOR', async () => {
      const mockUser = {
        id: 'u2',
        email: 'inst@test.com',
        password: '1234',
        name: 'Instructor',
        role: 'instructor',
      };

      mockJsonDataService.getUserByEmail.mockReturnValue(mockUser);

      const result = await service.login({
        email: 'inst@test.com',
        password: '1234',
      });

      expect(result.user.role).toBe('EDUCATOR');
    });

    it('should map admin role to ADMIN', async () => {
      const mockUser = {
        id: 'u3',
        email: 'admin@test.com',
        password: '1234',
        name: 'Admin',
        role: 'admin',
      };

      mockJsonDataService.getUserByEmail.mockReturnValue(mockUser);

      const result = await service.login({
        email: 'admin@test.com',
        password: '1234',
      });

      expect(result.user.role).toBe('ADMIN');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockJsonDataService.getUserByEmail.mockReturnValue(null);

      await expect(service.login({ email: 'notfound@test.com', password: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        password: 'correct',
        name: 'Test',
        role: 'student',
      };

      mockJsonDataService.getUserByEmail.mockReturnValue(mockUser);

      await expect(service.login({ email: 'test@test.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user with mapped role', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'student',
      };

      mockJsonDataService.getUserById.mockReturnValue(mockUser);
      mockJwtService.verify.mockReturnValue({ userId: 'u1' });
      mockRedisService.get.mockResolvedValue('token-u1');

      const result = await service.validateToken('token-u1');

      expect(result).toEqual({
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'STUDENT',
      });
    });

    it('should map instructor role correctly in validateToken', async () => {
      const mockUser = {
        id: 'u2',
        email: 'inst@test.com',
        name: 'Instructor',
        role: 'instructor',
      };

      mockJsonDataService.getUserById.mockReturnValue(mockUser);
      mockJwtService.verify.mockReturnValue({ userId: 'u2' });
      mockRedisService.get.mockResolvedValue('token-u2');

      const result = await service.validateToken('token-u2');

      expect(result.role).toBe('EDUCATOR');
    });

    it('should throw UnauthorizedException when token user not found', async () => {
      mockJsonDataService.getUserById.mockReturnValue(null);
      mockJwtService.verify.mockReturnValue({ userId: 'u999' });
      mockRedisService.get.mockResolvedValue('token-u999');

      await expect(service.validateToken('token-u999')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is not active in Redis', async () => {
      mockJwtService.verify.mockReturnValue({ userId: 'u1' });
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.validateToken('token-u1')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when Redis stores a different token', async () => {
      mockJwtService.verify.mockReturnValue({ userId: 'u1' });
      mockRedisService.get.mockResolvedValue('different-token');

      await expect(service.validateToken('token-u1')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await expect(service.validateToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should delete the stored token for the user', async () => {
      await service.logout('u1');

      expect(mockRedisService.del).toHaveBeenCalledWith('user:u1');
    });
  });
});
