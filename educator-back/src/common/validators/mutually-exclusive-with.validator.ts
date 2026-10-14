import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

function getOtherFields(args: ValidationArguments): string[] {
  return args.constraints[0] as string[];
}

/** Rejects a field when any of the given sibling fields is also present on the same object. */
@ValidatorConstraint({ name: 'mutuallyExclusiveWith', async: false })
export class MutuallyExclusiveWithConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    const target = args.object as Record<string, unknown>;
    return getOtherFields(args).every((field) => target[field] == null);
  }

  defaultMessage(args: ValidationArguments): string {
    return VALIDATION_MSG.MUTUALLY_EXCLUSIVE(args.property, getOtherFields(args).join(', '));
  }
}

export function MutuallyExclusiveWith(
  otherFields: string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [otherFields],
      validator: MutuallyExclusiveWithConstraint,
    });
  };
}
