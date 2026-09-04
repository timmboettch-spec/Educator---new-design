import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ResetTokenPayload } from './jwt.strategy.entity';

@Injectable()
export class ResetStrategy extends PassportStrategy(Strategy, 'reset') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('verified_token'),
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
      ignoreExpiration: false,
    });
  }

  validate(payload: ResetTokenPayload): ResetTokenPayload {
    if (payload.purpose !== 'reset_password') {
      throw new UnauthorizedException('Invalid token purpose');
    }
    if (!payload.email) {
      throw new UnauthorizedException('Invalid reset token');
    }
    return payload;
  }
}
