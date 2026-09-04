import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSessionService } from './educator-session.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Educator])],
  providers: [EducatorSessionService],
  exports: [EducatorSessionService],
})
export class SessionModule {}
