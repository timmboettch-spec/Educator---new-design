import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { DistrictAdmin } from 'src/database/entities';

@Injectable()
export class DistrictAdminRepository {
  constructor(
    @InjectRepository(DistrictAdmin)
    private readonly repo: Repository<DistrictAdmin>,
  ) { }

  async create(data: DeepPartial<DistrictAdmin>): Promise<DistrictAdmin> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<DistrictAdmin> = {}): Promise<DistrictAdmin[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<DistrictAdmin>): Promise<DistrictAdmin | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(
    options: FindManyOptions<DistrictAdmin> = {},
  ): Promise<[DistrictAdmin[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<DistrictAdmin> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<DistrictAdmin>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findByUserRoleId(userRoleId: string): Promise<DistrictAdmin | null> {
    return this.repo.findOne({ where: { userRoleId } });
  }

  async updateByUserRoleId(
    userRoleId: string,
    data: DeepPartial<DistrictAdmin>,
  ): Promise<DistrictAdmin | null> {
    await this.repo.update({ userRoleId }, data);
    return this.findByUserRoleId(userRoleId);
  }

  /**
   * Lookup by this table's own primary key — the value `Educator.districtAdminId` holds.
   * `findByUserRoleId` above keys off the `user_role_id` FK instead, for the callers that only
   * ever have a `UserRole`'s id in hand; the two are not interchangeable.
   */
  async findById(districtAdminId: string): Promise<DistrictAdmin | null> {
    return this.repo.findOne({ where: { districtAdminId } });
  }

  /** Update by primary key — see `findById` for why this is distinct from `updateByUserRoleId`. */
  async updateById(
    districtAdminId: string,
    data: DeepPartial<DistrictAdmin>,
  ): Promise<DistrictAdmin | null> {
    await this.repo.update({ districtAdminId }, data);
    return this.findById(districtAdminId);
  }

  async delete(userRoleId: string): Promise<void> {
    await this.repo.delete({ userRoleId });
  }
}
