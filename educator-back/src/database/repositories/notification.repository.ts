import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  QueryDeepPartialEntity,
  Repository,
  UpdateResult,
} from 'typeorm';
import { Notification, NotificationType, RecipientType } from 'src/database/entities';

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(data: DeepPartial<Notification>): Promise<Notification> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Notification> = {}): Promise<Notification[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Notification>): Promise<Notification | null> {
    return this.repo.findOne(options);
  }

  async count(options: FindManyOptions<Notification> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async updateMany(
    where: FindOptionsWhere<Notification> | FindOptionsWhere<Notification>[],
    data: QueryDeepPartialEntity<Notification>,
  ): Promise<UpdateResult> {
    return this.repo.update(where, data);
  }

  async existsStudentReportNotification(
    recipientId: string,
    recipientType: RecipientType,
    studentId: string,
    scenarioId: string,
  ): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('n')
      .where('n.recipient_id = :recipientId', { recipientId })
      .andWhere('n.recipient_type = :recipientType', { recipientType })
      .andWhere('n.type = :type', { type: NotificationType.STUDENT_REPORT_AVAILABLE })
      .andWhere("n.metadata ->> 'studentId' = :studentId", { studentId })
      .andWhere("n.metadata ->> 'scenarioId' = :scenarioId", { scenarioId })
      .getCount();
    return count > 0;
  }

  async save(entity: Notification): Promise<Notification> {
    return this.repo.save(entity);
  }

  async delete(
    where: FindOptionsWhere<Notification> | FindOptionsWhere<Notification>[],
  ): Promise<DeleteResult> {
    return this.repo.delete(where ?? {});
  }
}
