import { Module, forwardRef } from '@nestjs/common';

import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { MailModule } from 'src/mail/mail.module';

import { EducatorsModule } from 'src/educators/educators.module';
import { ClassSimulationsModule } from 'src/class-simulations/class-simulations.module';

@Module({
  // forwardRef: StudentsModule ↔ ClassSimulationsModule ↔ GoogleModule cycle
  imports: [MailModule, EducatorsModule, forwardRef(() => ClassSimulationsModule)],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService],
})
export class StudentsModule {}
