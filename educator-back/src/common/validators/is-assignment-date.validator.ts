import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { parseStrictAssignmentDate } from 'src/common/utils/assignment-date.util';

/** A real calendar date in `MM-DD-YYYY` or ISO (`YYYY-MM-DD[T…]`) — rejects `02-31-2026`. */
@ValidatorConstraint({ name: 'isAssignmentDate', async: false })
export class IsAssignmentDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && parseStrictAssignmentDate(value) !== null;
  }

  defaultMessage(args: ValidationArguments): string {
    return VALIDATION_MSG.INVALID(args.property);
  }
}

export function IsAssignmentDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsAssignmentDateConstraint,
    });
  };
}
