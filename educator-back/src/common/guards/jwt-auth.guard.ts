import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    roles: string[];
    type?: string;
  };
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    this.logger.log(
      `[JWT Guard] Authorization header: ${request.headers.authorization || 'UNDEFINED'}`,
    );

    try {
      const canActivate = await super.canActivate(context);
      this.logger.log(`[JWT Guard] canActivate result: ${canActivate ? 'true' : 'false'}`);

      if (canActivate) {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        this.logger.log(
          `[JWT Guard] User authenticated: userId=${request.user?.userId}, type=${request.user?.type}, roles=${request.user?.roles?.join(',') || 'none'}`,
        );
        this.cls.set('user', request.user);
      }

      return canActivate as boolean;
    } catch (error) {
      this.logger.error(
        `[JWT Guard] Authentication failed: ${(error as Error).message || 'Unknown error'}`,
      );
      throw error;
    }
  }
}
