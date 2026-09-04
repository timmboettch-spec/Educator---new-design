import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { JwtPayload } from './jwt.strategy.entity';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './jwt.blacklist.strategy';
import { EducatorSessionService } from '../../session/educator-session.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private blacklistService: TokenBlacklistService,
    private educatorSessionService: EducatorSessionService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret as string,
      passReqToCallback: true,
    };

    super(options);
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<{
    userId: string;
    email: string;
    roles: string[];
    type: string;
    student_id?: string | null;
    student_name?: string | null;
  }> {
    this.logger.log(
      `[JWT Strategy] req.headers.authorization: ${req.headers.authorization || 'UNDEFINED'}`,
    );

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    this.logger.log(
      `[JWT Strategy] Extracted bearer token: ${token ? token.substring(0, 20) + '...' : 'UNDEFINED'}`,
    );

    if (!payload) {
      this.logger.error(
        '[JWT Strategy] JWT payload is null - JWT verification failed at Passport level',
      );
      throw new UnauthorizedException('Invalid token');
    }

    this.logger.log(
      `[JWT Strategy] JWT payload received: sub=${payload?.sub}, email=${payload?.email}, type=${payload?.type}, roles=${payload?.roles?.join(',') || 'none'}`,
    );

    if (token && this.blacklistService.has(token)) {
      this.logger.warn('[JWT Strategy] Token is in blacklist');
      throw new UnauthorizedException('Token is logged out');
    }

    const isStudentToken = payload?.type === 'student';
    if (!payload?.sub || (!isStudentToken && !payload?.email)) {
      this.logger.error(
        `[JWT Strategy] JWT validation failed - missing payload fields: sub=${payload?.sub}, email=${payload?.email}, type=${payload?.type}`,
      );
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.type === 'educator' && payload.iat !== undefined) {
      this.logger.log(
        `[JWT Strategy] Checking educator session invalidation: sub=${payload.sub}, iat=${payload.iat}`,
      );
      const invalidated = await this.educatorSessionService.isTokenInvalidated(
        payload.sub,
        payload.iat,
      );
      if (invalidated) {
        this.logger.warn(`[JWT Strategy] Educator session invalidated for sub=${payload.sub}`);
        throw new UnauthorizedException('Your session has been terminated. Please log in again.');
      }
      this.logger.log(`[JWT Strategy] Educator session valid: sub=${payload.sub}`);
    }

    const result = {
      userId: payload.user_id ?? payload.sub,
      email: payload.email,
      roles: payload.roles || [],
      type: payload.type,
      // Student-only claims. Undefined for admin/educator tokens.
      student_id: payload.student_id ?? null,
      student_name: payload.student_name ?? null,
    };

    this.logger.log(
      `[JWT Strategy] Validation successful - returning user: userId=${result.userId}, type=${result.type}`,
    );
    return result;
  }
}
