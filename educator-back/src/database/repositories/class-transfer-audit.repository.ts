import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { ClassTransferAudit, ClassTransferStatus } from 'src/database/entities';
import { IClassTransferFailureRecord } from 'src/common/interfaces';

@Injectable()
export class ClassTransferAuditRepository {
  constructor(
    @InjectRepository(ClassTransferAudit)
    private readonly repo: Repository<ClassTransferAudit>,
  ) {}

  async find(options: FindManyOptions<ClassTransferAudit> = {}): Promise<ClassTransferAudit[]> {
    return this.repo.find(options);
  }

  /** Writes one `FAILED` audit row per class a bulk transfer did not move, in a single insert. */
  async recordFailures(records: IClassTransferFailureRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.repo.insert(
      records.map((record) => ({
        classId: record.classId,
        className: record.className,
        sourceEducatorId: record.sourceEducatorId,
        sourceEducatorName: record.sourceEducatorName,
        targetEducatorId: record.targetEducatorId,
        targetEducatorName: record.targetEducatorName,
        adminId: record.adminId,
        adminEmail: record.adminEmail,
        status: ClassTransferStatus.FAILED,
        notes: record.reason,
        batchId: record.batchId,
      })),
    );
  }
}
