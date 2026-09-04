import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryRunner, Repository } from 'typeorm';
import { Schools } from './entity/schools.entity';
import { User } from '../users/entity/user.entity';
import { SchoolDto } from './dto/school.dto';
import { ServiceResponse } from 'src/common/types';
import { Messages, ErrorTypes } from 'src/common/utils/messages';
import { Educator } from 'src/educators/entity/educator.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Class } from 'src/class/entity/class.entity';
import { Student } from 'src/students/entity/students.entity';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { EducatorSessionService } from '../session/educator-session.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { Invite, InviteStatus } from '../invites/entity/invite.entity';
import { InvitesConstants } from '../invites/invites.constants';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(Schools)
    private readonly schoolRepo: Repository<Schools>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ClassSimulation)
    private readonly classSimulationRepo: Repository<ClassSimulation>,
    @InjectRepository(Invite)
    private readonly inviteRepo: Repository<Invite>,
    private readonly dataSource: DataSource,
    private readonly educatorSessionService: EducatorSessionService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  //TODO: To be moved to migration file
  onModuleInit(): void {
    void this.ensureColumn();
  }

  private async ensureColumn(): Promise<void> {
    await this.dataSource.query(`
    ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
  `);
  }

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
    const school = this.schoolRepo.create({
      school_name: schoolData.school_name,
      status: schoolData.status ?? CommonStatus.ACTIVE,
      user_id: { id: userId },
    });

    const saved = await this.schoolRepo.save(school);
    if (!saved || Array.isArray(saved)) {
      return {
        success: false,
        message: Messages.FAILED_TO_SAVE_SCHOOL,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

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
    const queryBuilder = this.schoolRepo
      .createQueryBuilder('school')
      .where('school.user_id = :userId', { userId })
      .andWhere('school.deleted_at IS NULL');

    if (status && status !== 'all') {
      const isActive = status === 'active';
      queryBuilder.andWhere('school.is_active = :isActive', { isActive });
    }

    const items = await queryBuilder.orderBy('school.created_at', 'DESC').getMany();

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

  async remove(school: Schools): Promise<ServiceResponse<null>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();
      await queryRunner.manager.update(
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
      const onlySchoolRows = await queryRunner.manager
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
      const allAffectedRows = await queryRunner.manager
        .createQueryBuilder()
        .select('es.educator_id', 'educatorId')
        .from('educator_schools', 'es')
        .where('es.school_id = :schoolId', { schoolId: school.id })
        .getRawMany<{ educatorId: string }>();
      const allAffectedEducatorIds = allAffectedRows.map((r) => r.educatorId).filter(Boolean);

      const _survivingEducatorIds = allAffectedEducatorIds.filter(
        (id) => !educatorIdsToDeactivate.includes(id),
      );
      void _survivingEducatorIds;

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('educator_schools')
        .where('school_id = :schoolId', { schoolId: school.id })
        .execute();

      await queryRunner.manager.query(
        `UPDATE educators SET school_id = NULL WHERE school_id = $1`,
        [school.id],
      );

      const educators = await this.deactivateEducatorsAndCascade(
        educatorIdsToDeactivate,
        now,
        queryRunner,
      );

      await queryRunner.commitTransaction();

      try {
        for (const educatorId of allAffectedEducatorIds) {
          this.notificationsGateway.notifyEducatorSchoolRemoved(educatorId);
        }

        for (const educator of educators) {
          const adminId = educator.admin?.id;
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
          `[SchoolsService.remove] Post-commit notification dispatch failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      return {
        success: true,
        message: Messages.SCHOOL_DELETED,
        data: null,
      };
    } catch {
      await queryRunner.rollbackTransaction();
      return {
        success: false,
        message: Messages.SCHOOL_DELETE_FAILED,
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    } finally {
      await queryRunner.release();
    }
  }

  async update(school: Schools, schoolData: SchoolDto): Promise<ServiceResponse<Schools>> {
    const { school_name, status } = schoolData;

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

    // When a school goes INACTIVE, deactivate educators who have no remaining
    // active schools — same cascade logic as remove().
    const goingInactive =
      previousStatus !== CommonStatus.INACTIVE && status === CommonStatus.INACTIVE;
    let deactivatedEducators: Educator[] = [];

    if (goingInactive) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        // Persist the school as INACTIVE inside the transaction.
        await queryRunner.manager.save(school);

        // Find active educators linked to this school who now have zero active schools
        // (the school above is already saved as is_active=false, so it is excluded
        // from the subquery automatically).
        const rows = await queryRunner.manager
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
        deactivatedEducators = await this.deactivateEducatorsAndCascade(
          educatorIdsToDeactivate,
          now,
          queryRunner,
        );
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error(
          `[SchoolsService.update] Transaction failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return {
          success: false,
          message: Messages.SCHOOL_DELETE_FAILED,
          type: ErrorTypes.INTERNAL_SERVER_ERROR,
        };
      } finally {
        await queryRunner.release();
      }
    } else {
      await this.schoolRepo.save(school);
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
        this.notificationsGateway.notifyEducatorSchoolStatusChanged(educatorId);
      }
    }

    // Notify admin about educators deactivated by this school status change (post-commit).
    for (const educator of deactivatedEducators) {
      const adminId = educator.admin?.id;
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
        password: string | null;
        email: string;
        full_name: string | null;
        admin_id: string | null;
      }[]
    >(
      `SELECT e.id, e.password, e.email, e.full_name, e.admin_id
       FROM educators e
       INNER JOIN educator_schools es ON es.educator_id = e.id AND es.school_id = $1
       WHERE e.is_active = false AND e.deleted_at IS NULL`,
      [schoolId],
    );

    if (rows.length === 0) return;

    const school = await this.schoolRepo.findOne({ where: { id: schoolId } });

    for (const row of rows) {
      if (row.password) {
        // Previously active — restore directly to ACTIVE.
        await this.dataSource.query(
          `UPDATE educators SET is_active = true, status = $1 WHERE id = $2`,
          [CommonStatus.ACTIVE, row.id],
        );
        if (row.admin_id) {
          void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
            row.admin_id,
            row.id,
            row.full_name ?? '',
            CommonStatus.ACTIVE,
          );
        }
      } else {
        // Never completed registration — restore to PENDING and send fresh invite.
        await this.dataSource.query(
          `UPDATE educators SET is_active = true, status = $1 WHERE id = $2`,
          [CommonStatus.PENDING, row.id],
        );

        await this.inviteRepo.delete({ email: row.email });

        const expires_at = new Date();
        expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

        const admin = row.admin_id
          ? await this.userRepo.findOne({ where: { id: row.admin_id } })
          : null;

        const savedInvite = await this.inviteRepo.save(
          this.inviteRepo.create({
            full_name: row.full_name ?? undefined,
            email: row.email,
            school: school ?? undefined,
            createdBy: admin ?? undefined,
            status: InviteStatus.PENDING,
            expires_at,
          }),
        );

        const frontendUrl =
          this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') || '';
        const inviteUrl = `${frontendUrl}/signup/${savedInvite.id}`;

        await this.mailService
          .sendMail({
            to: row.email,
            subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
            template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
            context: {
              fullName: row.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
              creatorName: admin?.full_name || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
              schoolName: school?.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
              inviteUrl,
              logoUrl,
              expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `[SchoolsService] Reactivation invite email failed for ${row.email}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });

        if (row.admin_id) {
          void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
            row.admin_id,
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
    queryRunner: QueryRunner,
  ): Promise<Educator[]> {
    if (educatorIds.length === 0) return [];

    await queryRunner.manager.update(
      Educator,
      educatorIds.map((id) => ({ id })),
      { is_active: false, status: CommonStatus.INACTIVE },
    );

    const educators = await queryRunner.manager.find(Educator, {
      where: educatorIds.map((id) => ({ id })),
      relations: ['admin'],
    });

    const classes = await queryRunner.manager.find(Class, {
      where: educatorIds.map((id) => ({ educator: { id }, is_active: true })),
    });

    if (classes.length > 0) {
      const classIds = classes.map((c) => c.id);
      await queryRunner.manager.update(
        Class,
        classIds.map((id) => ({ id })),
        { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
      );
      for (const classId of classIds) {
        await queryRunner.manager.update(
          Student,
          { class: { id: classId } },
          { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
        );
        await queryRunner.manager.update(
          ClassSimulation,
          { class_id: classId, is_active: true },
          { is_active: false, deleted_at: now },
        );
      }
    }

    // Soft-delete students linked directly to an educator (no class).
    for (const educatorId of educatorIds) {
      await queryRunner.manager.update(
        Student,
        { educator: { id: educatorId }, class: null },
        { is_active: false, deleted_at: now, status: CommonStatus.INACTIVE },
      );
    }

    return educators;
  }
}
