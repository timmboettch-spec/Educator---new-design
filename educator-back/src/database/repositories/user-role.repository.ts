import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { UserRole } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';

@Injectable()
export class UserRoleRepository {
  constructor(
    @InjectRepository(UserRole)
    private readonly repo: Repository<UserRole>,
  ) { }

  async create(data: DeepPartial<UserRole>): Promise<UserRole> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<UserRole> = {}): Promise<UserRole[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<UserRole>): Promise<UserRole | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<UserRole> = {}): Promise<[UserRole[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<UserRole> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<UserRole>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(userRoleId: string): Promise<UserRole | null> {
    return this.repo.findOne({ where: { userRoleId } });
  }

  /** Joins `role` plus the linked profile per role type (`districtAdmin`/`educator`) — used by
   * `JwtStrategyV2` to resolve `ICurrentUser.adminId`/`educatorId` from the matched active role. */
  async findByUserId(userId: string): Promise<UserRole[]> {
    return this.repo.find({
      where: { userId },
      relations: { role: true, districtAdmin: true, educator: true },
    });
  }

  async findByUserAndRoleSlug(userId: string, slug: string): Promise<UserRole | null> {
    return this.repo.findOne({ where: { userId, role: { slug } } });
  }

  async findByUserAndRole(userId: string, roleId: string): Promise<UserRole | null> {
    return this.repo.findOne({ where: { userId, roleId } });
  }

  /** Flips a specific user_roles link to ACTIVE — the invite-acceptance write. */
  async activate(userId: string, roleId: string): Promise<void> {
    await this.repo.update({ userId, roleId }, { status: CommonStatus.ACTIVE });
  }

  async updateStatus(userRoleId: string, status: CommonStatus): Promise<void> {
    await this.repo.update({ userRoleId }, { status });
  }

  async update(where: FindOptionsWhere<UserRole>, data: DeepPartial<UserRole>): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(userRoleId: string): Promise<void> {
    await this.repo.delete({ userRoleId });
  }
}
