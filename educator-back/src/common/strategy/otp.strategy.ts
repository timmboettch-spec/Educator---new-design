import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { OtpTokenPayload } from './jwt.strategy.entity';

@Injectable()
export class OtpStrategy extends PassportStrategy(Strategy, 'otp') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('reset_token'),
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
      ignoreExpiration: false,
    });
  }

  validate(payload: OtpTokenPayload): OtpTokenPayload {
    if (payload.purpose !== 'otp_verify') {
      throw new UnauthorizedException('Invalid token purpose');
    }
    if (!payload.email || !payload.otp) {
      throw new UnauthorizedException('Invalid OTP token');
    }
    return payload;
  }
}
