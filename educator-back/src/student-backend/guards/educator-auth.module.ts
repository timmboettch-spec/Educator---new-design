import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { EducatorJwtStrategy } from './educator-jwt.strategy';

/**
 * Registers the Educator-issued JWT verification strategy with the global
 * Passport singleton. Import once from `AppModule`; individual feature
 * modules can then reference {@link import('./scenario-auth.guard').ScenarioAuthGuard}
 * via `@UseGuards(ScenarioAuthGuard)` without additional wiring.
 */
@Module({
  imports: [PassportModule],
  providers: [EducatorJwtStrategy],
  exports: [EducatorJwtStrategy, PassportModule],
})
export class EducatorAuthModule {}
