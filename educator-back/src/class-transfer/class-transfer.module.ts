import { Module } from '@nestjs/common';

import { ClassTransferService } from './class-transfer.service';
import { ClassTransferController } from './class-transfer.controller';

@Module({
  providers: [ClassTransferService],
  controllers: [ClassTransferController],
  exports: [ClassTransferService],
})
export class ClassTransferModule {}
