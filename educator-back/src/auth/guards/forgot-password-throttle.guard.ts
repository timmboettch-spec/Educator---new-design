import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ForgotPasswordRateLimiterService } from '../services/forgot-password-rate-limiter.service';
import { LoggerService } from '../../common/services';

@Injectable()
export class ForgotPasswordThrottleGuard implements CanActivate {
  constructor(
    @Optional() private readonly rateLimiter?: ForgotPasswordRateLimiterService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.rateLimiter) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as unknown as Record<string, unknown>)
        : undefined;
    const rawEmail = body?.['email'];
    const email = typeof rawEmail === 'string' ? rawEmail : undefined;
    const ip = this.extractIp(request);

    const result = await this.rateLimiter.consume(email, ip);

    if (!result.allowed) {
      const retryAfter = Math.max(1, result.retryAfter ?? 1);

      if (typeof response?.setHeader === 'function') {
        response.setHeader('Retry-After', String(retryAfter));
      }

      this.logger?.warn?.(
        `[ForgotPasswordThrottleGuard] Throttled forgot-password request: reason=${result.reason}, retryAfter=${retryAfter}s, ip=${ip}`,
      );

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: result.message || 'Too many password reset requests. Please try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extractIp(request: Request): string {
    const xff = request.headers?.['x-forwarded-for'];
    const xffFirst = Array.isArray(xff)
      ? xff[0]
      : typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : undefined;

    return xffFirst || request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
