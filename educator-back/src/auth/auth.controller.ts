import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ResponseResult } from 'src/common/class/response.class';
import { RATE_LIMIT_THROTTLER_NAME } from 'src/common/guards/auth-throttler.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AllowRoleSelectionToken } from 'src/common/decorators/allow-role-selection-token.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { extractAccessToken } from 'src/common/utils/token-extractor.util';
import { AuthService } from './auth.service';
import { AuthConstants } from './auth.constants';
import { ForgotPasswordThrottleGuard } from './guards/forgot-password-throttle.guard';
import { SignupReqDto, SignupResponseDto } from './dto/signup.dto';
import { LoginReqDto, LoginResDto, LoginResponseDto } from './dto/login.dto';
import { ForgotPasswordReqDto, ForgotPasswordResponseDto } from './dto/forgot-password.dto';
import { ResendOtpReqDto, ResendOtpResponseDto } from './dto/resend-otp.dto';
import { VerifyOtpReqDto, VerifyOtpResponseDto } from './dto/verify-otp.dto';
import { ResetPasswordReqDto, ResetPasswordResponseDto } from './dto/reset-password.dto';
import { ChangePasswordReqDto, ChangePasswordResponseDto } from './dto/change-password.dto';
import { CsrfTokenResDto, CsrfTokenResponseDto } from './dto/csrf-token.dto';
import { RedeemReqDto, RedeemResDto, RedeemResponseDto } from './dto/redeem.dto';
import { LogoutResponseDto } from './dto/logout.dto';
import { SelectRoleReqDto } from './dto/select-role.dto';
import { EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags(AuthConstants.SWAGGER.TAG)
@Controller({ path: AuthConstants.ROUTES.AUTH })
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post(AuthConstants.ROUTES.SIGNUP)
  @ApiCreatedResponse({ type: SignupResponseDto })
  @Public()
  async signup(
    @Body() dto: SignupReqDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResponseResult<LoginResDto>> {
    return this.authService.signup(dto, res);
  }

  @Post(AuthConstants.ROUTES.LOGIN)
  @ApiOkResponse({ type: LoginResponseDto })
  @Public()
  async login(
    @Body() dto: LoginReqDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResponseResult<LoginResDto>> {
    return this.authService.login(dto, res);
  }

  /**
   * Combined role-selection/switch endpoint. The global `AuthGuard`/`JwtStrategy` accepts either a
   * `purpose: 'login'` token (issued by `login()` for a multi-role account, first role pick) or
   * an existing `purpose: 'access'` token (switching between an account's own active roles) —
   * both resolve to a valid `ICurrentUser`, so one route/method handles both cases identically.
   */
  @Post(AuthConstants.ROUTES.SELECT_ROLE)
  @AllowRoleSelectionToken()
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: LoginResponseDto })
  async selectRole(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: SelectRoleReqDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResponseResult<LoginResDto>> {
    return this.authService.selectRole(currentUser, dto, res);
  }

  /** Session-restore endpoint — returns the authenticated account's current details. */
  @Get(AuthConstants.ROUTES.ME)
  @AllowRoleSelectionToken()
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: LoginResponseDto })
  async getMe(@CurrentUser() currentUser: ICurrentUser): Promise<ResponseResult<LoginResDto>> {
    return this.authService.getMe(currentUser);
  }

  @Post(AuthConstants.ROUTES.FORGOT_PASSWORD)
  @SkipThrottle({ default: true, [RATE_LIMIT_THROTTLER_NAME]: true })
  @UseGuards(ForgotPasswordThrottleGuard)
  @Public()
  @ApiOkResponse({ type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordReqDto): Promise<ResponseResult<EmptyDataDto>> {
    return this.authService.forgotPassword(dto);
  }

  @Post(AuthConstants.ROUTES.RESEND_OTP)
  @Public()
  @ApiOkResponse({ type: ResendOtpResponseDto })
  async resendOtp(@Body() dto: ResendOtpReqDto): Promise<ResponseResult<EmptyDataDto>> {
    return this.authService.resendOtp(dto);
  }

  @Post(AuthConstants.ROUTES.VERIFY_OTP)
  @Public()
  @ApiOkResponse({ type: VerifyOtpResponseDto })
  async verifyOtp(@Body() dto: VerifyOtpReqDto): Promise<ResponseResult<EmptyDataDto>> {
    return this.authService.verifyOtp(dto);
  }

  @Post(AuthConstants.ROUTES.RESET_PASSWORD)
  @Public()
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  async resetPassword(@Body() dto: ResetPasswordReqDto): Promise<ResponseResult<EmptyDataDto>> {
    return this.authService.resetPassword(dto);
  }

  @Post(AuthConstants.ROUTES.CHANGE_PASSWORD)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.SCENARIO_ADMIN, RoleSlug.STUDENT)
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  async changePassword(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: ChangePasswordReqDto,
  ): Promise<ResponseResult<EmptyDataDto>> {
    return this.authService.changePassword(currentUser, dto);
  }

  @Get(AuthConstants.ROUTES.CSRF_TOKEN)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.SCENARIO_ADMIN, RoleSlug.STUDENT)
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: CsrfTokenResponseDto })
  async issueCsrfToken(
    @CurrentUser() currentUser: ICurrentUser,
  ): Promise<ResponseResult<CsrfTokenResDto>> {
    return this.authService.csrfToken(currentUser);
  }

  @Post(AuthConstants.ROUTES.REDEEM)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.SCENARIO_ADMIN, RoleSlug.STUDENT)
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: RedeemResponseDto })
  async redeem(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: RedeemReqDto,
  ): Promise<ResponseResult<RedeemResDto>> {
    return this.authService.redeem(currentUser, dto);
  }

  @Post(AuthConstants.ROUTES.LOGOUT)
  @AllowRoleSelectionToken()
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(
    @CurrentUser() currentUser: ICurrentUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResponseResult<EmptyDataDto>> {
    const token = extractAccessToken(req) ?? undefined;
    return this.authService.logout(currentUser, token, res);
  }
}
