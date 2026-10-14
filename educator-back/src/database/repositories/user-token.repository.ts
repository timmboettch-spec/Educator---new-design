import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { UserToken } from 'src/database/entities';
import { UserTokenPurpose } from 'src/common/constants';
import { UpsertActiveUserTokenData } from 'src/common/interfaces';

@Injectable()
export class UserTokenRepository {
  constructor(
    @InjectRepository(UserToken)
    private readonly repo: Repository<UserToken>,
  ) { }

  async create(data: DeepPartial<UserToken>): Promise<UserToken> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<UserToken> = {}): Promise<UserToken[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<UserToken>): Promise<UserToken | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<UserToken> = {}): Promise<[UserToken[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<UserToken> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<UserToken>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(userTokenId: string): Promise<UserToken | null> {
    return this.repo.findOne({ where: { userTokenId } });
  }

  /** The current live token for a purpose+user — a row existing at all means it's still live. */
  async findActiveByPurposeAndUserId(
    purpose: UserTokenPurpose,
    userId: string,
  ): Promise<UserToken | null> {
    return this.repo.findOne({ where: { purpose, userId } });
  }

  async updateById(userTokenId: string, data: DeepPartial<UserToken>): Promise<UserToken | null> {
    await this.repo.update({ userTokenId }, data);
    return this.findById(userTokenId);
  }

  async update(where: FindOptionsWhere<UserToken>, data: DeepPartial<UserToken>): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(userTokenId: string): Promise<void> {
    await this.repo.delete({ userTokenId });
  }

  async softDelete(userTokenId: string): Promise<void> {
    await this.repo.softDelete({ userTokenId });
  }

  /**
   * Creates the live token/OTP for a purpose+user, or refreshes it in place if one is already
   * active — keeps the "at most one live token per purpose+user" invariant (the migration's
   * partial unique index) without callers needing to check-then-create themselves.
   */
  async upsertActive(data: UpsertActiveUserTokenData): Promise<UserToken> {
    const existing = await this.findActiveByPurposeAndUserId(data.purpose, data.userId);
    if (existing) {
      const updated = await this.updateById(existing.userTokenId, {
        token: data.token,
        expiresAt: data.expiresAt,
      });
      return updated ?? existing;
    }
    return this.create(data);
  }
}
