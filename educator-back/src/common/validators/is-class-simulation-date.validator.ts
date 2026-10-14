import {
  registerDecorator,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ClassSimulationDateConstants } from '../constants/class-simulation.constants';

/** Accepts an MM-DD-YYYY or ISO 8601 date/date-time string that names a real calendar date. The
 * date columns are varchar, so a format-only check would let `2026-02-30` be stored, and it would
 * then parse as an invalid or rolled-over date everywhere the dates are read. */
@ValidatorConstraint({ name: 'isClassSimulationDate', async: false })
export class IsClassSimulationDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !ClassSimulationDateConstants.DATE_FORMAT.test(value)) {
      return false;
    }

    const usDate = ClassSimulationDateConstants.MM_DD_YYYY_FORMAT.exec(value);
    const [year, month, day] = (
      usDate ? [usDate[3], usDate[1], usDate[2]] : value.slice(0, 10).split('-')
    ).map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    const isRealCalendarDate =
      calendarDate.getUTCFullYear() === year &&
      calendarDate.getUTCMonth() === month - 1 &&
      calendarDate.getUTCDate() === day;

    return isRealCalendarDate && (!!usDate || !Number.isNaN(Date.parse(value)));
  }
}

export function IsClassSimulationDate(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: IsClassSimulationDateConstraint,
    });
  };
}
