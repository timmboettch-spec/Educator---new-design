import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InvitesModule } from '../invites/invites.module';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSchool } from '../educators/entity/educator-school.entity';
import { Schools } from '../schools/entity/schools.entity';
import { MailModule } from '../mail/mail.module';
import { CsrfModule } from '../csrf/csrf.module';
import { AzureBlobService } from 'src/config/azure-blob.config';

@Module({
  imports: [
    UsersModule,
    InvitesModule,
    ConfigModule,
    MailModule,
    CsrfModule,
    TypeOrmModule.forFeature([Educator, EducatorSchool, Schools]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '1d';

        if (!secret) {
          throw new Error('JWT_SECRET is not defined in .env!');
        }

        return {
          secret,
          signOptions: { expiresIn: expiresIn as '1d' },
        };
      },
    }),
  ],
  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, TokenBlacklistService, AzureBlobService,],
  exports: [AuthService],
})
export class AuthModule { }
