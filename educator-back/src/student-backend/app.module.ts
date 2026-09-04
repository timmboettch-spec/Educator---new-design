import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AuthModule } from './modules/auth/auth.module';
import { EducatorAuthModule } from './guards/educator-auth.module';
import { UnitsModule } from './modules/units/units.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { LogsModule } from './modules/logs/logs.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from 'src/redis/redis.module';

const modules = [
  TelemetryModule,
  AuthModule,
  EducatorAuthModule,
  UnitsModule,
  ScenariosModule,
  ReportsModule,
  ConversationModule,
  AdminModule,
  UploadsModule,
  LogsModule,
  HealthModule,
  RedisModule,
];

export const StudentBackendRouter = RouterModule.register([
  {
    path: 'students-backend',
    children: modules,
  },
]);

@Module({
  imports: modules,
})
export class StudentBackend {}
