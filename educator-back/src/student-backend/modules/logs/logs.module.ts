import { Module } from '@nestjs/common';

import { ScenariosModule } from '../scenarios/scenarios.module';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [ScenariosModule],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
