import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { DeepPartial } from 'typeorm';
import { LoggerService } from '../common/services';

import { CommonStatus } from 'src/common/enums/status.enum';
import { RoleSlug } from 'src/common/constants';
import { ResponseResult } from 'src/common/class/response.class';
import { EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { handleError } from 'src/common/utils/common.util';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { AUTH_MSG } from 'src/common/messages/auth.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';

import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { InvitesConstants } from './invites.constants';
import { EducatorConstants } from '../educators/educators.constants';
import { AuthConstants } from '../auth/auth.constants';
import { SubscriptionSummary } from 'src/common/types';
import { CreateInviteDto, InviteCreateResponse } from './dto/invites.dto';
import { AcceptInviteReqDto } from './dto/accept-invite.dto';
import { InviteTokenService } from './invite-token.service';
import { Invite, InviteStatus, User, Schools, Educator, Role } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  INVITE_REPOSITORY,
  ROLE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import {
  DistrictAdminRepository,
  EducatorRepository,
  EducatorSchoolRepository,
  InviteRepository,
  RoleRepository,
  SchoolsRepository,
  UserRepository,
  UserRoleRepository,
} from 'src/database/repositories';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';

@Injectable()
export class InvitesService {
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
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,

    @Inject(USER_REPOSITORY)
    private userRepo: UserRepository,

    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolRepo: SchoolsRepository,

    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,

    @Inject(EDUCATOR_SCHOOL_REPOSITORY)
    private readonly educatorSchoolRepo: EducatorSchoolRepository,

    @Inject(ROLE_REPOSITORY)
    private readonly roleRepo: RoleRepository,

    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepo: UserRoleRepository,

    @Inject(DISTRICT_ADMIN_REPOSITORY)
    private readonly districtAdminRepo: DistrictAdminRepository,

    private readonly mailerService: MailService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly notificationGateway: NotificationsGateway,
    private readonly inviteTokenService: InviteTokenService
  ) { }

  async findCreatorById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findSchoolByOwner(schoolId: string, ownerId: string): Promise<Schools | null> {
    return this.schoolRepo.findOne({
      where: { id: schoolId, user_id: { id: ownerId }, is_active: true },
    });
  }

  async findEducatorByEmail(email: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { userRole: { user: { email: email.trim().toLowerCase() } } },
      relations: ['school', 'admin', 'userRole', 'userRole.role'],
    });
  }

  async findPendingInviteByEmail(email: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({
      where: { email: email.trim().toLowerCase(), status: InviteStatus.PENDING },
    });
  }

  async findRoleByName(name: string): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { role_name: name } });
  }

  async findInviteById(id: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({
      where: { id },
      relations: ['school', 'createdBy'],
    });
  }

  async createInvite(
    dto: CreateInviteDto,
    creator: User,
    school: Schools,
    educatorV2Role: Role,
    existingEducator: Educator | null,
  ): Promise<ResponseResult<InviteCreateResponse>> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Determines the new user_roles link's initial status: an explicit INACTIVE invite creates
    // an INACTIVE role link, everything else starts PENDING until the invite is accepted.
    const userRoleStatus =
      dto.status === CommonStatus.INACTIVE ? CommonStatus.INACTIVE : CommonStatus.PENDING;

    // Validate the email up front, before any other work: resolve the v2 identity together
    // with its roles in one query, and reject a duplicate/ineligible invite immediately.
    const userV2 = await this.userRepo.findByEmailWithRoles(normalizedEmail);
    let userRoleId: string | undefined;

    // Fast path: an existing account whose only role (District Admin) is already ACTIVE, invited
    // with an explicit ACTIVE status in the body, skips the invite/accept flow entirely — it's
    // granted the Educator role as immediately usable, no acceptance step needed.
    let skipInvite = false;

    // Set when the account carries the INACTIVE role link of a deleted educator, to reuse below.
    let reusableEducatorRoleId: string | undefined;

    if (userV2) {
      // Every eligibility check here is scoped to this account's specific EDUCATOR user_roles
      // row (never `users.status`) — "already invited"/"already registered" are per-role facts.
      const existingEducatorRole = userV2.userRoles?.find(
        (userRole) => userRole.roleId === educatorV2Role.id,
      );

      if (existingEducatorRole?.status === CommonStatus.PENDING) {
        throw new BadRequestException(InvitesConstants.MESSAGES.USER_ALREADY_INVITED);
      }

      // Deleting an educator soft-deletes its `educators` row but leaves its EDUCATOR role link
      // behind as INACTIVE. With no live educator on it, that link is reused for the new invite
      // rather than treated as an existing registration.
      const reusableEducatorRole =
        existingEducatorRole?.status === CommonStatus.INACTIVE &&
        !(await this.educatorRepo.existsByUserRoleId(existingEducatorRole.userRoleId))
          ? existingEducatorRole
          : undefined;

      if (existingEducatorRole && !reusableEducatorRole) {
        throw new BadRequestException(InvitesConstants.MESSAGES.EDUCATOR_ALREADY_REGISTERED);
      }

      const existingRoleSlugs = (userV2.userRoles ?? [])
        .filter((userRole) => userRole !== reusableEducatorRole)
        .map((userRole) => userRole.role?.slug)
        .filter((slug): slug is string => !!slug);

      // Dual-role exception: an account can only be invited as an educator if District Admin is
      // its *only* existing role — this grants Educator as a dual role instead of blocking.
      const isDistrictAdminOnly =
        existingRoleSlugs.length === 1 && existingRoleSlugs.includes(RoleSlug.DISTRICT_ADMIN);
      const isDeletedEducatorOnly = existingRoleSlugs.length === 0 && !!reusableEducatorRole;

      if (!isDistrictAdminOnly && !isDeletedEducatorOnly) {
        throw new BadRequestException(InvitesConstants.MESSAGES.USER_EXISTS);
      }

      const existingDistrictAdminRole = userV2.userRoles?.find(
        (userRole) => userRole.role?.slug === RoleSlug.DISTRICT_ADMIN,
      );
      skipInvite = existingDistrictAdminRole?.status === CommonStatus.ACTIVE;
      reusableEducatorRoleId = reusableEducatorRole?.userRoleId;
    }

    const creatorDistrictAdminRole = await this.userRoleRepo.findByUserAndRoleSlug(
      creator.id,
      RoleSlug.DISTRICT_ADMIN,
    );
    const creatorDistrictAdmin = creatorDistrictAdminRole
      ? await this.districtAdminRepo.findByUserRoleId(creatorDistrictAdminRole.userRoleId)
      : null;
    const creatorFullName = creatorDistrictAdmin?.fullName ?? null;

    if (dto.tokens) {
      // Both the role assignment AND its district_admins profile must exist — without the
      // profile there are no subscriptions to draw seats from, and reporting that as
      // "0 seats available" would misattribute a missing-record bug to an exhausted license.
      if (!creatorDistrictAdminRole || !creatorDistrictAdmin) {
        throw new BadRequestException(EducatorConstants.MESSAGES.ADMIN_NOT_FOUND);
      }
      const subscriptions = (creatorDistrictAdmin.subscriptions as SubscriptionSummary[]) || [];
      const sortedSubs = [...subscriptions].sort(
        (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime(),
      );
      const totalAvailable = sortedSubs.reduce((sum, sub) => sum + (sub.seats_available || 0), 0);

      if (totalAvailable < dto.tokens) {
        throw new BadRequestException(
          InvitesConstants.MESSAGES.INSUFFICIENT_SEATS(totalAvailable, dto.tokens),
        );
      }

      let tokensRemaining = dto.tokens;
      for (const sub of sortedSubs) {
        if (tokensRemaining <= 0) break;
        const available = sub.seats_available || 0;
        if (available <= 0) continue;
        const deduct = Math.min(available, tokensRemaining);
        sub.seats_available = available - deduct;
        tokensRemaining -= deduct;
      }

      await this.districtAdminRepo.updateByUserRoleId(creatorDistrictAdminRole.userRoleId, {
        subscriptions: sortedSubs,
      });
    }

    // Resolve or create the identity for this invite — an educator's identity and credentials
    // live solely on the linked `users` row; `educators.email`/`.password` are unmapped.
    // Written only after every check above has passed: a rejected invite (e.g. insufficient
    // seats) must not leave a PENDING role behind, or each retry fails as "already invited".
    if (!userV2) {
      const created = await this.userRepo.createInvitedAccount({
        email: normalizedEmail,
        roleId: educatorV2Role.id,
        roleStatus: userRoleStatus,
      });
      userRoleId = created.userRoleId;
    } else {
      const grantedStatus = skipInvite ? CommonStatus.ACTIVE : userRoleStatus;
      if (reusableEducatorRoleId) {
        await this.userRoleRepo.updateStatus(reusableEducatorRoleId, grantedStatus);
        userRoleId = reusableEducatorRoleId;
      } else {
        const grantedUserRole = await this.userRoleRepo.create({
          userId: userV2.id,
          roleId: educatorV2Role.id,
          status: grantedStatus,
        });
        userRoleId = grantedUserRole.userRoleId;
      }
    }

    if (!userRoleId) {
      throw new BadRequestException(InvitesConstants.MESSAGES.ROLE_NOT_FOUND);
    }

    // Prefer a row already linked to this specific EDUCATOR user_roles row (re-invite);
    // otherwise fall back to a legacy row matched by email (first-time migration of an
    // existing educator onto v2).
    const existingEducatorByUser = await this.educatorRepo.findOne({
      where: { userRoleId },
    });
    const targetEducator = existingEducatorByUser ?? existingEducator ?? null;

    const educatorData: DeepPartial<Educator> = {
      full_name: dto.full_name?.trim() ?? targetEducator?.full_name ?? undefined,
      school: { id: school.id },
      phone_number: dto.phone_number ?? targetEducator?.phone_number ?? undefined,
      // The FK is `educators.district_admin_id -> district_admins.district_admin_id`, so it must
      // be set from the DistrictAdmin's own PK. Assigning the relation by `userRoleId` (its
      // unique FK to user_roles, not its PK) leaves TypeORM unable to resolve the FK at all.
      districtAdminId: creatorDistrictAdmin?.districtAdminId ?? null,
      tokens: dto.tokens ?? targetEducator?.tokens ?? 0,
      userRoleId,
    };

    let savedEducator = targetEducator
      ? await this.educatorRepo.create({ ...targetEducator, ...educatorData })
      : await this.educatorRepo.create(educatorData);

    if (!savedEducator) {
      throw new BadRequestException('Failed to create or retrieve educator');
    }

    // Fast-path activation: no invite to accept, so apply the same
    // status/is_active flip acceptInvite applies on acceptance, right now instead.
    if (skipInvite) {
      savedEducator.is_active = true;
      savedEducator = await this.educatorRepo.create(savedEducator);
      await this.userRoleRepo.update(
        { userRoleId },
        { status: CommonStatus.ACTIVE },
      );
    }

    // Ensure a junction row exists in educator_schools for this invite's school.
    // This is idempotent: if the row already exists (re-invite scenario) it is
    // not duplicated.  The first school assigned to an educator becomes primary.
    const existingJunctionCount = await this.educatorSchoolRepo.count({
      where: { educator: { id: savedEducator.id } },
    });
    const isPrimary = existingJunctionCount === 0;
    await this.educatorSchoolRepo.upsert(
      [{ educator: { id: savedEducator.id }, school: { id: school.id }, is_primary: isPrimary }],
      ['educator', 'school'],
    );

    await this.inviteRepo.deleteByEmail(normalizedEmail);

    if (skipInvite) {
      return new ResponseResult({
        message: InvitesConstants.MESSAGES.EDUCATOR_ACTIVATED,
        data: { invite: null, educator: savedEducator },
      });
    }

    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

    const savedInvite = await this.inviteRepo.create({
      full_name: dto.full_name?.trim() ?? undefined,
      email: normalizedEmail,
      school,
      createdBy: creator,
      status: InviteStatus.PENDING,
      expires_at,
    });

    const inviteToken = this.inviteTokenService.issue(savedInvite.id);
    const inviteUrl = this.inviteTokenService.buildInviteUrl(inviteToken);
    const logoUrl = this.configService.get<string>('mail.logoUrl') || '';

    if (dto.status !== CommonStatus.INACTIVE) {
      await this.mailerService
        .sendMail({
          to: dto.email,
          subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
          template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
          context: {
            fullName: dto.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
            creatorName: creatorFullName || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
            schoolName: school.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
            inviteUrl,
            logoUrl,
            expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
          },
          attachments: this.getLogoAttachments(),
        })
        .catch((error: unknown) => {
          this.logger.error({
            topic: 'InvitesService',
            subTopic: 'createInvite',
            operation: InvitesConstants.LOG.EMAIL_SEND_FAILED,
            error,
          });
        });
    }

    const message =
      dto.status !== CommonStatus.INACTIVE
        ? EducatorConstants.MESSAGES.CREATED
        : InvitesConstants.MESSAGES.INVITE_SENT;

    return new ResponseResult({
      message,
      data: { invite: savedInvite, educator: savedEducator },
    });
  }

  /** Flips the legacy Invite row's own status/lifecycle fields to accepted. */
  async markInviteAccepted(invite: Invite): Promise<Invite> {
    invite.status = InviteStatus.ACCEPTED;
    invite.is_active = false;
    invite.deleted_at = new Date();
    await this.inviteRepo.create(invite);
    return invite;
  }

  /**
   * Accept-invite — validates the legacy Invite row (still the source of truth for
   * expiry/status), sets the linked account's password and flips it from PENDING to
   * ACTIVE, activates the linked Educator row and marks the invite accepted. No session is
   * issued — the client signs in through the normal login flow afterwards.
   */
  async acceptInvite(dto: AcceptInviteReqDto): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const invite = await this.inviteTokenService.resolve(dto.token);

      const educatorRole = await this.roleRepo.findBySlug(RoleSlug.EDUCATOR);
      if (!educatorRole) {
        throw new BadRequestException(ERROR_MSG.DB.NOT_FOUND('Role'));
      }

      const email = invite.email.trim().toLowerCase();
      const user = await this.userRepo.findByEmailWithRoles(email);
      const educatorUserRole = user?.userRoles?.find(
        (userRole) => userRole.roleId === educatorRole.id,
      );
      if (!user || educatorUserRole?.status !== CommonStatus.PENDING) {
        throw new BadRequestException(AUTH_MSG.INVITE_ACCOUNT_NOT_ELIGIBLE);
      }

      const hashedPassword = await bcrypt.hash(dto.password, AuthConstants.SALT_ROUNDS);
      const educator = await this.inviteRepo.acceptInvite({
        inviteId: invite.id,
        userId: user.id,
        roleId: educatorRole.id,
        userRoleId: educatorUserRole.userRoleId,
        hashedPassword,
      });

      try {
        if (educator?.districtAdminId) {
          void this.notificationGateway.notifyAdminEducatorInvitationAccepted(
            educator?.admin?.userRole?.userId as string,
            educator.id,
            educator.full_name as string,
            new Date().toISOString(),
          );
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          `Failed to notify admin ${educator?.admin?.userRole?.userId} of educator invitation acceptance`,
          errorMessage,
        );
      }

      return new ResponseResult({ message: SUCCESS_MSG.COMMON.OK });
    } catch (error) {
      return handleError(error);
    }
  }

  async getInviteDetails(invite: Invite)
  // : Promise<ServiceResponse<VerifyInviteTokenResDto>> 
  {
    // `Educator.email` no longer exists — resolve via the linked v2 identity's EDUCATOR
    // user_roles row instead.
    const normalizedEmail = invite.email.trim().toLowerCase();
    const userV2 = await this.userRepo.findByEmailWithRoles(normalizedEmail);
    const educatorUserRoleId = userV2?.userRoles?.find(
      (userRole) => userRole.role?.slug === RoleSlug.EDUCATOR,
    )?.userRoleId;
    const educator = educatorUserRoleId
      ? await this.educatorRepo.findOne({ where: { userRoleId: educatorUserRoleId } })
      : null;

    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.OK,
      data: { email: invite.email, full_name: educator?.full_name || '' },
    });

  }
}
