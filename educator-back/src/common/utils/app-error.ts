import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ErrorTypes } from './messages';

export type ErrorType = (typeof ErrorTypes)[keyof typeof ErrorTypes];

export function throwAppError(message: string, type?: string): never {
  const errorBody = { status: 'FAILED', message, data: null };
  const resolvedType = type ?? ErrorTypes.BAD_REQUEST;

  if (resolvedType === (ErrorTypes.UNAUTHORIZED as string)) {
    throw new UnauthorizedException(errorBody);
  }
  if (resolvedType === (ErrorTypes.FORBIDDEN as string)) {
    throw new ForbiddenException(errorBody);
  }
  if (resolvedType === (ErrorTypes.NOT_FOUND as string)) {
    throw new NotFoundException(errorBody);
  }
  if (resolvedType === (ErrorTypes.INTERNAL_SERVER_ERROR as string)) {
    throw new InternalServerErrorException(errorBody);
  }
  throw new BadRequestException(errorBody);
}
