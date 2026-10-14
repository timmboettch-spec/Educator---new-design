import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Educator } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassTransferTargetSortField } from 'src/common/constants';
import type {
  ITransferTargetListQuery,
  ITransferTargetRawRow,
  ITransferTargetRow,
  PaginatedRows,
} from 'src/common/interfaces';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';

@Injectable()
export class EducatorRepository {
  constructor(
    @InjectRepository(Educator)
    private readonly repo: Repository<Educator>,
  ) {}

  async create(data: DeepPartial<Educator>): Promise<Educator> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Educator> = {}): Promise<Educator[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Educator>): Promise<Educator | null> {
    return this.repo.findOne(options);
  }

  async count(options: FindManyOptions<Educator> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async update(id: string, data: DeepPartial<Educator>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }

  async upsertByEmail(
    values: DeepPartial<Educator>,
    updateColumns: string[],
  ): Promise<string | undefined> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(Educator)
      .values(values)
      .orUpdate(updateColumns, ['email'])
      .returning('id')
      .execute();
    const raw = result.raw as { id: string }[];
    return raw[0]?.id;
  }

  async findActiveIdsBySchool(schoolId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .innerJoin('educator_schools', 'es', 'es.educator_id = e.id')
      .where('es.school_id = :schoolId', { schoolId })
      .andWhere('e.is_active = true')
      .select('e.id', 'id')
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id).filter(Boolean);
  }

  /** Whether a non-deleted educator is linked to this `user_roles` row (soft-deleted rows don't count). */
  async existsByUserRoleId(userRoleId: string): Promise<boolean> {
    return this.repo.exists({ where: { userRoleId } });
  }

  /** Seat balance of an active educator, or `null` when there is no active educator with that id. */
  async findActiveTokenBalance(educatorId: string): Promise<number | null> {
    const educator = await this.repo.findOne({
      where: { id: educatorId, is_active: true },
      select: { id: true, tokens: true },
    });
    return educator ? Number(educator.tokens) || 0 : null;
  }

  /**
   * A non-deleted educator owned by the given district admin, with what a Class Transfer needs:
   * schools (for the class-school check) and `userRole.user` (for status and email). `null` when
   * the educator doesn't exist, is deleted, or belongs to another admin.
   */
  async findByIdForDistrictAdmin(
    educatorId: string,
    districtAdminId: string,
  ): Promise<Educator | null> {
    return this.repo.findOne({
      where: { id: educatorId, districtAdminId },
      relations: { school: true, schoolAssignments: { school: true }, userRole: { user: true } },
    });
  }

  /**
   * One page of the educators a Class Transfer can hand classes to: the admin's non-deleted
   * educators, minus the source, that are active by the same rule the bulk transfer applies
   * (`is_active` and an ACTIVE, non-deleted role row). `total` uses the same filters.
   */
  async findTransferTargetsForDistrictAdmin(
    districtAdminId: string,
    excludeEducatorId: string,
    query: ITransferTargetListQuery,
  ): Promise<PaginatedRows<ITransferTargetRow>> {
    const scope = (qb: SelectQueryBuilder<Educator>): SelectQueryBuilder<Educator> => {
      qb.innerJoin('user_roles', 'ur', 'ur.user_role_id = e.user_role_id AND ur.deleted_at IS NULL')
        .leftJoin('users', 'u', 'u.id = ur.user_id AND u.deleted_at IS NULL')
        .where('e.district_admin_id = :districtAdminId', { districtAdminId })
        .andWhere('e.deleted_at IS NULL')
        .andWhere('e.id <> :excludeEducatorId', { excludeEducatorId })
        .andWhere('e.is_active = true')
        .andWhere('ur.status = :activeStatus', { activeStatus: CommonStatus.ACTIVE });
      if (query.search) {
        // Escape `%`/`_` so a search for a literal percent or underscore isn't a wildcard.
        qb.andWhere('(e.full_name ILIKE :search OR u.email ILIKE :search)', {
          search: `%${escapeLikeWildcards(query.search)}%`,
        });
      }
      return qb;
    };

    const total = await scope(this.repo.createQueryBuilder('e')).getCount();

    const qb = scope(
      this.repo
        .createQueryBuilder('e')
        .select('e.id', 'id')
        .addSelect('e.full_name', 'full_name')
        .addSelect('u.email', 'email')
        // A count, not a list: the row stays the same size however many schools an educator has.
        // UNION counts a school that is both the legacy FK and an assignment once.
        .addSelect(
          `(SELECT COUNT(*) FROM (
              SELECT e.school_id AS school_id WHERE e.school_id IS NOT NULL
              UNION
              SELECT es.school_id FROM educator_schools es WHERE es.educator_id = e.id
            ) educator_school_ids)`,
          'schools_count',
        ),
    );
    qb.orderBy(
      this.mapTransferTargetSortColumn(query.sortBy ?? ClassTransferTargetSortField.NAME),
      query.sortDir,
      'NULLS LAST',
    );
    // `.offset()/.limit()` set the SQL clause directly, which is what a joined raw query needs.
    qb.addOrderBy('e.id', 'ASC').offset(query.skip).limit(query.take);

    const raw = await qb.getRawMany<ITransferTargetRawRow>();

    const rows: ITransferTargetRow[] = raw.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      schoolsCount: Number(row.schools_count),
    }));
    return { rows, total };
  }

  private mapTransferTargetSortColumn(field: ClassTransferTargetSortField): string {
    switch (field) {
      case ClassTransferTargetSortField.NAME:
        // The label the picker shows: the name, else the email, else the id.
        return 'LOWER(COALESCE(e.full_name, u.email, e.id::text))';
      case ClassTransferTargetSortField.EMAIL:
        return 'LOWER(u.email)';
      default: {
        // Exhaustive: a new sort field fails to compile until it is mapped here.
        const unmapped: never = field;
        throw new Error(`Unmapped transfer target sort field: ${String(unmapped)}`);
      }
    }
  }

  async updateTokenInvalidatedAt(ids: string[], invalidatedAt: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.repo
      .createQueryBuilder()
      .update(Educator)
      .set({ token_invalidated_at: invalidatedAt })
      .whereInIds(ids)
      .execute();
  }
}
