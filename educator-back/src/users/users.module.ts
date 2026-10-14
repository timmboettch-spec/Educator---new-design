import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { InvitesModule } from 'src/invites/invites.module';
import { EducatorsModule } from 'src/educators/educators.module';
import { RedemptionsService } from './redemptions.service';

@Module({
  imports: [forwardRef(() => InvitesModule), forwardRef(() => EducatorsModule)],
  controllers: [UsersController],
  providers: [UsersService, RedemptionsService],
  exports: [UsersService, RedemptionsService],
})
export class UsersModule {}
