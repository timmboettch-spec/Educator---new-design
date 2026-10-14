import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { Avatar } from 'src/database/entities';
import { PaginationConstants } from 'src/common/constants';
import { PaginatedAvatarsParams, PaginatedAvatarsResult } from 'src/common/interfaces';

@Injectable()
export class AvatarRepository {
  constructor(
    @InjectRepository(Avatar)
    private readonly repo: Repository<Avatar>,
  ) { }

  async create(data: DeepPartial<Avatar>): Promise<Avatar> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: Avatar): Promise<Avatar> {
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Avatar> = {}): Promise<Avatar[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Avatar>): Promise<Avatar | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<Avatar> = {}): Promise<[Avatar[], number]> {
    return this.repo.findAndCount(options);
  }

  async exists(where: FindOptionsWhere<Avatar>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  /** By the business id (`avatar-10`), not the uuid primary key. */
  async findByAvatarId(avatarId: string): Promise<Avatar | null> {
    return this.repo.findOne({ where: { avatarId } });
  }

  async findAndCountPaginated(params: PaginatedAvatarsParams): Promise<PaginatedAvatarsResult> {
    const page = params.page ?? PaginationConstants.DEFAULT_PAGE;
    const pageSize = params.pageSize ?? PaginationConstants.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.repo.findAndCount({
      where: params.status ? { status: params.status } : {},
      order: { avatarId: 'ASC' },
      skip,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  /**
   * Soft-delete by the business id, mirroring UnitRepository.softDelete.
   *
   * Never a hard delete: `simulations.avatarId` references `avatars.avatar_id`
   * with ON DELETE RESTRICT, and a scenario that outlives its avatar should
   * fail loudly at assignment rather than lose the link silently.
   */
  async softDeleteByAvatarId(avatarId: string): Promise<void> {
    await this.repo.softDelete({ avatarId });
  }

  merge(target: Avatar, ...sources: DeepPartial<Avatar>[]): Avatar {
    return this.repo.merge(target, ...sources);
  }
}
