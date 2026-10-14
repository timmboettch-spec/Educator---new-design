import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { GuidedPath } from 'src/database/entities';
import { RoleSlug } from 'src/common/constants';

@Injectable()
export class GuidedPathRepository {
  constructor(
    @InjectRepository(GuidedPath)
    private readonly repo: Repository<GuidedPath>,
  ) {}

  async create(data: DeepPartial<GuidedPath>): Promise<GuidedPath> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<GuidedPath> = {}): Promise<GuidedPath[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<GuidedPath>): Promise<GuidedPath | null> {
    return this.repo.findOne(options);
  }

  async findById(guidedPathId: string): Promise<GuidedPath | null> {
    return this.repo.findOne({ where: { guidedPathId } });
  }

  async findByUserAndRole(userId: string, roleType: RoleSlug): Promise<GuidedPath | null> {
    return this.repo.findOne({ where: { userId, roleType } });
  }

  async update(where: FindOptionsWhere<GuidedPath>, data: DeepPartial<GuidedPath>): Promise<void> {
    const existing = await this.repo.findOneBy(where);
    if (!existing) {
      return;
    }
    const merged = this.repo.merge(existing, data);
    await this.repo.save(merged);
  }

  /**
   * Upsert keyed on `(userId, roleType)` (unique index) — one row per role
   * assignment. Used by the write endpoint so it succeeds identically
   * whether or not a row already exists yet.
   */
  async upsertByUserAndRole(
    userId: string,
    roleType: RoleSlug,
    data: DeepPartial<GuidedPath>,
  ): Promise<GuidedPath> {
    const existing = await this.findByUserAndRole(userId, roleType);
    const entity = existing
      ? this.repo.merge(existing, data)
      : this.repo.create({ ...data, userId, roleType });
    return this.repo.save(entity);
  }

  /**
   * Read-path helper: lazily creates a default row (`state: {}`,
   * `completed: false`) for a role assignment on its very first fetch, so
   * callers never see a not-found response for an uninitialized guided path.
   */
  async findOrCreateByUserAndRole(userId: string, roleType: RoleSlug): Promise<GuidedPath> {
    const existing = await this.findByUserAndRole(userId, roleType);
    if (existing) {
      return existing;
    }
    return this.create({ userId, roleType, state: {}, completed: false });
  }
}
