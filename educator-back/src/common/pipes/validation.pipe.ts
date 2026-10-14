import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ValidationException } from '../exceptions/validation.exception';
import { IValidationMessageDetail } from '../interfaces/response.interface';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): IValidationMessageDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownDetails = error.constraints
      ? Object.values(error.constraints).map((message) => ({ field, message }))
      : [];
    const childDetails = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];
    return [...ownDetails, ...childDetails];
  });
}

/**
 * Shared `exceptionFactory` for any `ValidationPipe` instance that should be
 * recognized by `HttpExceptionFilter` as a real per-field validation
 * failure (vs. a plain `BadRequestException` a service throws for a
 * business-rule error). Nest runs global pipes before controller-scoped
 * ones, so `app.useGlobalPipes` in `main.ts` must also use this factory —
 * otherwise the global pipe's default `BadRequestException` fires first for
 * routes on modules relying on it and `createValidationPipe()` below never even runs.
 * Safe for existing modules too: `ValidationException` only adds an
 * `instanceof` marker, `HttpExceptionFilter` still just sees a
 * `BadRequestException`.
 */
export function validationExceptionFactory(errors: ValidationError[]): ValidationException {
  return new ValidationException(flattenValidationErrors(errors));
}

/**
 * The app-wide global ValidationPipe, registered once via `app.useGlobalPipes`
 * in main.ts (and mirrored in `buildTestApp` for integration tests). Its
 * `exceptionFactory` passes each constraint message through unchanged: new
 * modules' messages are already the `key|argsJSON` strings produced by
 * VALIDATION_MSG, and get translated by HttpExceptionFilter.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: validationExceptionFactory,
  });
}
