import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  Repository,
} from 'typeorm';
import {
  DistrictAdmin,
  User,
  User as UserEntity,
  UserRole,
  UserToken,
} from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { RoleSlug } from 'src/common/constants';
import {
  CreateDistrictAdminAccountData,
  CreateInvitedAccountData,
  CreateInvitedAccountResult,
  CreateUserWithRoleData,
  ResetPasswordData,
} from 'src/common/interfaces';

/**
 * This is the ONLY place where the TypeORM `User`/`Role` entities are
 * referenced outside of `src/users/`.
 */
@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) { }

  async create(data: DeepPartial<User> & { id?: string }): Promise<User> {
    const entity = this.repo.create(data as Partial<UserEntity>);
    return this.repo.save(entity);
  }

  /**
   * Creates a users row together with its matching ACTIVE user_roles link, in one
   * transaction — the write `UsersService.createUser` needs so the account is visible to every
   * role-based check (`login()`, `JwtStrategyV2`, `AuthGuard`). Role membership lives only on
   * `user_roles`; the legacy `users.role_id` column is no longer mapped or written.
   */
  async createUserWithRole(data: CreateUserWithRoleData): Promise<User> {
    return this.repo.manager.transaction(async (manager) => {
      const user = await manager.save(
        UserEntity,
        manager.create(UserEntity, {
          email: data.email,
          password: data.password,
          status: data.status,
        }),
      );

      const userRole = await manager.save(
        UserRole,
        manager.create(UserRole, {
          userId: user.id,
          roleId: data.roleId,
          status: CommonStatus.ACTIVE,
        }),
      );

      // `fullName` no longer lives on `users` — without this row a district admin created
      // here would have nowhere to store it, and would also be missing the profile that
      // redemption/login both assume every district admin already has.
      if (data.roleSlug === RoleSlug.DISTRICT_ADMIN) {
        await manager.save(
          DistrictAdmin,
          manager.create(DistrictAdmin, {
            userRoleId: userRole.userRoleId,
            fullName: data.fullName,
          }),
        );
      }

      return user;
    });
  }

  async find(options: FindManyOptions<User> = {}): Promise<User[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<User>): Promise<User | null> {
    return this.repo.findOne(options);
  }

  async update(id: string, data: DeepPartial<UserEntity>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }

  /**
   * Lookup by email — for callers that only need to identify the user (existence checks,
   * scalar-field reads), not touch the password or any relation. Use findByEmailWithPassword
   * for that instead.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  /**
   * Lookup by email, joining just the account's roles — for callers (e.g. invite creation)
   * that need to know what roles an existing account already has, without the password or the
   * other login-specific relations findByEmailWithPassword loads.
   */
  async findByEmailWithRoles(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email },
      relations: { userRoles: { role: true } },
    });
  }

  /**
   * Lookup by email, joining everything a v2 login flow needs — roles, district-admin
   * profile, linked legacy educator/student — in this one query. Used only for login
   * (login/signup/acceptInvite), never for a plain existence/identity check.
   *
   * The `userRoles` join is filtered to ACTIVE-status rows directly in its ON clause (not a
   * WHERE, which would drop the user entirely if none of their roles are active) — so
   * `user.userRoles` here already only ever contains active roles, and the joined
   * districtAdmin/educator/student profiles are scoped to those same active roles.
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.userRoles', 'userRoles', 'userRoles.status = :activeStatus', {
        activeStatus: CommonStatus.ACTIVE,
      })
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('userRoles.districtAdmin', 'districtAdmin')
      .leftJoinAndSelect('userRoles.educator', 'educator')
      .leftJoinAndSelect('educator.school', 'educatorSchool')
      .leftJoinAndSelect('educator.schoolAssignments', 'educatorSchoolAssignments')
      .leftJoinAndSelect('educatorSchoolAssignments.school', 'educatorAssignmentSchool')
      .leftJoinAndSelect('userRoles.student', 'student')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  /**
   * Lookup by id, selecting only `id`/`password` — for change-password flows, which need to
   * compare against the current hash and then overwrite it, nothing else. `password` is
   * `select: false` on the entity, so it must be opted back in explicitly like this.
   */
  async findByIdWithPassword(id: string): Promise<Pick<User, 'id' | 'password'> | null> {
    return this.repo.findOne({ where: { id }, select: { id: true, password: true } });
  }

  /**
   * Lookup by id, joining the same relations as `findByEmailWithPassword` — used by the
   * role-selection step (`AuthService.selectRole`) once the login-purpose token has already
   * identified the account by `sub`, so there's no email to look up by.
   */
  async findByIdWithRoles(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.userRoles', 'userRoles', 'userRoles.status = :activeStatus', {
        activeStatus: CommonStatus.ACTIVE,
      })
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('userRoles.districtAdmin', 'districtAdmin')
      .leftJoinAndSelect('userRoles.educator', 'educator')
      .leftJoinAndSelect('educator.school', 'educatorSchool')
      .leftJoinAndSelect('educator.schoolAssignments', 'educatorSchoolAssignments')
      .leftJoinAndSelect('educatorSchoolAssignments.school', 'educatorAssignmentSchool')
      .leftJoinAndSelect('userRoles.student', 'student')
      .where('user.id = :id', { id })
      .getOne();
  }

  /**
   * Creates a users row together with its District Admin user_roles link and that link's
   * district_admins profile, in a single transaction — the one method district-admin signup
   * calls to do all of its writes. `users.status` is left at its column default and never
   * touched here — an account's usable/pending/inactive state lives on the user_roles row.
   */
  async createDistrictAdminAccount(data: CreateDistrictAdminAccountData): Promise<User> {
    return this.repo.manager.transaction(async (manager) => {
      const user = await manager.save(
        UserEntity,
        manager.create(UserEntity, {
          email: data.email,
          password: data.password,
        }),
      );

      const userRole = await manager.save(
        UserRole,
        manager.create(UserRole, {
          userId: user.id,
          roleId: data.roleId,
          status: CommonStatus.ACTIVE,
        }),
      );

      await manager.save(
        DistrictAdmin,
        manager.create(DistrictAdmin, {
          userRoleId: userRole.userRoleId,
          fullName: data.fullName,
        }),
      );

      return user;
    });
  }

  /**
   * Updates the account's password and deletes the now-used OTP row in one transaction — the
   * one method reset-password calls to do both of its writes.
   */
  async resetPassword(data: ResetPasswordData): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      await manager.update(UserEntity, { id: data.userId }, { password: data.hashedPassword });
      await manager.delete(UserToken, { userTokenId: data.userTokenId });
    });
  }

  /**
   * Creates a users row (no password yet) together with its user_roles link (status per
   * `data.roleStatus` — pending/in_active) in a single transaction — the one method an invite
   * flow calls to establish the identity a later accept-invite call will activate. `users.status`
   * is left at its column default and never touched here — see createDistrictAdminAccount.
   */
  async createInvitedAccount(data: CreateInvitedAccountData): Promise<CreateInvitedAccountResult> {
    return this.repo.manager.transaction(async (manager) => {
      const user = await manager.save(
        UserEntity,
        manager.create(UserEntity, {
          email: data.email,
        }),
      );

      const userRole = await manager.save(
        UserRole,
        manager.create(UserRole, {
          userId: user.id,
          roleId: data.roleId,
          status: data.roleStatus,
        }),
      );

      return { user, userRoleId: userRole.userRoleId };
    });
  }

  /** Sets the account's password — the invite-acceptance write. The PENDING-to-ACTIVE flip
   * happens on the specific user_roles row (see UserRoleRepository.activate), not here. */
  async activateInvitedAccount(userId: string, hashedPassword: string): Promise<User | null> {
    await this.repo.update({ id: userId }, { password: hashedPassword });
    return this.repo.findOne({ where: { id: userId } });
  }
}
