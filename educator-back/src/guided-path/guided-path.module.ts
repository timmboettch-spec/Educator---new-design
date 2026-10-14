import { Module } from '@nestjs/common';
import { GuidedPathController } from './guided-path.controller';
import { GuidedPathService } from './guided-path.service';

/**
 * `DatabaseModule` is `@Global()` (`src/database/database.module.ts`), so
 * `GUIDED_PATH_REPOSITORY` is already available app-wide — no explicit
 * import needed here.
 */
@Module({
  controllers: [GuidedPathController],
  providers: [GuidedPathService],
  exports: [GuidedPathService],
})
export class GuidedPathModule {}
