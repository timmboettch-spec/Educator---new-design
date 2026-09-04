import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from '../class/entity/class.entity';
import { Educator } from '../educators/entity/educator.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { EducatorSimulation } from '../educator-simulations/entity/educator-simulation.entity';
import { Student } from '../students/entity/students.entity';
import { ClassTransferAudit } from './entity/class-transfer-audit.entity';
import { ClassTransferService } from './class-transfer.service';
import { ClassTransferController } from './class-transfer.controller';
import { JwtStrategy } from '../common/strategy/jwt.strategy';
import { TokenBlacklistService } from '../common/strategy/jwt.blacklist.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassTransferAudit,
      Class,
      Educator,
      Student,
      ClassSimulation,
      EducatorSimulation,
    ]),
  ],
  providers: [ClassTransferService, JwtStrategy, TokenBlacklistService],
  controllers: [ClassTransferController],
  exports: [ClassTransferService],
})
export class ClassTransferModule {}
