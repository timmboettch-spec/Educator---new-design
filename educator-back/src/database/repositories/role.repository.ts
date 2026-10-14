import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Role } from 'src/database/entities';

@Injectable()
export class RoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
  ) { }

  async findOne(options: FindOneOptions<Role>): Promise<Role | null> {
    return this.repo.findOne(options);
  }

  /** Lookup by the v2 business identifier (slug) — e.g. district admin/educator/student signup. */
  async findBySlug(slug: string): Promise<Role | null> {
    return this.repo.findOne({ where: { slug } });
  }
}
