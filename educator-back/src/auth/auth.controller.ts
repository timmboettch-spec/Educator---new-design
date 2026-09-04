import {
  Controller,
  Post,
  Get,
  Body,
  BadRequestException,
  UseGuards,
  Req,
  Headers,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SignupDto,
  LoginDto,
  RedeemDto,
  ResendOtpDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import type { ApiResponse } from 'src/common/types';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as types from 'src/common/types';
import { throwAppError } from '../common/utils/app-error';
import { Messages, AppStatus } from '../common/utils/messages';
import { AuthConstants } from './auth.constants';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { CsrfService } from '../csrf/csrf.service';

@ApiTags(AuthConstants.SWAGGER.TAG)
@Controller(AuthConstants.ROUTES.AUTH)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private blacklistService: TokenBlacklistService,
    private readonly csrfService: CsrfService,
  ) {}

  @Post(AuthConstants.ROUTES.SIGNUP)
  async signup(@Body() body: SignupDto): Promise<ApiResponse> {
    const result = await this.authService.signup(body);
    if (result.success === false) {
      return throwAppError(result.message || Messages.SIGNUP_FAILED);
    }
    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SIGNUP_SUCCESS,
      data: result.data,
    };
  }

  @Post(AuthConstants.ROUTES.DUALSIGNUP)
  async dualsignup(@Body() body: SignupDto): Promise<ApiResponse> {
    const result = await this.authService.dualsignup(body);
    if (result.success === false) {
      return throwAppError(result.message || Messages.SIGNUP_FAILED);
    }
    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SIGNUP_SUCCESS,
      data: result.data,
    };
  }

@Post(AuthConstants.ROUTES.LOGIN)
async login(@Body() body: LoginDto): Promise<ApiResponse> {
  const result = await this.authService.login(body);

  if (result.success === false) {
    return throwAppError(result.message || Messages.LOGIN_FAILED, result.type);
  }

  const csrfToken = await this.csrfService.generateToken();

  const rawData: unknown = result.data;
  const data = this.asRecord(rawData);
  const tokens = this.asRecord(data['tokens']);

  const responseData: Record<string, unknown> = {
    ...data,
    tokens: {
      ...tokens,
      csrfToken,
    },
  };

  if (data['has_dual_role']) {
    const educatorTokens = this.asRecord(data['educator_tokens']);

    responseData['educator_tokens'] = {
      ...educatorTokens,
      csrfToken,
    };
  }

  return {
    status: AppStatus.SUCCESS,
    message: Messages.LOGIN_SUCCESS,
    data: responseData,
  };
}

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    return {};
  }

  @Get(AuthConstants.ROUTES.CSRF_TOKEN)
  @UseGuards(AuthGuard(AuthConstants.STRATEGY.JWT))
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  async issueCsrfToken(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    const sub =
      (req.user as { sub?: string; id?: string; type?: string } | undefined)?.sub ??
      (req.user as { id?: string } | undefined)?.id ??
      'unknown';
    const type = (req.user as { type?: string } | undefined)?.type ?? 'unknown';
    this.logger.warn(`[RCA][issueCsrfToken] JWT validated — sub=${sub} type=${type}`);

    const csrfToken = await this.csrfService.generateToken();

    const body: ApiResponse = {
      status: AppStatus.SUCCESS,
      message: 'CSRF token issued',
      data: { csrfToken },
    };
    this.logger.warn(
      `[RCA][issueCsrfToken] response body keys=${JSON.stringify(Object.keys(body))} dataKeys=${JSON.stringify(Object.keys(body.data ?? {}))}`,
    );
    return body;
  }

  @Post(AuthConstants.ROUTES.REDEEM)
  @UseGuards(AuthGuard(AuthConstants.STRATEGY.JWT))
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  async redeem(@Body() body: RedeemDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const { code } = body;
    const userEmail = req.user?.email;

    if (!userEmail) {
      throw new BadRequestException(Messages.INVALID_USER_CONTEXT);
    }
    const result = await this.authService.redeem({ code, email: userEmail });
    if (result.success === false) {
      return throwAppError(result.message || Messages.REDEMPTION_FAILED, result.type);
    }

    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.LICENSE_ACTIVATED,
      data: result.data,
    };
  }

  @Post(AuthConstants.ROUTES.LOGOUT)
  @UseGuards(AuthGuard(AuthConstants.STRATEGY.JWT))
  @ApiBearerAuth(AuthConstants.SWAGGER.JWT_AUTH)
  logout(@Headers('authorization') authHeader?: string): {
    status?: string;
    message: string;
    data?: null;
  } {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    if (!token) {
      return { message: AuthConstants.MESSAGES.NO_TOKEN_PROVIDED };
    }
    this.blacklistService.add(token);
    return {
      status: AppStatus.SUCCESS,
      message: AuthConstants.MESSAGES.LOGOUT_SUCCESS,
      data: null,
    };
  }

  @Post(AuthConstants.ROUTES.FORGOT_PASSWORD)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<ApiResponse> {
    const result = await this.authService.forgotPassword(body);
    if (result.success === false) {
      return throwAppError(result.message || 'Failed to send OTP', result.type);
    }
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(AuthConstants.ROUTES.VERIFY_OTP)
  async verifyOtp(@Body() body: VerifyOtpDto): Promise<ApiResponse> {
    const result = await this.authService.verifyOtp(body);
    if (result.success === false) {
      return throwAppError(result.message || 'OTP verification failed', result.type);
    }
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(AuthConstants.ROUTES.RESEND_OTP)
  async resendOtp(@Body() body: ResendOtpDto): Promise<ApiResponse> {
    const result = await this.authService.resendOtp(body);
    if (result.success === false) {
      return throwAppError(result.message || 'Failed to resend OTP', result.type);
    }
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(AuthConstants.ROUTES.RESET_PASSWORD)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<ApiResponse> {
    const result = await this.authService.resetPassword(body);
    if (result.success === false) {
      return throwAppError(result.message || 'Password reset failed', result.type);
    }
    return { status: AppStatus.SUCCESS, message: result.message!, data: null };
  }
}
