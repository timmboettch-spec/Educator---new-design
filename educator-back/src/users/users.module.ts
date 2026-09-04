import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entity/user.entity';
import { Redemption } from './entity/redemption.entity';
import { Role } from 'src/roles/entity/role.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { InvitesModule } from 'src/invites/invites.module';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { AzureBlobService } from 'src/config/azure-blob.config';
import { EducatorsModule } from 'src/educators/educators.module';
import { RedemptionsService } from './redemptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Redemption, Role, Educator]),
    forwardRef(() => InvitesModule),
    forwardRef(() => EducatorsModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    JwtStrategy,
    TokenBlacklistService,
    AzureBlobService,
    RedemptionsService,
  ],
  exports: [UsersService, RedemptionsService],
})
export class UsersModule {}
