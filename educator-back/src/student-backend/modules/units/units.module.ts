import { Module } from '@nestjs/common';

import { EducatorAuthModule } from '../../guards/educator-auth.module';

import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [EducatorAuthModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
