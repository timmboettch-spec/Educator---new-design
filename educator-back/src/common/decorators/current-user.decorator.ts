import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtRequest } from '../types';
import { ICurrentUser } from '../interfaces';


/**
 * Extracts `request.user` (populated by JwtStrategy) — use as the first
 * parameter of any new-module controller method whose service call passes
 * currentUser through, per service-rules.md.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ICurrentUser => {
    const request = ctx.switchToHttp().getRequest<JwtRequest>();
    return request.user;
  },
);
