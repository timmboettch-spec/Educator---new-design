import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Student } from './entity/students.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { Simulation } from '../simulations/entity/simulation.entity';
import { SimulationReport } from '../simulation-reports/entity/simulation-report.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { MailModule } from 'src/mail/mail.module';

import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { EducatorsModule } from 'src/educators/educators.module';
import { ClassSimulationsModule } from 'src/class-simulations/class-simulations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, ClassSimulation, Simulation, SimulationReport]),
    MailModule,
    EducatorsModule,
    ClassSimulationsModule,
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
  providers: [StudentsService, JwtStrategy, TokenBlacklistService],
  controllers: [StudentsController],
  exports: [StudentsService],
})
export class StudentsModule {}
