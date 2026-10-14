import { Global, Module } from '@nestjs/common';

import { EducatorSessionService } from './educator-session.service';

@Global()
@Module({
  providers: [EducatorSessionService],
  exports: [EducatorSessionService],
})
export class SessionModule {}
