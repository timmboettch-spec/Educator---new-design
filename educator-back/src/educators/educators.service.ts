import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, IsNull, Raw } from 'typeorm';

import { UpdateEducatorDto } from './dto/educator.dto';
import { ServiceResponse, SubscriptionSummary } from 'src/common/types';
import { EducatorConstants } from './educators.constants';
import { AzureBlobService, LoggerService } from '../common/services';
import { ErrorTypes } from 'src/common/utils/messages';

import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { InvitesConstants } from '../invites/invites.constants';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '../database/entities/notification-preference.entity';
import { NotificationType } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  EDUCATOR_USER_SELECT,
  resolveEducatorEmail,
  resolveEducatorPassword,
  resolveEducatorStatus,
  toEducatorResponse,
  toEducatorResponseList,
} from 'src/common/utils/educator-identity.util';
import {
  isGoogleClassroomEnabledForEducator,
  mapEducatorSchoolsForAuth,
} from 'src/common/utils/educator-school.util';
import {
  resolveAdminEmail,
  resolveAdminFullName,
  resolveAdminUserId,
} from 'src/common/utils/district-admin-profile.util';
import { EducatorResponse } from 'src/common/interfaces';
import { SeatRequestCooldownException } from 'src/common/exceptions/seat-request-cooldown.exception';
import { secondsUntilWindowEnds, toUtcIsoString } from 'src/common/utils/dayjs.utils';
import { NotificationsConstants } from 'src/notifications/notifications.constants';
import { EducatorSessionService } from '../session/educator-session.service';
import { InviteTokenService } from 'src/invites/invite-token.service';
import {
  Educator,
  EducatorSchool,
  Schools,
  Class,
  Student,
  ClassSimulation,
  Invite,
  InviteStatus,
  DistrictAdmin,
  EducatorSeatRequest,
} from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  INVITE_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassSimulationRepository,
  DistrictAdminRepository,
  EducatorRepository,
  EducatorSchoolRepository,
  EducatorSeatRequestRepository,
  InviteRepository,
  SimulationReportRepository,
  SchoolsRepository,
  UserRoleRepository,
} from 'src/database/repositories';

@Injectable()
export class EducatorsService {
  private getLogoAttachments(): {
    filename: string;
    contentType: string;
    content: Buffer;
    cid: string;
  }[] {
    try {
      const logoPath = path.join(__dirname, '..', 'assets', 'realityworks-ai-logo.png');
      if (!fs.existsSync(logoPath)) return [];
      return [
        {
          filename: 'realityworks-ai-logo.png',
          contentType: 'image/png',
          content: fs.readFileSync(logoPath),
          cid: 'realityworks-ai-logo',
        },
      ];
    } catch {
      return [];
    }
  }

  constructor(
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,

    @Inject(EDUCATOR_SCHOOL_REPOSITORY)
    private readonly educatorSchoolRepo: EducatorSchoolRepository,

    @Inject(EDUCATOR_SEAT_REQUEST_REPOSITORY)
    private readonly seatRequestRepo: EducatorSeatRequestRepository,

    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepo: UserRoleRepository,

    @Inject(DISTRICT_ADMIN_REPOSITORY)
    private readonly districtAdminRepo: DistrictAdminRepository,

    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolRepo: SchoolsRepository,

    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,

    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly classSimulationRepo: ClassSimulationRepository,

    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,

    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepo: SimulationReportRepository,

    private readonly azureBlobService: AzureBlobService,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly educatorSessionService: EducatorSessionService,
    private readonly logger: LoggerService,
    private readonly inviteTokenService: InviteTokenService,
  ) {}

  /**
   * An educator's lifecycle lives solely on its linked `user_roles` row — `Educator.status` is
   * no longer mapped or written, and `resolveEducatorStatus` reads `user_roles.status`. This
   * keeps every status transition pointed at that single write target.
   */
  private async syncLinkedUserRoleStatus(educator: Educator, status: CommonStatus): Promise<void> {
    if (!educator.userRoleId) return;
    await this.userRoleRepo.update({ userRoleId: educator.userRoleId }, { status });
  }

  async findByIdAndOwner(educatorId: string, adminId: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { id: educatorId, admin: { userRole: { userId: adminId } } },
      relations: {
        school: true,
        admin: { userRole: { user: true } },
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
      select: {
        userRole: {
          userRoleId: true, // primary key of UserRole — required, use your entity's property name
          userId: true,
          status: true,
          user: EDUCATOR_USER_SELECT,
        },
      },
    });
  }

  async findSchoolByOwner(schoolId: string, adminId: string): Promise<Schools | null> {
    return this.schoolRepo.findOne({
      where: { id: schoolId, user_id: { id: adminId }, is_active: true },
    });
  }

  async findAll(adminId: string): Promise<ServiceResponse<EducatorResponse[]>> {
    const educators = await this.educatorRepo.find({
      where: { admin: { userRole: { userId: adminId } }, deleted_at: IsNull() },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
      order: { created_at: 'DESC' },
    });

    return {
      success: true,
      message: EducatorConstants.MESSAGES.FETCHED,
      data: toEducatorResponseList(educators),
    };
  }

  async findOne(educator: Educator): Promise<ServiceResponse<EducatorResponse>> {
    // The re-fetch is what loads `userRole.user` — `email`/`status` no longer exist as columns
    // on `Educator` and resolve through that relation, so responding with the caller's bare
    // `educator` argument would return them as null on every call.
    const loaded = await this.educatorRepo.findOne({
      where: { id: educator.id, is_active: true },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });
    if (!loaded) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    return {
      success: true,
      message: EducatorConstants.MESSAGES.FETCHED,
      data: toEducatorResponse(loaded),
    };
  }

  async findById(id: string): Promise<ServiceResponse<EducatorResponse>> {
    const educator = await this.educatorRepo.findOne({
      where: { id },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });
    if (!educator) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    educator.profile_picture = await this.sanitizeProfilePicture(educator.profile_picture);
    return {
      success: true,
      message: EducatorConstants.MESSAGES.FETCHED,
      data: toEducatorResponse(educator),
    };
  }

  async availableTokens(educatorId: string): Promise<number> {
    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId, is_active: true },
      select: ['tokens'],
    });
    return Number(educator?.tokens) || 0;
  }

  async releaseTokens(educatorId: string, count: number): Promise<void> {
    if (count <= 0) return;
    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId },
    });
    if (!educator) return;
    educator.tokens = (Number(educator.tokens) || 0) + count;
    educator.allocated_tokens = Math.max(0, (Number(educator.allocated_tokens) || 0) - count);
    await this.educatorRepo.create(educator);
  }

  async updateToken(educatorId: string, tokensUsed: number): Promise<void> {
    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId },
      relations: ['admin', 'admin.userRole', 'userRole', 'userRole.user'],
    });
    if (!educator) return;

    const currentTokens = Number(educator.tokens) || 0;
    const newTokens = Math.max(0, currentTokens - tokensUsed);
    educator.tokens = newTokens;
    educator.allocated_tokens = (educator.allocated_tokens || 0) + tokensUsed;
    await this.educatorRepo.create(educator);

    this.warnAdminIfSeatsCrossedThreshold(educator, currentTokens, newTokens);
  }

  /**
   * Warns the educator's admin when a seat deduction made outside `updateToken` (e.g. the bulk
   * assign transaction) drops the balance below the low-seat threshold. Fire-and-forget.
   */
  async notifyIfSeatsBelowThreshold(
    educatorId: string,
    previousTokens: number,
    newTokens: number,
  ): Promise<void> {
    if (newTokens >= previousTokens) return;
    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId },
      relations: ['admin', 'admin.userRole', 'userRole', 'userRole.user'],
    });
    if (!educator) return;
    this.warnAdminIfSeatsCrossedThreshold(educator, previousTokens, newTokens);
  }

  private warnAdminIfSeatsCrossedThreshold(
    educator: Educator,
    previousTokens: number,
    newTokens: number,
  ): void {
    const threshold = NotificationsConstants.DEFAULTS.LOW_EDUCATOR_SEAT_THRESHOLD;
    const adminUserId = resolveAdminUserId(educator);
    if (
      newTokens < previousTokens &&
      adminUserId &&
      previousTokens >= threshold &&
      newTokens < threshold
    ) {
      const educatorName =
        educator.full_name?.trim() || resolveEducatorEmail(educator) || educator.id;
      void this.notificationsGateway.notifyAdminEducatorLowSeatWarning(
        adminUserId,
        educator.id,
        educatorName,
        newTokens,
      );
    }
  }

  async update(
    educator: Educator,
    dto: UpdateEducatorDto,
    school?: Schools | null,
  ): Promise<ServiceResponse<EducatorResponse>> {
    const previousStatus = resolveEducatorStatus(educator);
    const isReactivating =
      previousStatus === CommonStatus.INACTIVE && dto.status === CommonStatus.ACTIVE;
    const isDeactivating =
      previousStatus !== CommonStatus.INACTIVE && dto.status === CommonStatus.INACTIVE;

    if (dto.status !== undefined) {
      await this.syncLinkedUserRoleStatus(educator, dto.status);
    }

    if (dto.full_name !== undefined) {
      educator.full_name = dto.full_name;
    }

    if (dto.phone_number !== undefined) {
      educator.phone_number = dto.phone_number;
    }

    let tokensJustAllocated = 0;
    if (dto.tokens !== undefined) {
      const previousTokens = Number(educator.tokens) || 0;
      const additionalTokens = Number(dto.tokens);

      if (additionalTokens > 0 && educator.districtAdminId) {
        const admin = await this.districtAdminRepo.findById(educator.districtAdminId);
        if (admin) {
          const subscriptions = (admin.subscriptions as SubscriptionSummary[]) || [];
          const sortedSubs = [...subscriptions].sort(
            (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime(),
          );

          const totalAvailable = sortedSubs.reduce(
            (sum, sub) => sum + (sub.seats_available || 0),
            0,
          );
          if (totalAvailable < additionalTokens) {
            return {
              success: false,
              message: `Insufficient seats available. Available: ${totalAvailable}, requested: ${additionalTokens}`,
              type: ErrorTypes.BAD_REQUEST,
            };
          }

          let remaining = additionalTokens;
          for (const sub of sortedSubs) {
            if (remaining <= 0) break;
            const available = sub.seats_available || 0;
            if (available <= 0) continue;
            const deduct = Math.min(available, remaining);
            sub.seats_available = available - deduct;
            remaining -= deduct;
          }

          const totalAvailableAfter = sortedSubs.reduce(
            (sum, sub) => sum + (sub.seats_available || 0),
            0,
          );
          const schoolThreshold = NotificationsConstants.DEFAULTS.LOW_SCHOOL_SEAT_THRESHOLD;
          if (totalAvailable > schoolThreshold && totalAvailableAfter <= schoolThreshold) {
            const schoolName =
              (educator.primarySchool ?? educator.school)?.school_name?.trim() || 'School';
            const adminUserId = resolveAdminUserId(educator);
            if (adminUserId) {
              void this.notificationsGateway.notifyAdminSchoolLowSeatWarning(
                adminUserId,
                schoolName,
                totalAvailableAfter,
              );
            }
          }

          await this.districtAdminRepo.updateById(educator.districtAdminId, {
            subscriptions,
          });
        }
      }

      educator.tokens = previousTokens + additionalTokens;
      tokensJustAllocated = additionalTokens;
    }

    if (school !== undefined) {
      educator.school = school;
      if (school !== null) {
        await this.ensureEducatorSchoolRow(educator.id, school.id);
      }
    }

    await this.updateProfile(
      educator.id,
      { full_name: educator.full_name ?? undefined },
      educator.tokens ? undefined : undefined,
    );

    await this.educatorRepo.create(educator);

    if (tokensJustAllocated > 0) {
      void this.notificationsGateway.notifyEducatorTokensAllocated(
        educator.id,
        tokensJustAllocated,
      );
    }

    if (isDeactivating) {
      await this.educatorSessionService.invalidateEducator(educator.id);
      this.notificationsGateway.notifyAccountDeactivated(educator.id);
    }

    const updated = await this.educatorRepo.findOne({
      where: { id: educator.id },
      relations: {
        school: true,
        admin: { userRole: { user: true } },
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });

    let sentInvite = false;
    if (isReactivating) {
      if (!resolveEducatorPassword(educator)) {
        educator.is_active = true;
        await this.syncLinkedUserRoleStatus(educator, CommonStatus.PENDING);
        await this.educatorRepo.create(educator);
        await this.sendReactivationInvite(educator);
        sentInvite = true;
      } else {
        educator.is_active = true;
        await this.educatorRepo.create(educator);
        void this.sendAccountReactivatedEmail(educator);
      }
    }

    const finalUpdated = sentInvite
      ? await this.educatorRepo.findOne({
          where: { id: educator.id },
          relations: {
            school: true,
            admin: { userRole: { user: true } },
            schoolAssignments: { school: true },
            userRole: { user: true },
          },
        })
      : updated;

    return {
      success: true,
      message: sentInvite
        ? InvitesConstants.MESSAGES.INVITE_SENT
        : EducatorConstants.MESSAGES.UPDATED,
      data: toEducatorResponse(finalUpdated!),
    };
  }

  private async sendReactivationInvite(educator: Educator): Promise<void> {
    const identifier = resolveEducatorEmail(educator);
    if (!identifier) {
      this.logger.error(
        `[sendReactivationInvite] No resolvable identifier for educator ${educator.id}`,
      );
      return;
    }
    await this.inviteRepo.deleteByEmail(identifier);

    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

    const reactivationSchool = educator.primarySchool ?? educator.school ?? undefined;

    const savedInvite = await this.inviteRepo.create({
      full_name: educator.full_name ?? undefined,
      email: identifier,
      school: reactivationSchool ?? undefined,
      createdBy: educator.admin?.userRole?.user ?? undefined,
      status: InviteStatus.PENDING,
      expires_at,
    });

    const logoUrl = this.configService.get<string>('mail.logoUrl') || '';
    const inviteToken = this.inviteTokenService.issue(savedInvite.id);
    const inviteUrl = this.inviteTokenService.buildInviteUrl(inviteToken);

    await this.mailService
      .sendMail({
        to: identifier ?? undefined,
        subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
        template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
        context: {
          fullName: educator.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
          creatorName:
            resolveAdminFullName(educator) || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
          schoolName:
            reactivationSchool?.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
          inviteUrl,
          logoUrl,
          expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
        },
        attachments: this.getLogoAttachments(),
      })
      .catch((error: unknown) => {
        this.logger.error({
          topic: 'EducatorsService',
          subTopic: 'sendReactivationInvite',
          operation: InvitesConstants.LOG.EMAIL_SEND_FAILED,
          error,
        });
      });
  }

  private async sendAccountReactivatedEmail(educator: Educator): Promise<void> {
    const enabled = await this.notificationsService.isPreferenceEnabled(
      educator.id,
      NotificationType.ACCOUNT_REACTIVATED,
      NotificationChannel.EMAIL,
    );
    if (!enabled) return;

    const identifier = resolveEducatorEmail(educator);
    if (!identifier) {
      this.logger.error(
        `[sendAccountReactivatedEmail] No resolvable identifier for educator ${educator.id}`,
      );
      return;
    }

    const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? '';
    const logoUrl = this.configService.get<string>('mail.logoUrl') ?? '';
    const loginUrl = `${frontendUrl}/login`;

    await this.mailService
      .sendMail({
        to: identifier,
        subject: 'Your Realityworks AI account has been reactivated',
        template: 'account-reactivated',
        context: {
          fullName: educator.full_name || 'Educator',
          loginUrl,
          logoUrl,
        },
      })
      .catch((error) => {
        this.logger.error(
          `[sendAccountReactivatedEmail] Failed to send email to ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  async ensureEducatorSchoolRow(educatorId: string, schoolId: string): Promise<void> {
    const existing = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
    if (existing) return;

    const existingCount = await this.educatorSchoolRepo.count({
      where: { educator: { id: educatorId } },
    });
    const isPrimary = existingCount === 0;

    await this.educatorSchoolRepo.create({
      educator: { id: educatorId } as Educator,
      school: { id: schoolId } as Schools,
      is_primary: isPrimary,
    });
  }

  async addSchool(
    educatorId: string,
    schoolId: string,
    adminId: string,
  ): Promise<ServiceResponse<EducatorResponse>> {
    const educator = await this.findByIdAndOwner(educatorId, adminId);
    if (!educator) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const school = await this.findSchoolByOwner(schoolId, adminId);
    if (!school) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.SCHOOL_NOT_OWNED,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    await this.ensureEducatorSchoolRow(educatorId, schoolId);

    if (!educator.is_active && !educator.deleted_at) {
      if (resolveEducatorPassword(educator)) {
        await this.educatorRepo.update(educatorId, {
          is_active: true,
        });
        await this.syncLinkedUserRoleStatus(educator, CommonStatus.ACTIVE);
        void this.notificationsGateway.notifyAdminEducatorStatusUpdated(
          adminId,
          educatorId,
          educator.full_name ?? '',
          CommonStatus.ACTIVE,
        );
      } else {
        await this.educatorRepo.update(educatorId, {
          is_active: true,
        });
        await this.syncLinkedUserRoleStatus(educator, CommonStatus.PENDING);
        const reloaded = await this.educatorRepo.findOne({
          where: { id: educatorId },
          relations: {
            school: true,
            admin: { userRole: { user: true } },
            schoolAssignments: { school: true },
            userRole: { user: true },
          },
        });
        if (reloaded) {
          await this.sendReactivationInvite(reloaded);
        }
      }
    }

    void this.notificationsGateway.notifyEducatorSchoolAdded(educatorId);

    const updated = await this.educatorRepo.findOne({
      where: { id: educatorId },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });
    return {
      success: true,
      message: EducatorConstants.MESSAGES.UPDATED,
      data: toEducatorResponse(updated!),
    };
  }

  async removeSchool(
    educatorId: string,
    schoolId: string,
    adminId: string,
  ): Promise<ServiceResponse<EducatorResponse>> {
    const educator = await this.findByIdAndOwner(educatorId, adminId);
    if (!educator) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const assignment = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
    if (!assignment) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.SCHOOL_NOT_OWNED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const wasPrimary = assignment.is_primary;

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(EducatorSchool, { id: assignment.id });
      if (wasPrimary) {
        const remaining = await manager.findOne(EducatorSchool, {
          where: { educator: { id: educatorId } },
          order: { assigned_at: 'ASC' },
          relations: { school: true },
        });
        if (remaining) {
          remaining.is_primary = true;
          await manager.save(remaining);
          await manager.query(`UPDATE educators SET school_id = $1 WHERE id = $2`, [
            remaining.school.id,
            educatorId,
          ]);
        } else {
          await manager.query(`UPDATE educators SET school_id = NULL WHERE id = $1`, [educatorId]);
        }
      }

      const remainingCount = await manager.count(EducatorSchool, {
        where: { educator: { id: educatorId } },
      });
      if (remainingCount === 0) {
        await manager.query(`UPDATE educators SET is_active = false WHERE id = $1`, [educatorId]);
        if (educator.userRoleId) {
          await manager.query(`UPDATE user_roles SET status = $1 WHERE user_role_id = $2`, [
            CommonStatus.INACTIVE,
            educator.userRoleId,
          ]);
        }
      }
    });

    const updated = await this.educatorRepo.findOne({
      where: { id: educatorId },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });

    void this.notificationsGateway.notifyEducatorSchoolRemoved(educatorId);

    return {
      success: true,
      message: EducatorConstants.MESSAGES.UPDATED,
      data: toEducatorResponse(updated!),
    };
  }

  async resendInvite(educatorId: string, adminId: string): Promise<ServiceResponse<null>> {
    const educator = await this.findByIdAndOwner(educatorId, adminId);
    if (!educator) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    if (resolveEducatorStatus(educator) !== CommonStatus.PENDING) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.EDUCATOR_NOT_PENDING,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const identifier = resolveEducatorEmail(educator);
    if (!identifier) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NO_EMAIL_ON_FILE,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    await this.inviteRepo.deletePendingByEmail(identifier);

    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

    const newInvite = await this.inviteRepo.create({
      full_name: educator.full_name ?? undefined,
      email: identifier,
      school: educator.school ?? undefined,
      createdBy: educator.admin?.userRole?.user ?? undefined,
      status: InviteStatus.PENDING,
      expires_at,
    });

    const inviteToken = this.inviteTokenService.issue(newInvite.id);
    const inviteUrl = this.inviteTokenService.buildInviteUrl(inviteToken);
    const logoUrl = this.configService.get<string>('mail.logoUrl') || '';

    await this.mailService
      .sendMail({
        to: identifier,
        subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
        template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
        context: {
          fullName: educator.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
          creatorName:
            resolveAdminFullName(educator) || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
          schoolName: educator.school?.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
          inviteUrl,
          logoUrl,
          expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
        },
        attachments: this.getLogoAttachments(),
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to resend invite email to ${identifier}`, errorMessage);
      });

    return {
      success: true,
      message: EducatorConstants.MESSAGES.RESEND_INVITE_SENT,
      data: null,
    };
  }

  async requestMoreSeats(
    educatorId: string,
    input: { requested_seats?: number; note?: string },
  ): Promise<ServiceResponse<{ requestedAt: string; cooldownSeconds: number }>> {
    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId, is_active: true },
      relations: {
        admin: { userRole: { user: true } },
        school: true,
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
    });

    if (!educator) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const adminUserId = resolveAdminUserId(educator);
    const districtAdminId = educator.admin?.districtAdminId;
    if (!adminUserId || !districtAdminId) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.ADMIN_NOT_FOUND,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const cooldownMinutes = NotificationsConstants.DEFAULTS.EDUCATOR_SEAT_REQUEST_COOLDOWN_MINUTES;
    const requestedSeats =
      typeof input.requested_seats === 'number' && input.requested_seats > 0
        ? Math.floor(input.requested_seats)
        : null;
    const note = input.note?.trim() || undefined;

    let seatRequest: EducatorSeatRequest;
    try {
      seatRequest = await this.seatRequestRepo.createWithinCooldown(
        { educatorId: educator.id, districtAdminId, requestedSeats, note: note ?? null },
        cooldownMinutes,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          success: false,
          message: EducatorConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      if (error instanceof SeatRequestCooldownException) {
        return {
          success: false,
          message: EducatorConstants.MESSAGES.SEAT_REQUEST_COOLDOWN(cooldownMinutes),
          type: ErrorTypes.BAD_REQUEST,
          data: {
            requestedAt: toUtcIsoString(error.requestedAt),
            cooldownSeconds: secondsUntilWindowEnds(error.requestedAt, cooldownMinutes),
          },
        };
      }
      throw error;
    }

    const identifier = resolveEducatorEmail(educator);
    const educatorName = educator.full_name?.trim() || identifier || educator.id;
    const remainingSeats = Number(educator.tokens) || 0;
    const primarySchoolName =
      (educator.primarySchool ?? educator.school)?.school_name?.trim() || undefined;
    try {
      await this.notificationsGateway.notifyAdminEducatorSeatRequest(
        adminUserId,
        educator.id,
        educatorName,
        identifier,
        requestedSeats,
        remainingSeats,
        note,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist seat request notification for educator ${educator.id}`,
        error,
      );
      try {
        await this.seatRequestRepo.hardDeleteById(seatRequest.seatRequestId);
      } catch (deleteError) {
        this.logger.error(
          `Failed to remove seat request after notification failure (seat_request_id=${seatRequest.seatRequestId})`,
          deleteError,
        );
      }
      return {
        success: false,
        message: EducatorConstants.MESSAGES.SEAT_REQUEST_FAILED,
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    }

    const adminEmail = resolveAdminEmail(educator);
    if (adminEmail) {
      const logoUrl = this.configService.get<string>('mail.logoUrl') || '';
      const frontendUrl = this.configService.get<string>('app.frontendUrl') || '';
      const adminUrl = frontendUrl ? `${frontendUrl}/educators` : '';
      this.mailService
        .sendMail({
          to: adminEmail,
          subject: EducatorConstants.MESSAGES.SEAT_REQUEST_EMAIL_SUBJECT(educatorName),
          template: 'educator-seat-request',
          context: {
            adminName: resolveAdminFullName(educator)?.trim() || 'Admin',
            educatorName,
            educatorEmail: identifier,
            schoolName: primarySchoolName,
            remainingSeats,
            requestedSeats,
            note,
            logoUrl,
            adminUrl,
          },
        })
        .catch((error) => {
          this.logger.error(`Failed to send seat-request email to admin ${adminEmail}`, error);
        });
    }

    return {
      success: true,
      message: EducatorConstants.MESSAGES.SEAT_REQUEST_SENT,
      data: {
        requestedAt: toUtcIsoString(seatRequest.requestedAt),
        cooldownSeconds: secondsUntilWindowEnds(seatRequest.requestedAt, cooldownMinutes),
      },
    };
  }

  async remove(educator: Educator): Promise<ServiceResponse<null>> {
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const educatorToDelete = await manager.findOne(Educator, {
        where: { id: educator.id },
      });

      if (!educatorToDelete) {
        throw new Error('Educator not found');
      }

      const remainingTokens = Number(educatorToDelete.tokens) || 0;

      // One DB query: all active students across educator's classes
      const studentRows: Array<{ id: string; class_id: string }> = await manager.query(
        `SELECT s.id, s.class_id
         FROM students s
         INNER JOIN classes c ON c.id = s.class_id
         WHERE c.educator_id = $1 AND c.is_active = true AND s.is_active = true`,
        [educator.id],
      );

      // One DB query: all active AI sims across educator's classes
      const aiSimRows: Array<{ simulation_id: string; class_id: string }> = await manager.query(
        `SELECT cs.simulation_id, cs.class_id
         FROM class_simulations cs
         INNER JOIN classes c ON c.id = cs.class_id
         WHERE c.educator_id = $1 AND c.is_active = true AND cs.is_active = true AND cs.is_ai = true`,
        [educator.id],
      );

      // Which of those students have an Attempt at any of those sims (scoped to both sets).
      const completedKey = new Set<string>(); // "studentId:scenarioId"
      const pairs = await this.simulationReportRepo.findStudentScenarioPairsWithAttempts(
        studentRows.map((s) => s.id),
        [...new Set(aiSimRows.map((sim) => sim.simulation_id))],
      );
      for (const pair of pairs) completedKey.add(`${pair.studentId}:${pair.scenarioId}`);

      // Group student ids by class for O(1) lookup
      const studentIdsByClass = new Map<string, string[]>();
      for (const s of studentRows) {
        if (!studentIdsByClass.has(s.class_id)) studentIdsByClass.set(s.class_id, []);
        studentIdsByClass.get(s.class_id)!.push(s.id);
      }

      let unusedStudentSeats = 0;
      for (const sim of aiSimRows) {
        const studentIds = studentIdsByClass.get(sim.class_id) ?? [];
        const totalStudents = studentIds.length;
        if (totalStudents === 0) continue;
        const usedCount = studentIds.filter((id) =>
          completedKey.has(`${id}:${sim.simulation_id}`),
        ).length;
        unusedStudentSeats += Math.max(0, totalStudents - usedCount);
      }

      const totalRefund = remainingTokens + unusedStudentSeats;

      this.logger.log(
        `[remove] educator=${educator.id} remainingTokens=${remainingTokens} unusedStudentSeats=${unusedStudentSeats} totalRefund=${totalRefund}`,
      );

      if (totalRefund > 0 && educatorToDelete.districtAdminId) {
        const admin = await manager.findOne(DistrictAdmin, {
          where: { districtAdminId: educatorToDelete.districtAdminId },
        });

        if (admin) {
          const subscriptions = (admin.subscriptions as SubscriptionSummary[]) || [];
          if (subscriptions.length > 0) {
            const sortedSubs = [...subscriptions].sort(
              (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime(),
            );

            sortedSubs[0].seats_available = (sortedSubs[0].seats_available || 0) + totalRefund;

            admin.subscriptions = sortedSubs;

            await manager.save(DistrictAdmin, admin);
          }
        }
      }

      await manager.query(
        `UPDATE educators
       SET is_active = false, deleted_at = $1
       WHERE id = $2`,
        [now, educator.id],
      );

      if (educatorToDelete.userRoleId) {
        await manager.query(`UPDATE user_roles SET status = $1 WHERE user_role_id = $2`, [
          CommonStatus.INACTIVE,
          educatorToDelete.userRoleId,
        ]);
      }

      // A never-accepted invite would otherwise outlive the educator and block re-inviting
      // the same email with "A pending invitation for this email already exists".
      const educatorEmail = resolveEducatorEmail(educator);
      if (educatorEmail) {
        await manager.delete(Invite, {
          email: Raw((alias) => `LOWER(${alias}) = LOWER(:email)`, { email: educatorEmail }),
          status: InviteStatus.PENDING,
        });
      } else {
        this.logger.warn(
          `[remove] No resolvable email for educator ${educator.id}; any pending invite is left in place`,
        );
      }

      const classes = await manager.find(Class, {
        where: {
          educator: { id: educator.id },
          is_active: true,
        },
      });

      for (const cls of classes) {
        await manager.query(
          `UPDATE classes
         SET is_active = false, deleted_at = $1, status = $2
         WHERE id = $3`,
          [now, CommonStatus.INACTIVE, cls.id],
        );

        await manager.update(
          Student,
          { class: { id: cls.id } },
          {
            is_active: false,
            deleted_at: now,
            status: CommonStatus.INACTIVE,
          },
        );

        await manager.update(
          ClassSimulation,
          { class_id: cls.id, is_active: true },
          {
            is_active: false,
            deleted_at: now,
          },
        );
      }
    });

    void this.notificationsGateway.notifyAccountDeleted(educator.id);

    // Durable communication channel: the educator can no longer log in to see
    // an in-app notification, so account-deletion is communicated by email.
    const deletedEducatorIdentifier = resolveEducatorEmail(educator);
    if (deletedEducatorIdentifier) {
      const logoUrl = this.configService.get<string>('mail.logoUrl') || '';
      this.mailService
        .sendMail({
          to: deletedEducatorIdentifier,
          subject: 'Your Realityworks AI Account Has Been Deleted',
          template: 'account-deleted',
          context: {
            fullName: educator.full_name?.trim() || deletedEducatorIdentifier,
            logoUrl,
          },
          attachments: this.getLogoAttachments(),
        })
        .catch((error) => {
          this.logger.error(
            `Failed to send account-deleted email to ${deletedEducatorIdentifier}`,
            error,
          );
        });
    }

    return {
      success: true,
      message: EducatorConstants.MESSAGES.DELETED,
      data: null,
    };
  }

  private async sanitizeProfilePicture(value?: string): Promise<string> {
    if (!value || !value.startsWith('http')) return '';
    return this.azureBlobService.generateSasUrl(value);
  }

  async getProfile(id: string): Promise<
    ServiceResponse<{
      id: string;
      email: string | null;
      full_name: string | null;
      profile_picture: string;
      phone_number: string | null;
      tokens: number | null;
      google_classroom_enabled: boolean;
      schools: { id: string; school_name: string; google_classroom_enabled: boolean }[];
    }>
  > {
    this.logger.log(`[getProfile] Fetching profile for educator: ${id}`);
    const educator = await this.educatorRepo.findOne({
      where: { id },
      relations: { school: true, schoolAssignments: { school: true }, userRole: { user: true } },
    });
    if (!educator) {
      this.logger.warn(`[getProfile] Educator not found: ${id}`);
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    const sanitizedPicture = await this.sanitizeProfilePicture(educator.profile_picture);
    this.logger.log(
      `[getProfile] SUCCESS - educator: ${id}, profile_picture: ${sanitizedPicture ? 'present' : 'null'}`,
    );
    const schools = mapEducatorSchoolsForAuth(educator);
    return {
      success: true,
      message: EducatorConstants.MESSAGES.FETCHED,
      data: {
        id: educator.id,
        email: resolveEducatorEmail(educator),
        full_name: educator.full_name,
        profile_picture: sanitizedPicture ?? '',
        phone_number: educator.phone_number ?? null,
        tokens: educator.tokens ?? null,
        google_classroom_enabled: isGoogleClassroomEnabledForEducator(educator),
        schools,
      },
    };
  }

  async updateProfile(
    id: string,
    body: { full_name?: string; profile_picture_url?: string },
    file?: Express.Multer.File,
  ): Promise<
    ServiceResponse<{
      id: string;
      full_name: string | null;
      profile_picture?: string | null;
      tokens?: number | null;
    }>
  > {
    this.logger.log(`[updateProfile] Educator profile update initiated: ${id}`);
    this.logger.log(
      `[updateProfile] Request body - full_name: ${body.full_name ?? 'none'}, has_url: ${!!body.profile_picture_url}, has_file: ${!!file}`,
    );

    const educator = await this.educatorRepo.findOne({
      where: {
        id,
        is_active: true,
      },
      relations: { userRole: { user: true } },
    });
    if (!educator) {
      this.logger.warn(`[updateProfile] Educator not found or inactive: ${id}`);
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    try {
      if (body.full_name) {
        this.logger.log(
          `[updateProfile] Updating full_name: ${educator.full_name} → ${body.full_name}`,
        );
        educator.full_name = body.full_name;
      }

      if (file) {
        const ext = file.originalname.split('.').pop();
        const blobName = `profile-pictures/educator-${id}-${Date.now()}.${ext}`;
        this.logger.log(
          `[updateProfile] File upload initiated - name: ${file.originalname}, size: ${file.size} bytes, mime: ${file.mimetype}`,
        );
        this.logger.log(`[updateProfile] Blob name: ${blobName}`);

        const isAzureConfigured = this.azureBlobService.isConfigured();
        this.logger.log(`[updateProfile] Azure Blob configured: ${isAzureConfigured}`);

        if (isAzureConfigured) {
          try {
            this.logger.log(`[updateProfile] Starting Azure Blob upload...`);
            educator.profile_picture = await this.azureBlobService.uploadFile(
              file.buffer,
              blobName,
              file.mimetype,
            );
            this.logger.log(
              `[updateProfile] Azure upload SUCCESS - URL: ${educator.profile_picture}`,
            );
          } catch (uploadError) {
            this.logger.error(
              `[updateProfile] Azure uploadFile FAILED: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
            );
          }
        } else if (body.profile_picture_url?.startsWith('http')) {
          this.logger.warn(
            `[updateProfile] Azure not configured - using fallback URL: ${body.profile_picture_url}`,
          );
          educator.profile_picture = body.profile_picture_url;
        } else {
          this.logger.warn(
            `[updateProfile] Azure not configured and no fallback URL - profile picture unchanged`,
          );
        }
      } else if (body.profile_picture_url) {
        if (body.profile_picture_url.startsWith('blob:')) {
          this.logger.warn(
            `[updateProfile] Blob URL rejected (client-side URL): ${body.profile_picture_url}`,
          );
          return {
            success: false,
            message: 'Blob URLs are not valid. Upload the file directly.',
            type: ErrorTypes.BAD_REQUEST,
          };
        }
        if (body.profile_picture_url.startsWith('http')) {
          this.logger.log(
            `[updateProfile] Setting profile_picture from URL: ${body.profile_picture_url}`,
          );
          educator.profile_picture = body.profile_picture_url;
        }
      }

      this.logger.log(
        `[updateProfile] Saving educator record. profile_picture value: ${educator.profile_picture ?? 'null'}`,
      );
      await this.educatorRepo.create(educator);
      this.logger.log(`[updateProfile] Save successful for educator: ${id}`);

      if (body.full_name) {
        const identifier = resolveEducatorEmail(educator);
        const invite = identifier
          ? await this.inviteRepo.findOne({ where: { email: identifier } })
          : null;

        if (invite) {
          this.logger.log(`[updateProfile] Updating invite record for: ${identifier}`);
          invite.full_name = body.full_name;
          await this.inviteRepo.create(invite);
          this.logger.log(`[updateProfile] Invite record updated`);
        }
      }

      const sanitizedPicture = await this.sanitizeProfilePicture(educator.profile_picture);
      this.logger.log(
        `[updateProfile] SUCCESS - educator: ${id}, profile_picture: ${sanitizedPicture ? 'set' : 'null'}`,
      );

      return {
        success: true,
        message: EducatorConstants.MESSAGES.PROFILE_UPDATED,
        data: {
          id: educator.id,
          full_name: educator.full_name,
          profile_picture: sanitizedPicture ?? null,
        },
      };
    } catch (error) {
      this.logger.error(
        `[updateProfile] Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.error(`[updateProfile] Stack: ${error instanceof Error ? error.stack : 'n/a'}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update profile',
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    }
  }
  async removeSeats(
    educatorId: string,
    amount: number,
    adminId: string,
  ): Promise<ServiceResponse<{ remainingTokens: number }>> {
    if (!Number.isInteger(amount) || amount < 1) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.REMOVE_SEATS_AMOUNT_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    let remainingTokens = 0;

    try {
      await this.dataSource.transaction(async (manager) => {
        // Acquire pessimistic write lock to prevent concurrent double-removes
        const rows: Array<{ tokens: number | null; district_admin_id: string | null }> =
          await manager.query(
            `SELECT COALESCE(tokens::text::integer, 0) AS tokens, district_admin_id FROM educators WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
            [educatorId],
          );

        if (!rows.length || rows[0].district_admin_id !== adminId) {
          throw Object.assign(new Error(EducatorConstants.MESSAGES.NOT_FOUND), {
            type: ErrorTypes.NOT_FOUND,
          });
        }

        const available = Number(rows[0].tokens) || 0;
        if (amount > available) {
          throw Object.assign(
            new Error(EducatorConstants.MESSAGES.REMOVE_SEATS_EXCEEDS_AVAILABLE(available)),
            { type: ErrorTypes.BAD_REQUEST },
          );
        }

        await manager.query(
          `UPDATE educators SET tokens = to_json(COALESCE(tokens::text::integer, 0) - $1) WHERE id = $2`,
          [amount, educatorId],
        );
        remainingTokens = available - amount;

        // Refund seats to the admin's soonest-expiring subscription bucket
        const adminRows: Array<{ district_admin_id: string; subscriptions: unknown }> =
          await manager.query(
            `SELECT district_admin_id, subscriptions FROM district_admins WHERE district_admin_id = $1 FOR UPDATE`,
            [adminId],
          );

        if (adminRows.length > 0) {
          const subscriptions = (adminRows[0].subscriptions as SubscriptionSummary[]) || [];
          const sortedSubs = [...subscriptions].sort(
            (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime(),
          );
          if (sortedSubs.length > 0) {
            sortedSubs[0].seats_available = (sortedSubs[0].seats_available || 0) + amount;
            await manager.query(
              `UPDATE district_admins SET subscriptions = $1 WHERE district_admin_id = $2`,
              [JSON.stringify(sortedSubs), adminRows[0].district_admin_id],
            );
          }
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove seats';
      const errType = (err as { type?: string })?.type ?? ErrorTypes.BAD_REQUEST;
      return { success: false, message: msg, type: errType };
    }

    return {
      success: true,
      message: EducatorConstants.MESSAGES.REMOVE_SEATS_SUCCESS,
      data: { remainingTokens },
    };
  }

  async reallocateSeats(
    sourceEducatorId: string,
    targetEducatorId: string,
    amount: number,
    adminId: string,
  ): Promise<ServiceResponse<{ sourceRemainingTokens: number; targetRemainingTokens: number }>> {
    if (!Number.isInteger(amount) || amount < 1) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.REMOVE_SEATS_AMOUNT_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (sourceEducatorId === targetEducatorId) {
      return {
        success: false,
        message: EducatorConstants.MESSAGES.REALLOCATE_SEATS_SAME_EDUCATOR,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    let sourceRemainingTokens = 0;
    let targetRemainingTokens = 0;

    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock both rows in consistent UUID order to prevent deadlocks
        const [firstId, secondId] = [sourceEducatorId, targetEducatorId].sort();
        const rows: Array<{ id: string; tokens: number | null; district_admin_id: string | null }> =
          await manager.query(
            `SELECT id, COALESCE(tokens::text::integer, 0) AS tokens, district_admin_id FROM educators
             WHERE id IN ($1, $2) AND deleted_at IS NULL
             ORDER BY id FOR UPDATE`,
            [firstId, secondId],
          );

        const sourceRow = rows.find((r) => r.id === sourceEducatorId);
        const targetRow = rows.find((r) => r.id === targetEducatorId);

        if (!sourceRow || sourceRow.district_admin_id !== adminId) {
          throw Object.assign(new Error(EducatorConstants.MESSAGES.NOT_FOUND), {
            type: ErrorTypes.NOT_FOUND,
          });
        }
        if (!targetRow || targetRow.district_admin_id !== adminId) {
          throw Object.assign(
            new Error(EducatorConstants.MESSAGES.REALLOCATE_SEATS_TARGET_NOT_FOUND),
            { type: ErrorTypes.NOT_FOUND },
          );
        }

        const sourceAvailable = Number(sourceRow.tokens) || 0;
        if (amount > sourceAvailable) {
          throw Object.assign(
            new Error(
              EducatorConstants.MESSAGES.REALLOCATE_SEATS_EXCEEDS_AVAILABLE(sourceAvailable),
            ),
            { type: ErrorTypes.BAD_REQUEST },
          );
        }

        await manager.query(
          `UPDATE educators SET tokens = to_json(COALESCE(tokens::text::integer, 0) - $1) WHERE id = $2`,
          [amount, sourceEducatorId],
        );
        await manager.query(
          `UPDATE educators SET tokens = to_json(COALESCE(tokens::text::integer, 0) + $1) WHERE id = $2`,
          [amount, targetEducatorId],
        );

        sourceRemainingTokens = sourceAvailable - amount;
        targetRemainingTokens = (Number(targetRow.tokens) || 0) + amount;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reallocate seats';
      const errType = (err as { type?: string })?.type ?? ErrorTypes.BAD_REQUEST;
      return { success: false, message: msg, type: errType };
    }

    return {
      success: true,
      message: EducatorConstants.MESSAGES.REALLOCATE_SEATS_SUCCESS,
      data: { sourceRemainingTokens, targetRemainingTokens },
    };
  }

  async removeProfilePicture(
    id: string,
  ): Promise<ServiceResponse<{ id: string; profile_picture: null }>> {
    const educator = await this.educatorRepo.findOne({
      where: { id, is_active: true },
    });

    if (!educator) {
      this.logger.warn(`[removeProfilePicture] Educator not found or inactive: ${id}`);
      return {
        success: false,
        message: EducatorConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    if (educator.profile_picture && this.azureBlobService.isConfigured()) {
      try {
        const url = new URL(educator.profile_picture);
        const blobName = url.pathname.split('/').slice(2).join('/');
        await this.azureBlobService.deleteFile(blobName);
        this.logger.log(`[removeProfilePicture] Azure blob deleted: ${blobName}`);
      } catch (err) {
        this.logger.warn(
          `[removeProfilePicture] Failed to delete blob (continuing): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    educator.profile_picture = '';
    await this.educatorRepo.create(educator);

    this.logger.log(`[removeProfilePicture] Profile picture cleared for educator: ${id}`);

    return {
      success: true,
      message: EducatorConstants.MESSAGES.UPDATED,
      data: { id: educator.id, profile_picture: null },
    };
  }
}
