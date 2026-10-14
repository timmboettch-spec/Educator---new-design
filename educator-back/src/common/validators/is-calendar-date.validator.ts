import {
  registerDecorator,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { DateConstants } from '../constants/date.constants';
import { toUtc } from '../utils/dayjs.utils';

/** Accepts only a real calendar date written `YYYY-MM-DD`. `IsDateString` also accepts
 * `2026-02-31`, week/ordinal forms and timestamps; a value like `2026-02-31` then reaches
 * Postgres as a `date` parameter and fails there as a 500. */
@ValidatorConstraint({ name: 'isCalendarDate', async: false })
export class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      DateConstants.CALENDAR_DATE_REGEX.test(value) &&
      // dayjs rolls an impossible day over (`2026-02-31` -> `2026-03-03`), so a real date round-trips.
      toUtc(value).format(DateConstants.CALENDAR_DATE_FORMAT) === value
    );
  }
}

export function IsCalendarDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsCalendarDateConstraint,
    });
  };
}
