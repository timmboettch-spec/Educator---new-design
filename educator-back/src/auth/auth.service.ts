import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RedemptionsService } from '../users/redemptions.service';
import { Messages, ErrorTypes } from '../common/utils/messages';
import { AuthConstants } from './auth.constants';
import { ServiceResponse, SubscriptionSummary } from 'src/common/types';
import { InvitesService } from '../invites/invites.service';
import { InvitesConstants } from '../invites/invites.constants';
import { InviteStatus } from '../invites/entity/invite.entity';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSchool } from '../educators/entity/educator-school.entity';
import {
  educatorBelongsToSchool,
  getEducatorSchoolIds as collectEducatorSchoolIds,
} from '../educators/utils/educator-school.util';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Role } from 'src/roles/entity/role.entity';
import {
  SignupDto,
  LoginDto,
  RedeemDto,
  ResendOtpDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  DecodedOtpToken,
} from './dto/auth.dto';
import {
  JwtPayload,
  OtpTokenPayload,
  ResetTokenPayload,
} from 'src/common/strategy/jwt.strategy.entity';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { User } from 'src/users/entity/user.entity';
import { Schools } from 'src/schools/entity/schools.entity';
import { CsrfService } from '../csrf/csrf.service';
import { AzureBlobService } from 'src/config/azure-blob.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly redemptionsService: RedemptionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly invitesService: InvitesService,
    private readonly mailerService: MailService,
    private readonly blacklistService: TokenBlacklistService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tutorPatientService: TutorPatientService,
    private readonly csrfService: CsrfService,
    private readonly dataSource: DataSource,
    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,
    @InjectRepository(EducatorSchool)
    private readonly educatorSchoolRepo: Repository<EducatorSchool>,
    @InjectRepository(Schools)
    private readonly schoolsRepo: Repository<Schools>,
    private readonly azureBlobService: AzureBlobService,
  ) { }
  async findEducatorByEmail(email: string): Promise<Educator | null> {
    const normalizedEmail = email.trim().toLowerCase();
    let educator = await this.educatorRepo.findOne({
      where: { email: normalizedEmail },
      relations: { school: true, admin: true, schoolAssignments: { school: true } },
    });

    if (!educator) {
      const [localPart, domainPart] = normalizedEmail.split('@');
      if (localPart && domainPart && localPart.includes('+')) {
        const canonicalEmail = `${localPart.split('+')[0]}@${domainPart}`;
        educator = await this.educatorRepo.findOne({
          where: { email: canonicalEmail },
          relations: { school: true, admin: true, schoolAssignments: { school: true } },
        });
      }
    }

    return educator;
  }

  getEducatorSchoolIds(educator: Educator): string[] {
    return collectEducatorSchoolIds(educator);
  }

  private async ensureEducatorSchoolAssignment(
    educatorId: string,
    schoolId: string,
  ): Promise<void> {
    const existing = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
    if (existing) {
      return;
    }

    const assignmentCount = await this.educatorSchoolRepo.count({
      where: { educator: { id: educatorId } },
    });

    await this.educatorSchoolRepo.save(
      this.educatorSchoolRepo.create({
        educator: { id: educatorId } as Educator,
        school: { id: schoolId } as Schools,
        is_primary: assignmentCount === 0,
      }),
    );
  }

  private async buildLtiSuccessResponse(
    educator: Educator,
    expiresIn: string,
  ): Promise<ServiceResponse> {
    const accessToken = this.jwtService.sign(
      {
        sub: educator.id,
        email: educator.email,
        type: AuthConstants.TOKEN_TYPE.EDUCATOR,
        roles: ['Educator'],
        adminId: educator.admin?.id ?? null,
        tokens: educator.tokens ?? null,
      } as JwtPayload,
      { expiresIn: expiresIn as '1d' },
    );

    const totalTokens = educator.allocated_tokens ?? educator.tokens ?? 0;
    const csrfToken = await this.csrfService.generateToken();

    const primarySchool = educator.school ?? null;
    const allSchools =
      educator.schoolAssignments?.map((sa) => ({
        id: sa.school.id,
        school_name: sa.school.school_name,
        lms_enabled: sa.school.lms_enabled ?? false,
      })) ?? [];

    return {
      success: true,
      data: {
        tokens: { accessToken, csrfToken },
        user: {
          id: educator.id,
          email: educator.email,
          full_name: educator.full_name,
          status: educator.status,
          phone_number: educator.phone_number,
          total_tokens: totalTokens,
          tokens: educator.tokens ?? 0,
          profile_picture: await this.sanitizeProfilePicture(educator.profile_picture ?? ''),
          role: InvitesConstants.ROLES.EDUCATOR,
          lms_enabled: educator.lms_enabled ?? false,
          school: primarySchool
            ? {
                id: primarySchool.id,
                school_name: primarySchool.school_name,
                lms_enabled: primarySchool.lms_enabled ?? false,
              }
            : null,
          schools: allSchools,
        },
      },
    };
  }

  private buildSubscriptionSummary(
    lines: Array<Record<string, unknown>>,
    redeemCode: string,
    index: number,
  ): SubscriptionSummary | null {
    if (!lines.length) return null;

    const netsuite_id = (lines[0]['so'] as string) || 'N/A';
    const now = new Date();
    const startDate = now.toISOString();

    const expiry = new Date(now);
    expiry.setFullYear(now.getFullYear() + AuthConstants.LICENSE_EXPIRY_YEARS);
    const endDate = expiry.toISOString();

    let aiSeats = 0;
    const simGroups = new Set<string>();
    const productNames = new Set<string>();
    const ais = new Set<string>();
    const platforms = new Set<string>();
    const devices: string[] = [];
    let hasHardware = false;

    for (const line of lines) {
      const seats = Number(line.ai_seats || 0);
      const qty = Number(line.qty || 1);

      if (line.product_name) productNames.add(line.product_name as string);
      if (line.ai) ais.add(line.ai as string);
      if (line.platform) platforms.add(line.platform as string);

      aiSeats += seats;

      if (line.sim_group && line.sim_group !== null) {
        simGroups.add(line.sim_group as string);
      }

      if (line.type === 'Hardware') {
        hasHardware = true;
        devices.push(`${qty} ${(line.product_name as string) ?? ''}`);
      }
    }

    let hwSupportUntil: string | null = null;
    if (hasHardware) {
      const hwSupportDate = new Date(now);
      hwSupportDate.setFullYear(hwSupportDate.getFullYear() + 4);
      hwSupportUntil = hwSupportDate.toISOString();
    }

    return {
      index,
      redeem_code: redeemCode,
      netsuite_id,
      start: startDate,
      end: endDate,
      product_name: Array.from(productNames),
      ai: Array.from(ais),
      platform: Array.from(platforms),
      ai_seats: aiSeats,
      seats_available: aiSeats,
      ai_simulation_groups: Array.from(simGroups),
      devices_registered: devices,
      hw_support_until: hwSupportUntil,
    };
  }

  async signup(dto: SignupDto): Promise<ServiceResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (dto.invite_id) {
      const inviteEntity = await this.invitesService.findInviteById(dto.invite_id);
      if (!inviteEntity) {
        throw new BadRequestException(InvitesConstants.MESSAGES.INVALID_OR_EXPIRED);
      }

      if (!inviteEntity.expires_at || new Date() > new Date(inviteEntity.expires_at)) {
        throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXPIRED);
      }

      if (inviteEntity.email.toLowerCase() !== normalizedEmail) {
        throw new BadRequestException(AuthConstants.MESSAGES.INVITE_EMAIL_MISMATCH);
      }

      const educator = await this.educatorRepo.findOne({
        where: { email: normalizedEmail },
        relations: { school: true, admin: true, schoolAssignments: { school: true } },
      });

      if (!educator) {
        return {
          success: false,
          message: AuthConstants.MESSAGES.EDUCATOR_RECORD_NOT_FOUND,
        };
      }

      if (!educator.is_active) {
        return {
          success: false,
          message: AuthConstants.MESSAGES.INVITE_ALREADY_USED,
        };
      }

      const isPending = educator.status === CommonStatus.PENDING;
      const isActiveWithPendingInvite =
        educator.status === CommonStatus.ACTIVE &&
        !educator.password &&
        inviteEntity.status === InviteStatus.PENDING;

      if (!isPending && !isActiveWithPendingInvite) {
        return {
          success: false,
          message: AuthConstants.MESSAGES.INVITE_ALREADY_USED,
        };
      }

      await this.invitesService.acceptInvite(inviteEntity);

      const hashedPassword = dto.password
        ? await bcrypt.hash(dto.password, AuthConstants.SALT_ROUNDS)
        : null;

      educator.password = hashedPassword;
      educator.full_name = dto.full_name?.trim() ?? educator.full_name;
      educator.phone_number = dto.phone_number?.trim() || educator.phone_number;
      educator.status = CommonStatus.ACTIVE;
      await this.educatorRepo.save(educator);

      if (hashedPassword) {
        const existingAdmin = await this.usersService.findByEmail(educator.email);
        if (existingAdmin) {
          await this.usersService.updateByEmail(educator.email, { password: hashedPassword });
        }
      }

      try {
        if (educator.admin?.id) {
          void this.notificationsGateway.notifyAdminEducatorInvitationAccepted(
            educator.admin.id,
            educator.id,
            educator.full_name,
            new Date().toISOString(),
          );
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          `Failed to notify admin ${educator.admin?.id} of educator invitation acceptance`,
          errorMessage,
        );
      }

      const accessToken = this.jwtService.sign(
        {
          sub: educator.id,
          email: educator.email,
          type: AuthConstants.TOKEN_TYPE.EDUCATOR,
          roles: ['Educator'],
          adminId: educator.admin?.id ?? null,
        } as JwtPayload,
        { expiresIn: AuthConstants.DEFAULT_JWT_EXPIRES as '1d' },
      );

      return {
        success: true,
        message: AuthConstants.MESSAGES.EDUCATOR_REGISTERED,
        data: {
          id: educator.id,
          email: educator.email,
          full_name: educator.full_name,
          phone_number: educator.phone_number,
          tokens: educator.tokens,
          status: educator.status,
          access_token: accessToken,
        },
      };
    }

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    const existingEducator = await this.educatorRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return { success: false, message: Messages.USER_EXISTS };
    }

    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, AuthConstants.SALT_ROUNDS)
      : undefined;

    const savedUser = await this.usersService.createUser({
      email: normalizedEmail,
      password: hashedPassword,
      full_name: dto.full_name?.trim() ?? '',
      status: dto.status,
      role_id: dto.role_id,
    });

    if (!savedUser) {
      return { success: false, message: Messages.FAILED_TO_SAVE_USER };
    }

    if (hashedPassword && existingEducator) {
      try {
        existingEducator.password = hashedPassword;
        await this.educatorRepo.save(existingEducator);
      } catch (err) {
        this.logger.warn(
          `[signup] Failed to sync password to educator ${existingEducator.id}: ${(err as Error).message}`,
        );
      }
    }

    const accessToken = this.jwtService.sign(
      {
        sub: savedUser.id,
        email: savedUser.email,
        type: AuthConstants.TOKEN_TYPE.ADMIN,
        roles: [savedUser.role?.role_name].filter(Boolean),
      } as JwtPayload,
      { expiresIn: AuthConstants.DEFAULT_JWT_EXPIRES as '1d' },
    );

    return {
      success: true,
      message: AuthConstants.MESSAGES.ADMIN_REGISTERED,
      data: {
        id: savedUser.id,
        email: savedUser.email,
        full_name: savedUser.full_name,
        status: savedUser.status,
        is_license_active: savedUser.is_license_active,
        subscriptions: savedUser.subscriptions || [],
        access_token: accessToken,
      },
    };
  }

  async dualsignup(dto: SignupDto): Promise<ServiceResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (!dto.invite_id) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.INVALID_INVITE_ID,
      };
    }

    const inviteEntity = await this.invitesService.findInviteById(dto.invite_id);

    if (!inviteEntity) {
      throw new BadRequestException(InvitesConstants.MESSAGES.INVALID_OR_EXPIRED);
    }

    if (!inviteEntity.expires_at || new Date() > new Date(inviteEntity.expires_at)) {
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXPIRED);
    }

    if (inviteEntity.email.toLowerCase() !== normalizedEmail) {
      throw new BadRequestException(AuthConstants.MESSAGES.INVITE_EMAIL_MISMATCH);
    }

    const educator = await this.educatorRepo.findOne({
      where: { email: normalizedEmail },
      relations: {
        school: true,
        admin: true,
        schoolAssignments: { school: true },
      },
    });

    if (!educator) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.EDUCATOR_RECORD_NOT_FOUND,
      };
    }

    const existingAdmin = await this.usersService.findByEmail(normalizedEmail);

    if (!existingAdmin) {
      return {
        success: false,
        message: Messages.USER_NOT_FOUND,
      };
    }

    if (!educator.is_active) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.INVITE_ALREADY_USED,
      };
    }

    const isPending = educator.status === CommonStatus.PENDING;

    const isActiveWithPendingInvite =
      educator.status === CommonStatus.ACTIVE &&
      !educator.password &&
      inviteEntity.status === InviteStatus.PENDING;

    if (!isPending && !isActiveWithPendingInvite) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.INVITE_ALREADY_USED,
      };
    }

    await this.invitesService.acceptInvite(inviteEntity);

    educator.password = existingAdmin.password;
    educator.full_name = dto.full_name?.trim() ?? educator.full_name;
    educator.phone_number = dto.phone_number?.trim() || educator.phone_number;
    educator.status = CommonStatus.ACTIVE;

    await this.educatorRepo.save(educator);

    try {
      if (educator.admin?.id) {
        void this.notificationsGateway.notifyAdminEducatorInvitationAccepted(
          educator.admin.id,
          educator.id,
          educator.full_name,
          new Date().toISOString(),
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.stack : String(error);

      this.logger.error(
        `Failed to notify admin ${educator.admin?.id} of educator invitation acceptance`,
        errorMessage,
      );
    }

    const accessToken = this.jwtService.sign(
      {
        sub: educator.id,
        email: educator.email,
        type: AuthConstants.TOKEN_TYPE.EDUCATOR,
        roles: ['Educator'],
        adminId: educator.admin?.id ?? null,
      } as JwtPayload,
      {
        expiresIn: AuthConstants.DEFAULT_JWT_EXPIRES as '1d',
      },
    );

    const adminAccessToken = this.jwtService.sign(
      {
        sub: existingAdmin.id,
        email: existingAdmin.email,
        type: AuthConstants.TOKEN_TYPE.ADMIN,
        roles: ['Admin'],
      } as JwtPayload,
      {
        expiresIn: AuthConstants.DEFAULT_JWT_EXPIRES as '1d',
      },
    );

    return {
      success: true,
      message: AuthConstants.MESSAGES.EDUCATOR_REGISTERED,
      data: {
        has_dual_role: true,

        tokens: {
          accessToken: adminAccessToken,
          csrfToken: '',
        },

        user: {
          id: existingAdmin.id,
          email: existingAdmin.email,
          full_name: existingAdmin.full_name,
          role: 'Admin',
          is_license_active: existingAdmin.is_license_active,
        },

        educator_tokens: {
          accessToken,
          csrfToken: '',
        },

        educator_user: {
          id: educator.id,
          email: educator.email,
          full_name: educator.full_name,
          phone_number: educator.phone_number,
          tokens: educator.tokens,
          status: educator.status,
          role: 'Educator',
        },
      },
    };
  }

  async ltiLogin(
    email: string,
    schoolId?: string | null,
    preloadedEducator?: Educator | null,
  ): Promise<ServiceResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? AuthConstants.DEFAULT_JWT_EXPIRES;
    let educator =
      preloadedEducator ??
      (await this.educatorRepo.findOne({
        where: { email: normalizedEmail },
        relations: { school: true, admin: true, schoolAssignments: { school: true } },
      }));

    if (!educator) {
      const [localPart, domainPart] = normalizedEmail.split('@');
      if (localPart && domainPart && localPart.includes('+')) {
        const canonicalEmail = `${localPart.split('+')[0]}@${domainPart}`;
        educator = await this.educatorRepo.findOne({
          where: { email: canonicalEmail },
          relations: { school: true, admin: true, schoolAssignments: { school: true } },
        });
      }
    }

    if (
      educator &&
      educator.is_active &&
      educator.status === CommonStatus.PENDING &&
      !educator.password
    ) {
      educator.status = CommonStatus.ACTIVE;
      educator.lms_enabled = true;
      educator = await this.educatorRepo.save(educator);
    }

    if (educator && educator.is_active && educator.status === CommonStatus.ACTIVE) {
      const lmsSchoolId = schoolId?.trim();
      if (lmsSchoolId && !educatorBelongsToSchool(educator, lmsSchoolId)) {
        this.logger.warn(
          `[ltiLogin] Educator ${educator.id} (${normalizedEmail}) not assigned to LMS school ${lmsSchoolId}`,
        );
        return {
          success: false,
          message: AuthConstants.LTI.SCHOOL_MISMATCH,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      return await this.buildLtiSuccessResponse(educator, expiresIn);
    }
    return {
      success: false,
      message: Messages.USER_NOT_FOUND,
      type: ErrorTypes.UNAUTHORIZED,
    };
  }

  async ltiLoginOrCreate(
    email: string,
    opts: {
      fullName?: string | null;
      issuer?: string | null;
      schoolId?: string | null;
      schoolName?: string | null;
    } = {},
  ): Promise<ServiceResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? AuthConstants.DEFAULT_JWT_EXPIRES;

    const schoolId = opts.schoolId?.trim() ?? null;
    if (!schoolId) {
      return {
        success: false,
        message: AuthConstants.LTI.SCHOOL_NOT_CONFIGURED,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }

    const school = await this.schoolsRepo.findOne({
      where: { id: schoolId },
      relations: { user_id: true },
    });
    if (!school) {
      this.logger.warn(
        `[ltiLoginOrCreate] LMS config references missing school ${schoolId} for ${normalizedEmail}`,
      );
      return {
        success: false,
        message: AuthConstants.LTI.SCHOOL_RECORD_MISSING,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }

    const schoolAdmin = school.user_id ?? null;

    let educator = await this.educatorRepo.findOne({
      where: { email: normalizedEmail },
      relations: ['school', 'admin', 'role', 'schoolAssignments', 'schoolAssignments.school'],
    });

    const educatorRole = await this.dataSource.manager.findOne(Role, {
      where: { role_name: 'Educator' },
    });

    if (!educator) {
      const newEducator = this.educatorRepo.create({
        email: normalizedEmail,
        full_name: opts.fullName?.trim() || null,
        password: null,
        status: CommonStatus.ACTIVE,
        is_active: true,
        lms_enabled: true,
        tokens: 0,
        allocated_tokens: 0,
        school,
        role: educatorRole ?? null,
        admin: schoolAdmin,
      });
      educator = await this.educatorRepo.save(newEducator);
      await this.ensureEducatorSchoolAssignment(educator.id, schoolId);
      educator.school = school;
      educator.admin = schoolAdmin;
      educator.role = educatorRole ?? null;
      this.logger.log(
        `[ltiLoginOrCreate] Created new educator: ${educator.id} (${normalizedEmail}) for school ${schoolId}`,
      );
    } else {
      if (!educatorBelongsToSchool(educator, schoolId)) {
        this.logger.warn(
          `[ltiLoginOrCreate] Educator ${educator.id} (${normalizedEmail}) not assigned to LMS school ${schoolId}`,
        );
        return {
          success: false,
          message: AuthConstants.LTI.SCHOOL_MISMATCH,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      let changed = false;

      if (!educator.is_active) {
        educator.is_active = true;
        changed = true;
      }
      if (educator.status !== CommonStatus.ACTIVE) {
        educator.status = CommonStatus.ACTIVE;
        changed = true;
      }
      if (!educator.lms_enabled) {
        educator.lms_enabled = true;
        changed = true;
      }
      if (!educator.role && educatorRole) {
        educator.role = educatorRole;
        changed = true;
      }
      if (!educator.admin && schoolAdmin) {
        educator.admin = schoolAdmin;
        changed = true;
      }
      if (changed) {
        educator = await this.educatorRepo.save(educator);
      }

      await this.ensureEducatorSchoolAssignment(educator.id, schoolId);
    }

    return await this.buildLtiSuccessResponse(educator, expiresIn);
  }

  async ltiLoginByCourseFallback(
    lmsCourseId: string,
    schoolId?: string | null,
  ): Promise<ServiceResponse> {
    const courseId = lmsCourseId.trim();
    if (!courseId) {
      return {
        success: false,
        message: Messages.USER_NOT_FOUND,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }

    const qb = this.dataSource
      .createQueryBuilder()
      .select('c.educator_id', 'educatorId')
      .from('lms_class_mapping', 'm')
      .innerJoin('classes', 'c', 'c.id = m.class_id')
      .where('m.lms_course_id = :courseId', { courseId })
      .andWhere('c.is_active = true');

    if (schoolId?.trim()) {
      qb.andWhere('m.school_id = :schoolId', { schoolId: schoolId.trim() });
    }

    const rows = await qb.getRawMany<{ educatorId: string }>();
    const educatorIds = Array.from(new Set(rows.map((r) => r.educatorId).filter(Boolean)));

    if (educatorIds.length !== 1) {
      return {
        success: false,
        message: Messages.USER_NOT_FOUND,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }

    const educator = await this.educatorRepo.findOne({
      where: {
        id: educatorIds[0],
        is_active: true,
        status: CommonStatus.ACTIVE,
      },
      relations: { school: true, admin: true, schoolAssignments: { school: true } },
    });

    if (!educator) {
      return {
        success: false,
        message: Messages.USER_NOT_FOUND,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }
    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? AuthConstants.DEFAULT_JWT_EXPIRES;
    return await this.buildLtiSuccessResponse(educator, expiresIn);
  }

  private async sanitizeProfilePicture(value?: string): Promise<string> {
    if (!value || !value.startsWith('http')) return '';
    return this.azureBlobService.generateSasUrl(value);
  }

  async login(dto: LoginDto): Promise<ServiceResponse> {
    const { email, password } = dto;
    const normalizedEmail = email.trim().toLowerCase();
    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? AuthConstants.DEFAULT_JWT_EXPIRES;

    const user = await this.usersService.findByEmail(normalizedEmail);

    if (user) {
      const isPasswordValid = user.password.startsWith(AuthConstants.BCRYPT_PREFIX)
        ? await bcrypt.compare(password, user.password)
        : password === user.password;

      if (isPasswordValid) {
        const adminToken = this.jwtService.sign(
          {
            sub: user.id,
            email: user.email,
            type: AuthConstants.TOKEN_TYPE.ADMIN,
            roles: [user.role?.role_name].filter(Boolean),
          } as JwtPayload,
          { expiresIn: expiresIn as typeof AuthConstants.DEFAULT_JWT_EXPIRES },
        );

        const adminUserPayload = {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          status: user.status,
          is_license_active: user.is_license_active,
          profile_picture: await this.sanitizeProfilePicture(user.profile_picture ?? ''),
          role: user.role?.role_name,
          subscriptions: user.subscriptions || [],
        };

        const dualEducator = await this.educatorRepo.findOne({
          where: { email: normalizedEmail, is_active: true, status: CommonStatus.ACTIVE },
          relations: ['school', 'admin'],
        });

        const educatorPasswordValid =
          !!dualEducator?.password &&
          (dualEducator.password.startsWith(AuthConstants.BCRYPT_PREFIX)
            ? await bcrypt.compare(password, dualEducator.password)
            : password === dualEducator.password);

        if (dualEducator && educatorPasswordValid) {
          const educatorToken = this.jwtService.sign(
            {
              sub: dualEducator.id,
              email: dualEducator.email,
              type: AuthConstants.TOKEN_TYPE.EDUCATOR,
              roles: ['Educator'],
              adminId: dualEducator.admin?.id ?? null,
              tokens: dualEducator.tokens ?? null,
            } as JwtPayload,
            { expiresIn: expiresIn as '1d' },
          );

          const totalTokens = dualEducator.allocated_tokens ?? dualEducator.tokens ?? 0;

          return {
            success: true,
            data: {
              has_dual_role: true,
              tokens: { accessToken: adminToken },
              educator_tokens: { accessToken: educatorToken },
              user: adminUserPayload,
              educator_user: {
                id: dualEducator.id,
                email: dualEducator.email,
                full_name: dualEducator.full_name,
                status: dualEducator.status,
                phone_number: dualEducator.phone_number,
                total_tokens: totalTokens,
                tokens: dualEducator.tokens ?? 0,
                profile_picture: await this.sanitizeProfilePicture(dualEducator.profile_picture ?? ''),
                role: InvitesConstants.ROLES.EDUCATOR,
                lms_enabled: dualEducator.lms_enabled ?? false,
                school: dualEducator.school
                  ? {
                      id: dualEducator.school.id,
                      school_name: dualEducator.school.school_name,
                      lms_enabled: dualEducator.school.lms_enabled ?? false,
                    }
                  : null,
              },
            },
          };
        }

        return {
          success: true,
          data: {
            tokens: { accessToken: adminToken },
            user: adminUserPayload,
          },
        };
      }
    }

    let educator = await this.educatorRepo.findOne({
      where: { email: normalizedEmail },
      relations: { school: true, admin: true, schoolAssignments: { school: true } },
    });

    if (!educator) {
      const [localPart, domainPart] = normalizedEmail.split('@');
      if (localPart && domainPart && localPart.includes('+')) {
        const canonicalEmail = `${localPart.split('+')[0]}@${domainPart}`;
        educator = await this.educatorRepo.findOne({
          where: { email: canonicalEmail },
          relations: ['school', 'admin'],
        });
      }
    }

    if (educator && educator.is_active) {
      if (educator.status === CommonStatus.INACTIVE) {
        return {
          success: false,
          message: AuthConstants.MESSAGES.ACCOUNT_DEACTIVATED,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      if (educator.status !== CommonStatus.ACTIVE) {
        return {
          success: false,
          message: Messages.USER_NOT_FOUND,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      if (!educator.password) {
        return {
          success: false,
          message: AuthConstants.MESSAGES.EDUCATOR_PASSWORD_NOT_SET,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      const isValid =
        educator.password && educator.password.startsWith(AuthConstants.BCRYPT_PREFIX)
          ? await bcrypt.compare(password, educator.password)
          : password === educator.password;

      if (!isValid) {
        return {
          success: false,
          message: Messages.INVALID_USERNAME_PASSWORD,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }
      const accessToken = this.jwtService.sign(
        {
          sub: educator.id,
          email: educator.email,
          type: AuthConstants.TOKEN_TYPE.EDUCATOR,
          roles: ['Educator'],
          adminId: educator.admin?.id ?? null,
          tokens: educator.tokens ?? null,
        } as JwtPayload,
        { expiresIn: expiresIn as '1d' },
      );

      const totalTokens = educator.allocated_tokens ?? educator.tokens ?? 0;
      const primarySchool = educator.primarySchool ?? educator.school ?? null;
      const allSchools = educator.schools?.length
        ? educator.schools.map((s) => ({
            id: s.id,
            school_name: s.school_name,
            lms_enabled: s.lms_enabled ?? false,
          }))
        : primarySchool
          ? [
              {
                id: primarySchool.id,
                school_name: primarySchool.school_name,
                lms_enabled: primarySchool.lms_enabled ?? false,
              },
            ]
          : [];

      return {
        success: true,
        data: {
          tokens: { accessToken },
          user: {
            id: educator.id,
            email: educator.email,
            full_name: educator.full_name,
            status: educator.status,
            phone_number: educator.phone_number,
            total_tokens: totalTokens,
            tokens: educator.tokens ?? 0,
            profile_picture: await this.sanitizeProfilePicture(educator.profile_picture ?? ''),
            role: InvitesConstants.ROLES.EDUCATOR,
            lms_enabled: educator.lms_enabled ?? false,
            // Backward-compatible single school
            school: primarySchool
              ? {
                  id: primarySchool.id,
                  school_name: primarySchool.school_name,
                  lms_enabled: primarySchool.lms_enabled ?? false,
                }
              : null,
            // Full list of assigned schools
            schools: allSchools,
          },
        },
      };
    }

    return {
      success: false,
      message: Messages.INVALID_USERNAME_PASSWORD,
      type: ErrorTypes.UNAUTHORIZED,
    };
  }

  async redeem(dto: RedeemDto): Promise<ServiceResponse> {
    const { code, email } = dto;

    if (!email) {
      return {
        success: false,
        message: Messages.INVALID_USERNAME_PASSWORD,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.replace(AuthConstants.CODE_CLEAN_REGEX, '').toUpperCase();
    if (!cleanCode) {
      return { success: false, message: Messages.INVALID_ACTIVATION_CODE };
    }

    const dbUser = await this.usersService.findByEmail(normalizedEmail);
    if (!dbUser) {
      return {
        success: false,
        message: Messages.USER_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const isMasterCode = cleanCode === AuthConstants.MASTER_REDEEM_CODE;
    if (isMasterCode) {
      const existingSubscriptions = (dbUser.subscriptions as SubscriptionSummary[]) || [];
      const masterSalesOrder = 'MASTER';
      const samePackageCount = existingSubscriptions.filter(
        (s) => s.netsuite_id.toUpperCase() === masterSalesOrder,
      ).length;
      const now = new Date();
      const expiry = new Date(now);
      expiry.setFullYear(now.getFullYear() + AuthConstants.LICENSE_EXPIRY_YEARS);
      const masterSubscription: SubscriptionSummary = {
        index: samePackageCount + 1,
        redeem_code: cleanCode,
        netsuite_id: masterSalesOrder,
        start: now.toISOString(),
        end: expiry.toISOString(),
        product_name: ['Master Access'],
        ai: [],
        platform: [],
        ai_seats: AuthConstants.MASTER_REDEEM_AI_SEATS,
        seats_available: AuthConstants.MASTER_REDEEM_AI_SEATS,
        ai_simulation_groups: [],
        devices_registered: [],
        hw_support_until: null,
      };
      const finalSubscriptions = [...existingSubscriptions, masterSubscription];
      let updatedUser: User | null = null;
      try {
        updatedUser = await this.redemptionsService.activateUserSubscriptions(
          dbUser.id,
          finalSubscriptions,
        );
      } catch {
        return {
          success: false,
          message: Messages.REDEMPTION_FAILED,
          type: ErrorTypes.INTERNAL_SERVER_ERROR,
        };
      }
      if (!updatedUser) {
        return {
          success: false,
          message: Messages.FAILED_TO_UPDATE_USER,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      return {
        success: true,
        message: Messages.SUBSCRIPTION_ACTIVATED,
        data: {
          user_email: updatedUser.email,
          subscriptions: updatedUser.subscriptions,
        },
      };
    }

    const existingRedemption = await this.redemptionsService.findByUserAndRedeemCode(
      dbUser.id,
      cleanCode,
    );
    if (existingRedemption) {
      return {
        success: false,
        message: Messages.LICENSE_ALREADY_ACTIVATED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    let found = false;
    let lines: Array<Record<string, unknown>> = [];
    try {
      ({ found, lines } = await this.tutorPatientService.getSalesOrderByRedeemCode(cleanCode));
    } catch {
      return {
        success: false,
        message: Messages.REDEMPTION_FAILED,
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    }

    if (!found || !lines.length) {
      return {
        success: false,
        message: Messages.INVALID_ACTIVATION_CODE,
      };
    }

    const existingSubscriptions = (dbUser.subscriptions as SubscriptionSummary[]) || [];
    const salesOrder = (lines[0]['so'] as string) || 'N/A';
    const samePackageCount = existingSubscriptions.filter(
      (s) => s.netsuite_id.toUpperCase() === salesOrder.toUpperCase(),
    ).length;
    const nextIndex = samePackageCount + 1;

    const subscriptionSummary = this.buildSubscriptionSummary(lines, cleanCode, nextIndex);
    if (!subscriptionSummary) {
      return {
        success: false,
        message: Messages.INVALID_ACTIVATION_CODE,
      };
    }

    const totalAiSeats = lines.reduce((sum, line) => {
      return sum + Number(line.ai_seats || 0);
    }, 0);

    const finalSubscriptions = [...existingSubscriptions, subscriptionSummary];

    let updatedUser: User | null = null;
    try {
      updatedUser = await this.redemptionsService.redeemAndActivateUser({
        userId: dbUser.id,
        redeemCode: cleanCode,
        salesOrder,
        customer: (lines[0]['customer'] as string) || 'Unknown',
        lineItems: lines,
        aiSeatsGranted: totalAiSeats,
        subscriptions: finalSubscriptions,
      });
    } catch {
      return {
        success: false,
        message: Messages.REDEMPTION_FAILED,
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    }

    if (!updatedUser) {
      return {
        success: false,
        message: Messages.FAILED_TO_UPDATE_USER,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    return {
      success: true,
      message: Messages.SUBSCRIPTION_ACTIVATED,
      data: {
        user_email: updatedUser.email,
        subscriptions: updatedUser.subscriptions,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<ServiceResponse> {
    const email = dto.email.trim().toLowerCase();

    // Always check both account types in parallel so dual-role accounts are detected
    const [user, educator] = await Promise.all([
      this.usersService.findByEmail(email),
      this.educatorRepo.findOne({
        where: { email, is_active: true, status: CommonStatus.ACTIVE },
      }),
    ]);

    if (dto.role === 'admin' && !user) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.DUAL_ROLE_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    if (dto.role === 'educator' && !educator) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.DUAL_ROLE_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const reset_token = this.jwtService.sign(
      {
        email,
        purpose: AuthConstants.JWT_PURPOSE.OTP_VERIFY,
        otp,
        ...(dto.role ? { role: dto.role } : {}),
      },
      { expiresIn: `${AuthConstants.OTP_EXPIRY_MINUTES}m` },
    );

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: AuthConstants.EMAIL.OTP_SUBJECT,
        template: 'forgot-password',
        context: { otp, expiryMinutes: AuthConstants.OTP_EXPIRY_MINUTES },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : AuthConstants.UNEXPECTED_ERROR;
      return {
        success: false,
        message: `SMTP Error: ${message}`,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    return { success: true, message: AuthConstants.MESSAGES.OTP_SENT, data: { reset_token } };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<ServiceResponse> {
    let payload: OtpTokenPayload;

    try {
      payload = await Promise.resolve(this.jwtService.verify<OtpTokenPayload>(dto.reset_token));
    } catch (error) {
      const isExpired = error instanceof Error && error.name === AuthConstants.TOKEN_EXPIRED_ERROR;
      return {
        success: false,
        message: isExpired
          ? AuthConstants.MESSAGES.OTP_EXPIRED
          : AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (payload.purpose !== AuthConstants.JWT_PURPOSE.OTP_VERIFY || !payload.otp) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (payload.otp !== dto.otp.trim()) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.OTP_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const verified_token = this.jwtService.sign(
      {
        email: payload.email,
        purpose: AuthConstants.JWT_PURPOSE.RESET_PASSWORD,
        ...(payload.role ? { role: payload.role } : {}),
      },
      { expiresIn: AuthConstants.VERIFIED_TOKEN_EXPIRES },
    );

    return {
      success: true,
      message: AuthConstants.MESSAGES.OTP_VERIFIED,
      data: { verified_token },
    };
  }

  async resendOtp(dto: ResendOtpDto): Promise<ServiceResponse> {
    let decoded: DecodedOtpToken;

    try {
      decoded = this.jwtService.verify<DecodedOtpToken>(dto.reset_token, {
        ignoreExpiration: true,
      });
    } catch {
      return {
        success: false,
        message: AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (decoded.purpose !== AuthConstants.JWT_PURPOSE.OTP_VERIFY) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const email = String(decoded.email);

    const issuedAt = (decoded.exp ?? 0) - AuthConstants.OTP_EXPIRY_MINUTES * 60;
    const secondsSinceIssued = Math.floor(Date.now() / 1000) - issuedAt;
    if (secondsSinceIssued < AuthConstants.OTP_RESEND_COOLDOWN_MINUTES * 60) {
      const waitSec = AuthConstants.OTP_RESEND_COOLDOWN_MINUTES * 60 - secondsSinceIssued;
      return {
        success: false,
        message: `${AuthConstants.MESSAGES.OTP_RESEND_TOO_SOON} (${Math.ceil(waitSec / 60)} min remaining)`,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const user = await this.usersService.findByEmail(email);
    const educator = !user
      ? await this.educatorRepo.findOne({ where: { email, is_active: true } })
      : null;
    if (!user && !educator) {
      return { success: false, message: Messages.OTP_USER_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const reset_token = this.jwtService.sign(
      {
        email,
        purpose: AuthConstants.JWT_PURPOSE.OTP_VERIFY,
        otp,
        ...(decoded.role ? { role: decoded.role } : {}),
      },
      { expiresIn: `${AuthConstants.OTP_EXPIRY_MINUTES}m` },
    );

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: AuthConstants.EMAIL.OTP_SUBJECT,
        template: 'forgot-password',
        context: { otp, expiryMinutes: AuthConstants.OTP_EXPIRY_MINUTES },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : AuthConstants.UNEXPECTED_ERROR;
      return {
        success: false,
        message: `SMTP Error: ${message}`,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    return { success: true, message: AuthConstants.MESSAGES.OTP_RESENT, data: { reset_token } };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ServiceResponse> {
    let tokenPayload: ResetTokenPayload;
    try {
      tokenPayload = this.jwtService.verify<ResetTokenPayload>(dto.verified_token);
    } catch (error) {
      const isExpired = error instanceof Error && error.name === AuthConstants.TOKEN_EXPIRED_ERROR;
      return {
        success: false,
        message: isExpired
          ? AuthConstants.MESSAGES.VERIFIED_TOKEN_EXPIRED
          : AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (this.blacklistService.has(dto.verified_token)) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.VERIFIED_TOKEN_EXPIRED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    if (tokenPayload.purpose !== AuthConstants.JWT_PURPOSE.RESET_PASSWORD) {
      return {
        success: false,
        message: AuthConstants.MESSAGES.VERIFIED_TOKEN_INVALID,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const email = tokenPayload.email;
    const role = tokenPayload.role;
    const user = role !== 'educator' ? await this.usersService.findByEmail(email) : null;
    const educator =
      role !== 'admin'
        ? await this.educatorRepo.findOne({
            where: { email, is_active: true, status: CommonStatus.ACTIVE },
          })
        : null;

    if (!user && !educator) {
      return { success: false, message: Messages.OTP_USER_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
    }

    const hashedPassword = await bcrypt.hash(dto.new_password, AuthConstants.SALT_ROUNDS);

    if (user) {
      await this.usersService.updateByEmail(email, { password: hashedPassword });
    }
    if (educator) {
      educator.password = hashedPassword;
      await this.educatorRepo.save(educator);
    }

    this.blacklistService.add(dto.verified_token);

    return { success: true, message: AuthConstants.MESSAGES.PASSWORD_RESET_SUCCESS };
  }
}
