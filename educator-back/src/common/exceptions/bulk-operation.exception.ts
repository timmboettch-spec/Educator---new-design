import { UnprocessableEntityException } from '@nestjs/common';
import {
  IBulkOperationErrorDetail,
  IBulkOperationResultItem,
} from '../interfaces/response.interface';

/**
 * An all-or-nothing bulk operation refused because one or more records failed — nothing was
 * written. `HttpExceptionFilter` answers it with 422 and puts `detail` (every record's outcome,
 * each `message` translated) in the envelope's `error`, which a plain `HttpException` can't carry.
 */
export class BulkOperationException<
  T extends IBulkOperationResultItem = IBulkOperationResultItem,
> extends UnprocessableEntityException {
  readonly detail: IBulkOperationErrorDetail<T>;

  /** `message` is an i18n key (see `encodeI18nKey`). */
  constructor(message: string, detail: IBulkOperationErrorDetail<T>) {
    super(message);
    this.detail = detail;
  }
}
