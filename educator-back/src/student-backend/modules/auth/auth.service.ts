import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JsonDataService } from '../../data/json-data.service';

import { type LoginDto } from './dto/login.dto';
import { RedisService } from 'src/redis/redis.service';

/** Error message returned for both bad email and bad password (avoids user enumeration). */
const INVALID_CREDENTIALS_MSG = 'Invalid Credentials';
/** Maps stored role strings to the canonical frontend role enum values. */
const ROLE_MAP: Record<string, 'STUDENT' | 'EDUCATOR' | 'ADMIN'> = {
  student: 'STUDENT',
  instructor: 'EDUCATOR',
  admin: 'ADMIN',
};

interface JwtPayload {
  userId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jsonDataService: JsonDataService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = this.jsonDataService.getUserByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    if (user.password !== loginDto.password) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    const mappedRole = ROLE_MAP[user.role] || 'STUDENT';

    // Scope guard: when the caller requested an admin-scoped login, only
    // ADMIN accounts may proceed. Reject non-admins *before* issuing a token
    // so the network response itself is 403 (no session is created).
    if (loginDto.scope === 'admin' && mappedRole !== 'ADMIN') {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    const payload: JwtPayload = {
      userId: user.id,
    };
    const access_token = this.jwtService.sign(payload);

    // Store token in Redis
    await this.redisService.set(`user:${user.id}`, access_token);

    this.logger.log(`User ${user.id} logged in`);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: mappedRole,
      },
    };
  }

  async logout(userId: string): Promise<void> {
    this.logger.log(`User ${userId} logged out`);

    // Remove user token
    await this.redisService.del(`user:${userId}`);
  }

  getMe(userId: string) {
    const user = this.jsonDataService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: ROLE_MAP[user.role] || 'STUDENT',
    };
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const userId = payload.userId;

      if (!userId) {
        throw new UnauthorizedException();
      }

      const activeToken = await this.redisService.get(`user:${userId}`);

      if (!activeToken || activeToken !== token) {
        throw new UnauthorizedException();
      }

      const user = this.jsonDataService.getUserById(userId);
      if (!user) {
        throw new UnauthorizedException();
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: ROLE_MAP[user.role] || 'STUDENT',
      };
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
