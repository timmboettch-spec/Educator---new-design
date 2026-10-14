import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { LoggerService } from 'src/common/services';

import { SchoolDto } from './dto/school.dto';
import { ServiceResponse } from 'src/common/types';
import { Messages, ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import { ResponseResult } from 'src/common/class/response.class';

import { CommonStatus } from 'src/common/enums/status.enum';
import { resolveAdminUserId } from 'src/common/utils/district-admin-profile.util';

import { EducatorSessionService } from '../session/educator-session.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

import { InvitesConstants } from '../invites/invites.constants';
import { InviteTokenService } from '../invites/invite-token.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import {
  Schools,
  User,
  Educator,
  Class,
  Student,
  ClassSimulation,
  InviteStatus,
  UserRole,
} from 'src/database/entities';
import { DatabaseService } from 'src/database/services/database.service';
import {
  CLASS_SIMULATION_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassSimulationRepository,
  InviteRepository,
  SchoolsRepository,
  UserRepository,
} from 'src/database/repositories';

@Injectable()
export class SchoolsService {
  constructor(
    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolRepo: SchoolsRepository,
    @Inject(USER_REPOSITORY)
    private userRepo: UserRepository,
    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly classSimulationRepo: ClassSimulationRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    private readonly dataSource: DataSource,
    private readonly databaseService: DatabaseService,
    private readonly educatorSessionService: EducatorSessionService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly inviteTokenService: InviteTokenService,
  ) { }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByCriteria(name: string, userId: string): Promise<Schools | null> {
    return this.schoolRepo.findOne({
      where: { school_name: name, user_id: { id: userId }, is_active: true },
    });
  }

  async findByIdAndOwner(id: string, userId: string): Promise<Schools | null> {
    return this.schoolRepo.findOne({
      where: { id, user_id: { id: userId }, deleted_at: IsNull() },
      relations: ['user_id'],
    });
  }

  async create(userId: string, schoolData: SchoolDto): Promise<ServiceResponse<Schools>> {
    const saved = await this.schoolRepo.create({
      school_name: schoolData.school_name,
      status: schoolData.status ?? CommonStatus.ACTIVE,
      google_classroom_enabled: schoolData.google_classroom_enabled === true,
      user_id: { id: userId },
    });

    const savedWithRelations = await this.schoolRepo.findOne({
      where: { id: saved.id },
      relations: ['user_id'],
    });

    return {
      success: true,
      message: Messages.SCHOOL_CREATED,
      data: savedWithRelations!,
    };
  }

  async findAll(userId: string, status?: string): Promise<ServiceResponse<Schools[]>> {
    const items = await this.schoolRepo.findAllForAdmin(userId, status);

    return {
      success: true,
      message: Messages.SCHOOL_FETCHED,
      data: items,
    };
  }

  async findOne(school: Schools): Promise<ServiceResponse<Schools>> {
    await this.schoolRepo.findOne({
      where: { id: school.id },
      relations: ['user_id'],
    });
    return {
      success: true,
      message: Messages.SCHOOL_FETCHED,
      data: school,
    };
  }

  async remove(school: Schools): Promise<ResponseResult<null>> {
    let educators: Educator[];
    let allAffectedEducatorIds: string[];

    try {
      const now = new Date();
      ({ educators, allAffectedEducatorIds } = await this.databaseService.runInTransaction(
        async (manager) => {
          await manager.update(
            Schools,
            { id: school.id },
            {
              is_active: false,
              deleted_at: now,
              status: CommonStatus.INACTIVE,
            },
          );
          // Find active educators linked to this school who have no remaining active
          // schools.  The school above is already saved as is_active=false, so the
          // NOT EXISTS subquery naturally excludes it.  This correctly handles
          // multi-school educators where some schools are already inactive.
          const onlySchoolRows = await manager
            .createQueryBuilder()
            .select('es.educator_id', 'educatorId')
            .from('educator_schools', 'es')
            .innerJoin('educators', 'e', 'e.id = es.educator_id AND e.is_active = true')
            .where('es.school_id = :schoolId', { schoolId: school.id })
            .andWhere(
              `NOT EXISTS (
                SELECT 1 FROM educator_schools es2
                INNER JOIN schools s ON s.id = es2.school_id AND s.is_active = true
                WHERE es2.educator_id = es.educator_id
              )`,
            )
            .getRawMany<{ educatorId: string }>();

          const educatorIdsToDeactivate = onlySchoolRows.map((r) => r.educatorId).filter(Boolean);
          const allAffectedRows = await manager
            .createQueryBuilder()
            .select('es.educator_id', 'educatorId')
            .from('educator_schools', 'es')
            .where('es.school_id = :schoolId', { schoolId: school.id })
            .getRawMany<{ educatorId: string }>();
          const affectedEducatorIds = allAffectedRows.map((r) => r.educatorId).filter(Boolean);

          await manager
            .createQueryBuilder()
            .delete()
            .from('educator_schools')
            .where('school_id = :schoolId', { schoolId: school.id })
            .execute();

          await manager.query(`UPDATE educators SET school_id = NULL WHERE school_id = $1`, [
            school.id,
          ]);

          const deactivatedEducators = await this.deactivateEducatorsAndCascade(
            educatorIdsToDeactivate,
            now,
            manager,
          );

          return { educators: deactivatedEducators, allAffectedEducatorIds: affectedEducatorIds };
        },
      ));
    } catch {
      throwAppError(Messages.SCHOOL_DELETE_FAILED, ErrorTypes.INTERNAL_SERVER_ERROR);
    }

    try {
      for (const educatorId of allAffectedEducatorIds) {
        void this.notificationsGateway.notifyEducatorSchoolRemoved(educatorId);
      }

      for (const educator of educators) {
        const adminId = resolveAdminUserId(educator);
        if (adminId) {
          void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
            adminId,
            educator.id,
            educator.full_name ?? '',
            CommonStatus.INACTIVE,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `[SchoolsService.remove] Post-commit notification dispatch failed: ${err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return new ResponseResult<null>({
      message: Messages.SCHOOL_DELETED,
      data: null,
    });
  }

  async update(school: Schools, schoolData: SchoolDto): Promise<ServiceResponse<Schools>> {
    const { school_name, status, google_classroom_enabled } = schoolData;

    // Capture previous values BEFORE mutation so we can detect what changed.
    const previousName = school.school_name;
    const previousStatus = school.status;

    if (school_name !== undefined) {
      school.school_name = school_name;
    }

    if (status !== undefined) {
      school.status = status;
      school.is_active = status === CommonStatus.ACTIVE;
    }

    if (google_classroom_enabled !== undefined) {
      school.google_classroom_enabled = google_classroom_enabled === true;
    }

    // When a school goes INACTIVE, deactivate educators who have no remaining
    // active schools — same cascade logic as remove().
    const goingInactive =
      previousStatus !== CommonStatus.INACTIVE && status === CommonStatus.INACTIVE;
    let deactivatedEducators: Educator[] = [];

    if (goingInactive) {
      try {
        deactivatedEducators = await this.databaseService.runInTransaction(async (manager) => {
          // Persist the school as INACTIVE inside the transaction.
          await manager.save(school);

          // Find active educators linked to this school who now have zero active schools
          // (the school above is already saved as is_active=false, so it is excluded
          // from the subquery automatically).
          const rows = await manager
            .createQueryBuilder()
            .select('es.educator_id', 'educatorId')
            .from('educator_schools', 'es')
            .innerJoin('educators', 'e', 'e.id = es.educator_id AND e.is_active = true')
            .where('es.school_id = :schoolId', { schoolId: school.id })
            .andWhere(
              `NOT EXISTS (
                SELECT 1 FROM educator_schools es2
                INNER JOIN schools s ON s.id = es2.school_id AND s.is_active = true
                WHERE es2.educator_id = es.educator_id
              )`,
            )
            .getRawMany<{ educatorId: string }>();

          const educatorIdsToDeactivate = rows.map((r) => r.educatorId).filter(Boolean);
          const now = new Date();
          return this.deactivateEducatorsAndCascade(educatorIdsToDeactivate, now, manager);
        });
      } catch (err) {
        this.logger.error(
          `[SchoolsService.update] Transaction failed: ${err instanceof Error ? err.message : String(err)
          }`,
        );
        return {
          success: false,
          message: Messages.SCHOOL_DELETE_FAILED,
          type: ErrorTypes.INTERNAL_SERVER_ERROR,
        };
      }
    } else {
      await this.schoolRepo.create(school);
      // When a school is reactivated, restore educators who were deactivated
      // solely because this school went inactive.
      if (previousStatus === CommonStatus.INACTIVE && status === CommonStatus.ACTIVE) {
        await this.reactivateEducatorsForActiveSchool(school.id);
      }
    }

    const updatedWithRelations = await this.schoolRepo.findOne({
      where: { id: school.id },
      relations: ['user_id'],
    });

    const statusChanged =
      (previousStatus !== CommonStatus.INACTIVE && status === CommonStatus.INACTIVE) ||
      (previousStatus === CommonStatus.INACTIVE && status === CommonStatus.ACTIVE);
    const nameChanged = school_name !== undefined && school_name !== previousName;

    if (statusChanged || nameChanged) {
      const rows = await this.dataSource.query<{ educator_id: string }[]>(
        `SELECT es.educator_id FROM educator_schools es
         INNER JOIN educators e ON e.id = es.educator_id
         WHERE es.school_id = $1 AND e.is_active = true`,
        [school.id],
      );
      const educatorIds = rows.map((r) => r.educator_id).filter(Boolean);
      for (const educatorId of educatorIds) {
        this.logger.warn(`[RCA][SchoolsService.update] emit school-status-changed → ${educatorId}`);
        void this.notificationsGateway.notifyEducatorSchoolStatusChanged(educatorId);
      }
    }

    // Notify admin about educators deactivated by this school status change (post-commit).
    for (const educator of deactivatedEducators) {
      const adminId = resolveAdminUserId(educator);
      if (adminId) {
        void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
          adminId,
          educator.id,
          educator.full_name ?? '',
          CommonStatus.INACTIVE,
        );
      }
    }

    return {
      success: true,
      message: Messages.SCHOOL_UPDATED,
      data: updatedWithRelations!,
    };
  }

  /**
   * When a school is reactivated (INACTIVE → ACTIVE), restore any educators
   * who were deactivated by business rules (deleted_at IS NULL) and are
   * assigned to this school.
   *
   * - Educators who already have a password are restored to ACTIVE immediately.
   * - Educators who never completed registration (no password) are restored to
   *   PENDING and receive a fresh invite email.
   */
  private async reactivateEducatorsForActiveSchool(schoolId: string): Promise<void> {
    const rows = await this.dataSource.query<
      {
        id: string;
        full_name: string | null;
        admin_user_id: string | null;
        user_role_id: string | null;
        v2_password: string | null;
        v2_email: string | null;
        districtAdminFullName: string | null;
      }[]
    >(
      // Identity and credentials live only on the linked `users` row — `educators.email`/
      // `.password` are no longer read. Raw SQL bypasses the `User` entity's `select: false`
      // on `password`, which is how `v2_password` comes back at all.
      `SELECT e.id, e.full_name, e.user_role_id,
              u.password AS v2_password, u.email AS v2_email,
              da.full_name AS "districtAdminFullName",
              dur.user_id AS admin_user_id
       FROM educators e
       INNER JOIN educator_schools es ON es.educator_id = e.id AND es.school_id = $1
       LEFT JOIN user_roles ur ON ur.user_role_id = e.user_role_id
       LEFT JOIN users u ON u.id = ur.user_id
       LEFT JOIN district_admins da ON da.district_admin_id = e.district_admin_id
       LEFT JOIN user_roles dur ON dur.user_role_id = da.user_role_id
       WHERE e.is_active = false AND e.deleted_at IS NULL`,
      [schoolId],
    );

    if (rows.length === 0) return;

    const school = await this.schoolRepo.findOne({ where: { id: schoolId } });

    for (const row of rows) {
      const identifier = row.v2_email;
      const hasCredentials = Boolean(row.v2_password);

      if (hasCredentials) {
        // Previously active — restore directly to ACTIVE.
        await this.dataSource.query(`UPDATE educators SET is_active = true WHERE id = $1`, [
          row.id,
        ]);
        if (row.user_role_id) {
          await this.dataSource.query(`UPDATE user_roles SET status = $1 WHERE user_role_id = $2`, [
            CommonStatus.ACTIVE,
            row.user_role_id,
          ]);
        }
        if (row.admin_user_id) {
          void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
            row.admin_user_id,
            row.id,
            row.full_name ?? '',
            CommonStatus.ACTIVE,
          );
        }
      } else {
        // Never completed registration — restore to PENDING and send fresh invite.
        await this.dataSource.query(`UPDATE educators SET is_active = true WHERE id = $1`, [
          row.id,
        ]);
        if (row.user_role_id) {
          await this.dataSource.query(`UPDATE user_roles SET status = $1 WHERE user_role_id = $2`, [
            CommonStatus.PENDING,
            row.user_role_id,
          ]);
        }

        if (!identifier) {
          if (row.admin_user_id) {
            void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
              row.admin_user_id,
              row.id,
              row.full_name ?? '',
              CommonStatus.PENDING,
            );
          }
          continue;
        }

        await this.inviteRepo.deleteByEmail(identifier);

        const expires_at = new Date();
        expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

        const admin = row.admin_user_id
          ? await this.userRepo.findOne({ where: { id: row.admin_user_id } })
          : null;
        const adminFullName = row.districtAdminFullName;

        const savedInvite = await this.inviteRepo.create({
          full_name: row.full_name ?? undefined,
          email: identifier,
          school: school ?? undefined,
          createdBy: admin ?? undefined,
          status: InviteStatus.PENDING,
          expires_at,
        });

        const logoUrl = this.configService.get<string>('mail.logoUrl') || '';
        const inviteToken = this.inviteTokenService.issue(savedInvite.id);
        const inviteUrl = this.inviteTokenService.buildInviteUrl(inviteToken);

        await this.mailService
          .sendMail({
            to: identifier,
            subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
            template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
            context: {
              fullName: row.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
              creatorName: adminFullName || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
              schoolName: school?.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
              inviteUrl,
              logoUrl,
              expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `[SchoolsService] Reactivation invite email failed for ${identifier}: ${err instanceof Error ? err.message : String(err)
              }`,
            );
          });

        if (row.admin_user_id) {
          void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
            row.admin_user_id,
            row.id,
            row.full_name ?? '',
            CommonStatus.PENDING,
          );
        }
      }
    }
  }

  /**
   * Business-rule educator deactivation cascade.
   *
   * Deactivates educators and soft-deletes their classes, students, and class
   * simulations.  Does NOT set `deleted_at` on educators so they remain visible
   * in the admin educator list as INACTIVE (only admin-initiated deletes set
   * `deleted_at` and hide the record).
   *
   * Returns the full Educator objects (with admin relation) for post-commit
   * notification dispatch.
   */
  private async deactivateEducatorsAndCascade(
    educatorIds: string[],
    now: Date,
    manager: EntityManager,
  ): Promise<Educator[]> {
    if (educatorIds.length === 0) return [];

    await manager.update(
      Educator,
      educatorIds.map((id) => ({ id })),
      { is_active: false },
    );

    const educators = await manager.find(Educator, {
      where: educatorIds.map((id) => ({ id })),
      relations: ['admin', 'admin.userRole'],
    });

    const linkedUserRoleIds = educators
      .map((educator) => educator.userRoleId)
      .filter((id): id is string => !!id);
    if (linkedUserRoleIds.length > 0) {
      await manager.update(
        UserRole,
        linkedUserRoleIds.map((userRoleId) => ({ userRoleId })),
        { status: CommonStatus.INACTIVE },
      );
    }

    const classes = await manager.find(Class, {
      where: educatorIds.map((id) => ({ educator: { id }, is_active: true })),
    });

    if (classes.length > 0) {
      const classIds = classes.map((c) => c.id);
      await manager.update(
        Class,
        classIds.map((id) => ({ id })),
        { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
      );
      for (const classId of classIds) {
        await manager.update(
          Student,
          { class: { id: classId } },
          { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
        );
        await manager.update(
          ClassSimulation,
          { class_id: classId, is_active: true },
          { is_active: false, deleted_at: now },
        );
      }
    }

    // Soft-delete students linked directly to an educator (no class).
    for (const educatorId of educatorIds) {
      await manager.update(
        Student,
        { educator: { id: educatorId }, class: null },
        { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
      );
    }

    return educators;
  }
}
