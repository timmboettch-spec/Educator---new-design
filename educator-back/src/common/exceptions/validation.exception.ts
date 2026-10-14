import { BadRequestException } from '@nestjs/common';
import { IValidationMessageDetail } from '../interfaces/response.interface';

/**
 * Thrown only by `createValidationPipe`'s `exceptionFactory` (class-validator
 * constraint failures) so `HttpExceptionFilter` can tell a real per-field
 * validation failure apart from a plain `BadRequestException` a service throws
 * for a business-rule error — the two need different `error` shapes on the
 * response (field-keyed object vs. a simple string).
 */
export class ValidationException extends BadRequestException {
  /**
   * The same failures as the response `message` array, each still paired with
   * the DTO property it belongs to. `HttpExceptionFilter` prefers this over
   * re-deriving the field from an i18n key's `args.key`, so legacy DTOs with
   * plain-string messages still get a real field name instead of `field_0`.
   */
  readonly details: IValidationMessageDetail[];

  constructor(details: IValidationMessageDetail[]) {
    super(details.map((detail) => detail.message));
    this.details = details;
  }
}
