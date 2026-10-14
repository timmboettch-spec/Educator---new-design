import {
  isUUID,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** Accepts a v4 UUID or a specific literal sentinel string (e.g. `"unassigned"`), passed in
 * via the decorator's `sentinel` argument rather than hardcoded, so this validator is reusable
 * across any field that needs an "id or a specific sentinel" pattern. */
@ValidatorConstraint({ name: 'isUuidOrSentinel', async: false })
export class IsUuidOrSentinelConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const [sentinel] = args.constraints as [string];
    return value === sentinel || isUUID(value, '4');
  }

  defaultMessage(args: ValidationArguments): string {
    const [sentinel] = args.constraints as [string];
    return `Each value must be a valid UUID or "${sentinel}"`;
  }
}

export function IsUuidOrSentinel(sentinel: string, validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [sentinel],
      validator: IsUuidOrSentinelConstraint,
    });
  };
}
