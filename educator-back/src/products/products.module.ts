import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entity/product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { User } from '../users/entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, User])],
  controllers: [ProductsController],
  providers: [ProductsService, JwtStrategy, TokenBlacklistService],
  exports: [ProductsService],
})
export class ProductsModule {}
