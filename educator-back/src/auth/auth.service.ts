import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FindOptionsWhere } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { TokenService } from 'src/common/services/token.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RedemptionsService } from '../users/redemptions.service';
import { redactEmail } from 'src/common/utils/redact.util';
import { Messages, ErrorTypes } from '../common/utils/messages';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  EDUCATOR_USER_SELECT,
  resolveEducatorEmail,
  resolveEducatorPassword,
  resolveEducatorStatus,
} from 'src/common/utils/educator-identity.util';
import {
  buildLoginResponseData,
  buildStudentLoginResponseData,
} from 'src/common/utils/login-response.util';
import { AuthConstants } from './auth.constants';
import { ServiceResponse, SubscriptionSummary } from 'src/common/types';
import { RedeemCodeEntry, UserWithDistrictAdminProfile } from 'src/common/interfaces';
import {
  educatorBelongsToSchool,
  getEducatorSchoolIds as collectEducatorSchoolIds,
  isGoogleClassroomEnabledForEducator,
  mapEducatorSchoolsForAuth,
  mapSchoolToAuthDto,
} from 'src/common/utils/educator-school.util';

import { SalesOrderLinesService } from 'src/sales-order-lines/sales-order-lines.service';

import { CsrfService } from '../csrf/csrf.service';
import { AzureBlobService, LoggerService } from 'src/common/services';
import { Educator, Student, User, UserToken } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  ROLE_REPOSITORY,
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_TOKEN_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import {
  DistrictAdminRepository,
  EducatorRepository,
  RoleRepository,
  StudentRepository,
  UserRepository,
  UserTokenRepository,
  UserRoleRepository,
} from 'src/database/repositories';
import path from 'path';
import fs from 'fs';
import { ResponseResult } from 'src/common/class/response.class';
import { handleError } from 'src/common/utils/common.util';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { AUTH_MSG } from 'src/common/messages/auth.message';
import {
  LoginAccessStatus,
  RoleSlug,
  TokenPurposeType,
  UserTokenPurpose,
  UserTokenType,
} from 'src/common/constants';
import {
  mapRoleSlugToUserTokenType,
  mapUserTokenTypeToRoleSlugs,
} from 'src/common/utils/user-token-type.util';
import { SignupReqDto } from './dto/signup.dto';
import { LoginReqDto, LoginResDto } from './dto/login.dto';
import { SelectRoleReqDto } from './dto/select-role.dto';
import { ForgotPasswordReqDto } from './dto/forgot-password.dto';
import { ResendOtpReqDto } from './dto/resend-otp.dto';
import { VerifyOtpReqDto } from './dto/verify-otp.dto';
import { ResetPasswordReqDto } from './dto/reset-password.dto';
import { ChangePasswordReqDto } from './dto/change-password.dto';
import { CsrfTokenResDto } from './dto/csrf-token.dto';
import { RedeemReqDto, RedeemResDto } from './dto/redeem.dto';
import { EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { ICurrentUser, JwtPayload } from 'src/common/interfaces';
import { throwAppError } from 'src/common/utils/app-error';
import { isUuid } from 'src/common/utils/uuid.util';

@Injectable()
export class AuthService {

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly redemptionsService: RedemptionsService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailService,
    private readonly salesOrderLinesService: SalesOrderLinesService,
    private readonly csrfService: CsrfService,
    private readonly tokenService: TokenService,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepo: RoleRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly userTokenRepo: UserTokenRepository,
    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepo: UserRoleRepository,
    @Inject(DISTRICT_ADMIN_REPOSITORY)
    private readonly districtAdminRepo: DistrictAdminRepository,
    private readonly azureBlobService: AzureBlobService,
    private readonly logger: LoggerService,
  ) { }

  /**
   * `subscriptions` no longer lives on `User` — it moved to `DistrictAdmin`
   * (district-admin-plan.md). Every admin account reaching redemption is expected to already
   * have a linked District Admin role assignment (backfilled by Phase 2's migration).
   */
  private async getDistrictAdminSubscriptionsForUser(
    userId: string,
  ): Promise<SubscriptionSummary[]> {
    const userRole = await this.userRoleRepo.findByUserAndRoleSlug(userId, RoleSlug.DISTRICT_ADMIN);
    if (!userRole) return [];
    const districtAdmin = await this.districtAdminRepo.findByUserRoleId(userRole.userRoleId);
    return (districtAdmin?.subscriptions as SubscriptionSummary[]) || [];
  }

  async findEducatorByEmail(email: string): Promise<Educator | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const relations = {
      school: true,
      admin: { userRole: true },
      schoolAssignments: { school: true },
      userRole: { user: true },
    };
    // Partial `userRole` select must include PK + status + userId — otherwise TypeORM
    // returns them as undefined and resolveEducatorStatus / ltiLogin fail (#782).
    const select = {
      userRole: {
        userRoleId: true,
        userId: true,
        status: true,
        user: EDUCATOR_USER_SELECT,
      },
    };
    let educator = await this.educatorRepo.findOne({
      where: { userRole: { user: { email: normalizedEmail } } },
      relations,
      select,
    });

    if (!educator) {
      const [localPart, domainPart] = normalizedEmail.split('@');
      if (localPart && domainPart && localPart.includes('+')) {
        const canonicalEmail = `${localPart.split('+')[0]}@${domainPart}`;
        educator = await this.educatorRepo.findOne({
          where: { userRole: { user: { email: canonicalEmail } } },
          relations,
          select,
        });
      }
    }

    return educator;
  }

  async findEducatorById(id: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { id },
      relations: {
        school: true,
        admin: { userRole: true },
        schoolAssignments: { school: true },
        userRole: { user: true },
      },
      select: {
        userRole: {
          userRoleId: true,
          userId: true,
          status: true,
          user: EDUCATOR_USER_SELECT,
        },
      },
    });
  }

  getEducatorSchoolIds(educator: Educator): string[] {
    return collectEducatorSchoolIds(educator);
  }

  private async buildLtiSuccessResponse(
    educator: Educator,
    res: Response,
  ): Promise<ServiceResponse> {
    const email = resolveEducatorEmail(educator);
    // `sub` must be the account's `users.id`: `JwtStrategy.validate()` resolves every non-student
    // token's subject against the `users` table, and derives `educatorId`/`adminId` itself from
    // the matched `user_roles` row. An educator with no linked role assignment has no account to
    // authenticate as, so fail here rather than mint a token that 401s on its first use.
    const accountUserId = educator.userRole?.userId;
    if (!accountUserId) {
      this.logger.warn(
        `[ltiLogin] Educator ${educator.id} has no linked user account — cannot issue a token`,
      );
      return {
        success: false,
        message: AuthConstants.LTI.EDUCATOR_NOT_REGISTERED,
        type: ErrorTypes.UNAUTHORIZED,
      };
    }
    const educatorTokens = this.tokenService.generateTokens({
      sub: accountUserId,
      email: email ?? undefined,
      type: UserTokenType.EDUCATOR,
      purpose: TokenPurposeType.ACCESS,
      roles: [RoleSlug.EDUCATOR],
      tokens: educator.tokens ?? null,
    });
    const accessToken = educatorTokens.access_token;
    this.tokenService.setAuthCookies(res, {
      access_token: educatorTokens.access_token,
      expires_in: educatorTokens.expires_in,
    });

    const totalTokens = educator.allocated_tokens ?? educator.tokens ?? 0;
    const csrfToken = await this.csrfService.generateToken();

    const primarySchool = educator.primarySchool ?? educator.school ?? null;
    const allSchools = mapEducatorSchoolsForAuth(educator);

    return {
      success: true,
      data: {
        tokens: { accessToken, csrfToken },
        user: {
          id: educator.id,
          email,
          full_name: educator.full_name,
          status: resolveEducatorStatus(educator),
          phone_number: educator.phone_number,
          total_tokens: totalTokens,
          tokens: educator.tokens ?? 0,
          profile_picture: await this.sanitizeProfilePicture(educator.profile_picture ?? ''),
          role: RoleSlug.EDUCATOR,
          lms_enabled: educator.lms_enabled ?? false,
          google_classroom_enabled: isGoogleClassroomEnabledForEducator(educator),
          school: primarySchool
            ? mapSchoolToAuthDto(primarySchool)
            : null,
          schools: allSchools,
        },
      },
    };
  }

  private buildSubscriptionSummary(
    lines: RedeemCodeEntry[],
    redeemCode: string,
    index: number,
  ): SubscriptionSummary | null {
    if (!lines.length) return null;

    const netsuite_id = lines[0].so || 'N/A';
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

      if (line.product_name) productNames.add(line.product_name);
      if (line.ai) ais.add(line.ai);
      if (line.platform) platforms.add(line.platform);

      aiSeats += seats;

      if (line.sim_group) {
        simGroups.add(line.sim_group);
      }

      if (line.type === 'Hardware') {
        hasHardware = true;
        devices.push(`${qty} ${line.product_name ?? ''}`);
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

  async ltiLogin(
    email: string,
    schoolId: string | null | undefined,
    preloadedEducator: Educator | null | undefined,
    res: Response,
  ): Promise<ServiceResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    // `Educator.email`/`.password`/`.status` no longer exist — identity/credentials/status
    // resolve via the linked `userRole.user`/`userRole.status` chain (see
    // `src/common/utils/educator-identity.util.ts`). `findEducatorByEmail` already looks up by
    // the linked `users.email`, so no separate email-column lookup is needed here.
    let educator = preloadedEducator ?? (await this.findEducatorByEmail(normalizedEmail));

    if (
      educator &&
      educator.is_active &&
      resolveEducatorStatus(educator) === CommonStatus.PENDING &&
      !resolveEducatorPassword(educator)
    ) {
      educator.lms_enabled = true;
      educator = await this.educatorRepo.create(educator);
      if (educator.userRoleId) {
        await this.userRoleRepo.update(
          { userRoleId: educator.userRoleId },
          { status: CommonStatus.ACTIVE },
        );
        educator = await this.findEducatorByEmail(normalizedEmail);
      }
    }

    if (educator && educator.is_active && resolveEducatorStatus(educator) === CommonStatus.ACTIVE) {
      const lmsSchoolId = schoolId?.trim();
      if (lmsSchoolId && !educatorBelongsToSchool(educator, lmsSchoolId)) {
        this.logger.warn(
          `[ltiLogin] Educator ${educator.id} (${redactEmail(normalizedEmail)}) not assigned to LMS school ${lmsSchoolId}`,
        );
        return {
          success: false,
          message: AuthConstants.LTI.SCHOOL_MISMATCH,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      return await this.buildLtiSuccessResponse(educator, res);
    }
    return {
      success: false,
      message: Messages.USER_NOT_FOUND,
      type: ErrorTypes.UNAUTHORIZED,
    };
  }

  private async sanitizeProfilePicture(value?: string): Promise<string> {
    if (!value || !value.startsWith('http')) return '';
    return this.azureBlobService.generateSasUrl(value);
  }

  /** Shared redemption business logic — keyed off an explicit email, used internally by `redeem`. */
  private async processRedemption(dto: { code: string; email?: string }): Promise<ServiceResponse> {
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
    const dbUserSubscriptions = await this.getDistrictAdminSubscriptionsForUser(dbUser.id);

    const isMasterCode = cleanCode === AuthConstants.MASTER_REDEEM_CODE;
    if (isMasterCode) {
      const existingSubscriptions = dbUserSubscriptions;
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
      let updatedUser: UserWithDistrictAdminProfile | null;
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
          user_email: updatedUser.user.email,
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

    let found: boolean;
    let lines: RedeemCodeEntry[];
    try {
      ({ found, lines } = await this.salesOrderLinesService.getSalesOrderByRedeemCode(cleanCode));
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

    const existingSubscriptions = dbUserSubscriptions;
    const salesOrder = lines[0].so || 'N/A';
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

    let updatedUser: UserWithDistrictAdminProfile | null;
    try {
      updatedUser = await this.redemptionsService.redeemAndActivateUser({
        userId: dbUser.id,
        redeemCode: cleanCode,
        salesOrder,
        customer: lines[0].customer || 'Unknown',
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
        user_email: updatedUser.user.email,
        subscriptions: updatedUser.subscriptions,
      },
    };
  }

  /**
   * Registers a district admin in users + district_admins + user_roles, and auto-authenticates.
   * Returns the same response shape as login (buildLoginResponseData), re-fetching the just-created
   * user via findByEmailWithPassword so it comes back with its roles/district-admin profile joined.
   */
  async signup(dto: SignupReqDto, res: Response): Promise<ResponseResult<LoginResDto>> {
    try {
      const email = dto.email.toLowerCase();

      const existing = await this.userRepo.findByEmail(email);
      if (existing) {
        throw new ConflictException(AUTH_MSG.EMAIL_EXISTS);
      }

      const districtAdminRole = await this.roleRepo.findBySlug(RoleSlug.DISTRICT_ADMIN);
      if (!districtAdminRole) {
        throw new BadRequestException(ERROR_MSG.DB.NOT_FOUND('Role'));
      }

      const hashedPassword = await bcrypt.hash(dto.password, AuthConstants.SALT_ROUNDS);

      const savedUser = await this.userRepo.createDistrictAdminAccount({
        email,
        password: hashedPassword,
        roleId: districtAdminRole.id,
        fullName: dto.fullName,
      });

      const tokens = this.tokenService.generateTokens({
        sub: savedUser.id,
        type: UserTokenType.ADMIN,
        purpose: TokenPurposeType.ACCESS,
      });
      this.tokenService.setAuthCookies(res, {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
      });

      const fullUser = await this.userRepo.findByEmailWithPassword(email);
      if (!fullUser) {
        throw new BadRequestException(ERROR_MSG.DB.NOT_FOUND('Account'));
      }

      const csrfToken = await this.csrfService.generateToken();

      await this.sendAccountCreatedEmail(savedUser.email, dto.fullName ?? savedUser.email)

      return new ResponseResult({
        message: AUTH_MSG.SIGNUP_SUCCESS,
        data: {
          ...(await buildLoginResponseData(
            fullUser,
            LoginAccessStatus.ACCESS_GRANTED,
            RoleSlug.DISTRICT_ADMIN,
            (url) => this.sanitizeProfilePicture(url ?? undefined),
          )),
          tokens: { accessToken: tokens.access_token, csrfToken },
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Best-effort welcome email for a freshly-created signup account — the account already
   * exists by the time this runs, so a delivery failure is logged and swallowed rather than
   * failing the signup response.
   */
  private async sendAccountCreatedEmail(email: string, fullName: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? '';
    const loginUrl = `${frontendUrl.replace(/\/$/, '')}/login`;
    const supportEmail =
      this.configService.get<string>('mail.supportEmail');

    await this.mailerService
      .sendBrandedMail({
        to: email,
        subject: AuthConstants.EMAIL.ACCOUNT_CREATED_SUBJECT,
        template: 'account-created',
        context: { fullName, username: email, loginUrl, supportEmail },
      })
      .catch((error: unknown) => {
        this.logger.error({
          topic: 'AuthService',
          subTopic: 'sendAccountCreatedEmail',
          operation: AuthConstants.LOG.EMAIL_SEND_FAILED,
          refData: { email: redactEmail(email) },
          error,
        });
      });
  }

  /**
   * Generic login (district admin, scenario admin, educator, etc.).
   * findByEmailWithPassword already joins roles, district-admin profile, and any linked
   * legacy educator/student row in one query — no follow-up lookups needed to build the response.
   *
   * If the account has exactly one active role, this issues a normal `purpose: 'access'` token
   * (full resource access, `type` set to that role). If it has more than one, it issues a
   * short-lived `purpose: 'login'` token instead — the caller must exchange it via `selectRole()`
   * before it can access anything beyond that. Every token this method issues (regardless of
   * purpose) goes into the same `accessToken` cookie via `setAuthCookies`.
   */
  async login(dto: LoginReqDto, res: Response): Promise<ResponseResult<LoginResDto>> {
    try {
      const email = dto.email.toLowerCase();
      const user = await this.userRepo.findByEmailWithPassword(email);

      const isPasswordValid =
        !!user?.password && (await bcrypt.compare(dto.password, user.password));

      const roleSlugs = (user?.userRoles ?? [])
        .filter((userRole) => userRole.status === CommonStatus.ACTIVE)
        .map((userRole) => userRole.role?.slug)
        .filter((slug): slug is string => !!slug);

      if (!user || roleSlugs.length === 0 || !isPasswordValid) {
        throw new UnauthorizedException(AUTH_MSG.INVALID_CREDENTIALS);
      }

      if (roleSlugs.length > 1) {
        const loginTokens = this.tokenService.generateTokens(
          { sub: user.id, purpose: TokenPurposeType.LOGIN },
          AuthConstants.LOGIN_TOKEN_EXPIRES_IN_SECONDS,
        );
        this.tokenService.setAuthCookies(res, loginTokens);

        const roleSelectionCsrfToken = await this.csrfService.generateToken();

        return new ResponseResult({
          message: AUTH_MSG.ROLE_SELECTION_REQUIRED,
          data: {
            ...(await buildLoginResponseData(
              user,
              LoginAccessStatus.REQUIRED_ROLE_SELECTION,
              undefined,
              (url) => this.sanitizeProfilePicture(url ?? undefined),
            )),
            tokens: { accessToken: loginTokens.access_token, csrfToken: roleSelectionCsrfToken },
          },
        });
      }

      // A slug with no token-type mapping would sign `type: undefined`, which `JwtStrategy`
      // rejects as "Invalid token purpose" — a successful login followed by an unexplained 401
      // on the very next request. Fail here instead, where the cause is visible.
      const type = mapRoleSlugToUserTokenType(roleSlugs[0]);
      if (!type) {
        this.logger.error(
          `[login] Role slug "${roleSlugs[0]}" has no UserTokenType mapping — cannot issue a token for user ${user.id}`,
        );
        throw new UnauthorizedException(AUTH_MSG.INVALID_CREDENTIALS);
      }

      const tokens = this.tokenService.generateTokens({
        sub: user.id,
        type,
        purpose: TokenPurposeType.ACCESS,
      });
      this.tokenService.setAuthCookies(res, {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
      });

      const csrfToken = await this.csrfService.generateToken();

      return new ResponseResult({
        message: AUTH_MSG.LOGIN_SUCCESS,
        data: {
          ...(await buildLoginResponseData(
            user,
            LoginAccessStatus.ACCESS_GRANTED,
            roleSlugs[0],
            (url) => this.sanitizeProfilePicture(url ?? undefined),
          )),
          tokens: { accessToken: tokens.access_token, csrfToken },
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Combined role-selection/switch endpoint. `currentUser` comes from the global `AuthGuard`, which
   * accepts a token of either purpose: a `purpose: 'login'` token (issued by `login()` for a
   * multi-role account, first role pick) or an existing `purpose: 'access'` token (switching
   * between an account's own active roles). Either way, this looks up `dto.roleId` fresh from
   * the account's currently active roles and issues a new `purpose: 'access'` token typed to
   * it — the incoming token's own purpose/type never has to be branched on here.
   */
  async selectRole(
    currentUser: ICurrentUser,
    dto: SelectRoleReqDto,
    res: Response,
  ): Promise<ResponseResult<LoginResDto>> {
    try {
      const targetUserRole = await this.userRoleRepo.findOne({
        where: { userId: currentUser.userId, roleId: dto.roleId },
        relations: { role: true },
      });

      if (
        !targetUserRole ||
        targetUserRole.status !== CommonStatus.ACTIVE ||
        !targetUserRole.role?.slug
      ) {
        throw new UnauthorizedException(AUTH_MSG.ROLE_SELECTION_INVALID);
      }

      const user = await this.userRepo.findByIdWithRoles(currentUser.userId);
      if (!user) {
        throw new UnauthorizedException(AUTH_MSG.ACCOUNT_NOT_FOUND);
      }

      const type = mapRoleSlugToUserTokenType(targetUserRole.role.slug);
      if (!type) {
        this.logger.error(
          `[selectRole] Role slug "${targetUserRole.role.slug}" has no UserTokenType mapping — cannot issue a token for user ${user.id}`,
        );
        throw new UnauthorizedException(AUTH_MSG.ROLE_SELECTION_INVALID);
      }

      const tokens = this.tokenService.generateTokens({
        sub: user.id,
        type,
        purpose: TokenPurposeType.ACCESS,
      });
      this.tokenService.setAuthCookies(res, tokens);

      const csrfToken = await this.csrfService.generateToken();

      return new ResponseResult({
        message: AUTH_MSG.LOGIN_SUCCESS,
        data: {
          ...(await buildLoginResponseData(
            user,
            LoginAccessStatus.ACCESS_GRANTED,
            targetUserRole.role.slug,
            (url) => this.sanitizeProfilePicture(url ?? undefined),
          )),
          tokens: { accessToken: tokens.access_token, csrfToken },
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Session-restore endpoint (`GET /auth/me`) — re-fetches the account fresh from the DB rather
   * than trusting `currentUser` alone, so `userRoles[]` always reflects the account's current
   * active roles rather than whatever was true when the token was issued. `accessStatus` mirrors
   * `login()`'s semantics: `currentUser.type` is only ever set for a `purpose: 'access'` token
   * (see `JwtStrategy.validate`), so an unset `type` means the caller is still on a
   * `purpose: 'login'` session and hasn't completed role selection yet.
   */
  async getMe(currentUser: ICurrentUser): Promise<ResponseResult<LoginResDto>> {
    try {
      // Students have no `users` row — a student session is issued off a login code, so its
      // details come from the `students` table rather than the user/roles join below.
      if (currentUser.type === UserTokenType.STUDENT) {
        return this.getStudentMe(currentUser);
      }

      const user = await this.userRepo.findByIdWithRoles(currentUser.userId);
      if (!user) {
        throw new UnauthorizedException(AUTH_MSG.ACCOUNT_NOT_FOUND);
      }

      // `currentUser.type` is only ever set for a `purpose: 'access'` token (see
      // `JwtStrategy.validate`), so an unset `type` means the caller is still on a
      // `purpose: 'login'` session and has not completed role selection yet. Reporting
      // ACCESS_GRANTED there would make the frontend skip the role picker on session restore.
      const accessStatus = currentUser.type
        ? LoginAccessStatus.ACCESS_GRANTED
        : LoginAccessStatus.REQUIRED_ROLE_SELECTION;

      // Inverse of `mapRoleSlugToUserTokenType` — `currentUser.type` is the JWT `type` claim the
      // active access token carries; map it back to the role slug it was issued for.
      const activeRoleSlug = currentUser.type
        ? mapUserTokenTypeToRoleSlugs(currentUser.type)[0]
        : undefined;

      return new ResponseResult({
        message: AUTH_MSG.ME_FETCHED,
        data: await buildLoginResponseData(
          user,
          accessStatus,
          activeRoleSlug,
          (url) => this.sanitizeProfilePicture(url ?? undefined),
        ),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * `getMe` for a `type: 'student'` token. The token's `sub` carries the student's login code and
   * `user_id` its `students.id` (see `JwtStrategy.validate`), so both are accepted here; the row's
   * continued validity was already re-checked by the strategy on this request.
   */
  private async getStudentMe(currentUser: ICurrentUser): Promise<ResponseResult<LoginResDto>> {
    const studentId = currentUser.studentId ?? undefined;
    const studentCode = currentUser.student_id ?? currentUser.userId;

    const where: FindOptionsWhere<Student>[] = [
      ...(studentId ? [{ id: studentId }] : []),
      ...(studentCode ? [{ student_id: studentCode }] : []),
    ];

    const student = where.length
      ? await this.studentRepo.findOne({
        where,
        relations: ['class', 'userRole', 'userRole.role', 'userRole.user'],
      })
      : null;

    if (!student) {
      throw new UnauthorizedException(AUTH_MSG.STUDENT_NOT_FOUND);
    }

    // Only needed when the student isn't linked to a `user_roles` row already carrying the role.
    const role = student.userRole?.role ?? (await this.roleRepo.findBySlug(RoleSlug.STUDENT));

    return new ResponseResult({
      message: AUTH_MSG.ME_FETCHED,
      data: buildStudentLoginResponseData(student, role, LoginAccessStatus.ACCESS_GRANTED),
    });
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** Emails the OTP, same template/logo-attachment handling as the legacy forgot-password flow. */
  private async sendOtpEmail(email: string, otp: string): Promise<void> {
    const logoUrl =
      this.configService.get<string>('mail.logoUrl') ||
      this.configService.get<string>('EMAIL_LOGO_URL') ||
      '';

    let logoBuffer: Buffer | null = null;
    try {
      const logoPath = path.join(__dirname, '..', 'assets', 'realityworks-ai-logo.png');
      if (fs.existsSync(logoPath)) {
        logoBuffer = fs.readFileSync(logoPath);
      }
    } catch (err) {
      this.logger.warn(`[sendOtpEmail] Failed to load logo image: ${(err as Error).message}`);
    }

    const attachments = logoBuffer
      ? [
        {
          filename: 'realityworks-ai-logo.png',
          contentType: 'image/png',
          content: logoBuffer,
          cid: 'realityworks-ai-logo',
        },
      ]
      : [];

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: AuthConstants.EMAIL.OTP_SUBJECT,
        template: 'forgot-password',
        context: { otp, expiryMinutes: AuthConstants.OTP_EXPIRY_MINUTES, logoUrl },
        attachments,
      });
    } catch (error) {
      this.logger.error({
        topic: 'AuthService',
        subTopic: 'sendOtpEmail',
        operation: AuthConstants.LOG.EMAIL_SEND_FAILED,
        refData: { email: redactEmail(email) },
        error,
      });
      const message = error instanceof Error ? error.message : AuthConstants.UNEXPECTED_ERROR;
      throw new BadRequestException(
        `${AuthConstants.MESSAGES.EMAIL_DELIVERY_FAILED_PREFIX}: ${message}`,
      );
    }
  }

  /** Looks up an account by email, with at least one active role, eligible for a password reset. */
  private async findResettablePasswordUser(email: string): Promise<User> {
    const user = await this.userRepo.findByEmailWithRoles(email.toLowerCase());
    const hasActiveRole = (user?.userRoles ?? []).some(
      (userRole) => userRole.status === CommonStatus.ACTIVE,
    );
    if (!user || !hasActiveRole) {
      throw new NotFoundException(AUTH_MSG.ACCOUNT_NOT_FOUND);
    }
    return user;
  }

  /**
   * Generates a fresh OTP, persists it as the one live user_tokens row for this user (purpose
   * FORGOT_PASSWORD, created or refreshed via upsertActive), and emails it — replacing what the
   * legacy flow keeps in Redis/memory.
   */
  private async issueForgotPasswordOtp(user: User): Promise<void> {
    const otp = this.generateOtp();

    await this.userTokenRepo.upsertActive({
      purpose: UserTokenPurpose.FORGOT_PASSWORD,
      userId: user.id,
      token: otp,
      expiresAt: new Date(Date.now() + AuthConstants.OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    await this.sendOtpEmail(user.email ?? '', otp).catch();
  }

  /** Validates an OTP against the live user_tokens row for this user — does not consume it. */
  private async assertValidOtp(userId: string, otp: string): Promise<UserToken> {
    const activeToken = await this.userTokenRepo.findActiveByPurposeAndUserId(
      UserTokenPurpose.FORGOT_PASSWORD,
      userId,
    );

    if (!activeToken || activeToken.expiresAt < new Date()) {
      throw new BadRequestException(AUTH_MSG.OTP_EXPIRED);
    }
    if (activeToken.token !== otp.trim()) {
      throw new BadRequestException(AUTH_MSG.OTP_INVALID);
    }

    return activeToken;
  }

  /** Forgot-password — issues an OTP for an account, persisted in user_tokens (not Redis). */
  async forgotPassword(dto: ForgotPasswordReqDto): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const user = await this.findResettablePasswordUser(dto.email);
      await this.issueForgotPasswordOtp(user);

      return new ResponseResult({ message: AUTH_MSG.OTP_SENT });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Resend-otp — reissues the OTP for the given account, subject to the resend cooldown. */
  async resendOtp(dto: ResendOtpReqDto): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const user = await this.findResettablePasswordUser(dto.email);

      const existing = await this.userTokenRepo.findActiveByPurposeAndUserId(
        UserTokenPurpose.FORGOT_PASSWORD,
        user.id,
      );
      if (existing) {
        const secondsSinceIssued = (Date.now() - existing.updatedAt.getTime()) / 1000;
        if (secondsSinceIssued < AuthConstants.OTP_RESEND_COOLDOWN_MINUTES * 60) {
          throw new BadRequestException(AUTH_MSG.RESEND_TOO_SOON);
        }
      }

      await this.issueForgotPasswordOtp(user);

      return new ResponseResult({ message: AUTH_MSG.OTP_RESENT });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Verify-otp — checks the OTP against user_tokens without consuming it (reset-password does that). */
  async verifyOtp(dto: VerifyOtpReqDto): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const user = await this.findResettablePasswordUser(dto.email);
      await this.assertValidOtp(user.id, dto.otp);

      return new ResponseResult({ message: AUTH_MSG.OTP_VERIFIED });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Reset-password — re-validates the OTP, updates the password, and deletes the used OTP row. */
  async resetPassword(dto: ResetPasswordReqDto): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const user = await this.findResettablePasswordUser(dto.email);
      const activeToken = await this.assertValidOtp(user.id, dto.otp);

      const hashedPassword = await bcrypt.hash(dto.newPassword, AuthConstants.SALT_ROUNDS);
      await this.userRepo.resetPassword({
        userId: user.id,
        hashedPassword,
        userTokenId: activeToken.userTokenId,
      });

      return new ResponseResult({ message: AUTH_MSG.PASSWORD_RESET_SUCCESS });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Change-password — verifies the current password, then sets the new one. */
  async changePassword(
    currentUser: ICurrentUser,
    dto: ChangePasswordReqDto,
  ): Promise<ResponseResult<EmptyDataDto>> {
    try {
      const user = await this.userRepo.findByIdWithPassword(currentUser.userId);
      if (!user?.password) {
        throw new BadRequestException(AUTH_MSG.ACCOUNT_NOT_FOUND);
      }

      const isMatch = await bcrypt.compare(dto.oldPassword, user.password);
      if (!isMatch) {
        throw new BadRequestException(AUTH_MSG.OLD_PASSWORD_INCORRECT);
      }

      const hashedPassword = await bcrypt.hash(dto.newPassword, AuthConstants.SALT_ROUNDS);
      await this.userRepo.update(user.id, { password: hashedPassword });

      return new ResponseResult({ message: AUTH_MSG.PASSWORD_CHANGE_SUCCESS });
    } catch (error) {
      return handleError(error);
    }
  }

  /** CSRF token issuance — same generation/storage as the legacy endpoint. */
  async csrfToken(_currentUser: ICurrentUser): Promise<ResponseResult<CsrfTokenResDto>> {
    try {
      const csrfToken = await this.csrfService.generateToken();
      return new ResponseResult({ message: AUTH_MSG.CSRF_TOKEN_ISSUED, data: { csrfToken } });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Redeem — delegates to processRedemption, keyed off the authenticated user's email instead of a body field. */
  async redeem(
    currentUser: ICurrentUser,
    dto: RedeemReqDto,
  ): Promise<ResponseResult<RedeemResDto>> {
    try {
      if (!currentUser?.email) {
        throw new UnauthorizedException(AUTH_MSG.INVALID_CREDENTIALS);
      }

      const result = await this.processRedemption({ code: dto.code, email: currentUser.email });
      if (result.success === false) {
        return throwAppError(result.message || Messages.REDEMPTION_FAILED, result.type);
      }

      const data = result.data as { user_email: string; subscriptions: SubscriptionSummary[] };
      return new ResponseResult({
        message: result.message ?? AUTH_MSG.REDEEM_SUCCESS,
        data: { userEmail: data.user_email, subscriptions: data.subscriptions },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Logout — clears the auth cookies and blacklists the current access token, idempotently. */
  async logout(
    _currentUser: ICurrentUser,
    token: string | undefined,
    res: Response,
  ): Promise<ResponseResult<EmptyDataDto>> {
    try {
      this.tokenService.clearAuthCookies(res);
      if (token) {
        await this.tokenService.blackListToken(token);
      }
      return new ResponseResult({ message: AUTH_MSG.LOGOUT_SUCCESS });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Verifies a raw access token and resolves it to the caller's identity — the same
   * `ICurrentUser` the global auth guard puts on `req.user`, so a caller holding only a token
   * (a WebSocket handshake, a background job, `AuthGuardV2`) gets an identical view of the user.
   *
   * Mirrors `JwtStrategy.validate()`: signature/expiry via `TokenService.verifyToken`, then the
   * blacklist check, the account/student lookup, and the re-check of the account's *current*
   * active roles — the token's own `roles`/`type` claims are never trusted on their own.
   *
   * Returns the bare `ICurrentUser` rather than a `ResponseResult`: this is an internal identity
   * resolver consumed by other server code, not a controller-facing endpoint.
   */
  async validateUserToken(token: string): Promise<ICurrentUser> {
    try {
      /* Throws `UnauthorizedException` on a bad signature or an expired token or blacklisted token*/
      const payload = await this.tokenService.verifyToken<JwtPayload>(token);

      if (payload.type === UserTokenType.STUDENT) {
        return await this.validateStudentToken(payload);
      }

      return await this.validateAccountToken(payload);
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Non-student half of `validateUser` — resolves the `users` row behind the token's `sub` and
   * re-derives the caller's roles (and `educatorId`/`adminId`) from the account's current
   * `user_roles`, so a role revoked after the token was issued takes effect on the next request.
   */
  private async validateAccountToken(payload: JwtPayload): Promise<ICurrentUser> {
    // Only `id`/`email` are used below — roles come from the separate `findByUserId` call.
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED);
    }

    const activeUserRoles = (await this.userRoleRepo.findByUserId(payload.sub)).filter(
      (userRole) => userRole.status === CommonStatus.ACTIVE,
    );
    if (activeUserRoles.length === 0) {
      throw new UnauthorizedException(AUTH_MSG.NO_ACTIVE_ROLE);
    }

    const roles = activeUserRoles
      .map((userRole) => userRole.role?.slug)
      .filter((slug): slug is RoleSlug => !!slug);

    if (payload.purpose === TokenPurposeType.LOGIN) {
      if (activeUserRoles.length <= 1) {
        throw new UnauthorizedException(AUTH_MSG.ROLE_SELECTION_NOT_REQUIRED);
      }

      // `type` is deliberately left unset — a login-purpose token grants no role yet, and the
      // guard keeps it off every route not marked `@AllowRoleSelectionToken()`.
      return {
        userId: user.id,
        email: user.email ?? undefined,
        roles,
        purpose: TokenPurposeType.LOGIN,
      };
    }

    if (payload.purpose !== TokenPurposeType.ACCESS || !payload.type) {
      throw new UnauthorizedException(AUTH_MSG.TOKEN_PURPOSE_INVALID);
    }

    const matchingSlugs = mapUserTokenTypeToRoleSlugs(payload.type);
    const matchedUserRole = activeUserRoles.find((userRole) =>
      matchingSlugs.includes(userRole.role?.slug as RoleSlug),
    );
    if (!matchedUserRole) {
      throw new UnauthorizedException(AUTH_MSG.ROLE_NO_LONGER_ACTIVE);
    }

    const result: ICurrentUser = {
      userId: user.id,
      email: user.email ?? undefined,
      roles,
      purpose: TokenPurposeType.ACCESS,
      type: payload.type,
    };

    if (payload.type === UserTokenType.ADMIN) {
      if (!matchedUserRole.districtAdmin) {
        throw new UnauthorizedException(AUTH_MSG.DISTRICT_ADMIN_PROFILE_NOT_FOUND);
      }
      result.adminId = matchedUserRole.districtAdmin.districtAdminId;
    }

    if (payload.type === UserTokenType.EDUCATOR) {
      result.educatorId = matchedUserRole.educator?.id;
    }

    return result;
  }

  /**
   * Student half of `validateUser`. A student token's `sub` carries the login code rather than a
   * `users.id` (students have no `users` row), so the row is looked up by either identifier, and
   * the student/class/educator must all still be active for the session to stay valid.
   */
  private async validateStudentToken(payload: JwtPayload): Promise<ICurrentUser> {
    const studentId = isUuid(payload.studentId)
      ? payload.studentId
      : isUuid(payload.sub)
        ? payload.sub
        : undefined;
    const studentCode = payload.student_id ?? payload.sub;

    const where: FindOptionsWhere<Student>[] = [
      ...(studentId ? [{ id: studentId }] : []),
      ...(studentCode ? [{ student_id: studentCode }] : []),
    ];

    const student = where.length
      ? await this.studentRepo.findOne({
        where,
        relations: [
          'class',
          'class.educator',
          'class.educator.userRole',
          'class.educator.userRole.user',
          'educator',
          'educator.userRole',
          'educator.userRole.user',
        ],
      })
      : null;

    const educator = student?.educator ?? student?.class?.educator;

    // Deleted / deactivated accounts (educator, class, or student deleted/inactive flag).
    if (
      !student ||
      student.is_active === false ||
      Boolean(student.deleted_at) ||
      (student.class && (student.class.is_active === false || Boolean(student.class.deleted_at))) ||
      (educator && (educator.is_active === false || Boolean(educator.deleted_at)))
    ) {
      throw new UnauthorizedException(AUTH_MSG.STUDENT_ACCOUNT_DEACTIVATED);
    }

    if (educator && resolveEducatorStatus(educator) === CommonStatus.INACTIVE) {
      throw new UnauthorizedException(AUTH_MSG.EDUCATOR_INACTIVE);
    }

    // Inactive or archived student/class status.
    if (
      student.status === CommonStatus.INACTIVE ||
      (student.class &&
        (student.class.status === CommonStatus.INACTIVE ||
          student.class.status === CommonStatus.ARCHIEVED ||
          student.class.status === CommonStatus.ARCHIVED))
    ) {
      throw new UnauthorizedException(AUTH_MSG.STUDENT_ACCOUNT_DEACTIVATED);
    }

    return {
      ...payload,
      userId: payload.sub,
      email: payload.email,
      purpose: payload.purpose,
      type: UserTokenType.STUDENT,
      student_id: payload.student_id ?? null,
      studentId: payload.studentId ?? payload.user_id ?? null,
      // Not persisted on the `students` table (see Student.student_name) — token-sourced.
      student_name: payload.student_name,
      ltiLaunch: payload.ltiLaunch,
      // A student account's roles are always exactly ['student'], whatever the token claims.
      roles: [RoleSlug.STUDENT],
    };
  }
}
