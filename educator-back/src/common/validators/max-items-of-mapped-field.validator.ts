import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

function getFieldByValue(args: ValidationArguments): Record<string, string> {
  return args.constraints[0] as Record<string, string>;
}

function getMax(args: ValidationArguments): number {
  return args.constraints[1] as number;
}

function getMappedField(value: unknown, args: ValidationArguments): string | undefined {
  const fieldByValue = getFieldByValue(args);
  return typeof value === 'string' && Object.hasOwn(fieldByValue, value)
    ? fieldByValue[value]
    : undefined;
}

function getListFor(value: unknown, args: ValidationArguments): unknown {
  const field = getMappedField(value, args);
  return field ? (args.object as Record<string, unknown>)[field] : undefined;
}

/**
 * Caps the sibling array that the decorated field's value points at (e.g. `compareBy: 'class'`
 * caps `classIds`). A value with no mapped field, or an absent/non-array list, passes.
 */
@ValidatorConstraint({ name: 'maxItemsOfMappedField', async: false })
export class MaxItemsOfMappedFieldConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const list = getListFor(value, args);
    return !Array.isArray(list) || list.length <= getMax(args);
  }

  defaultMessage(args: ValidationArguments): string {
    const field = getMappedField(args.value, args) ?? args.property;
    return VALIDATION_MSG.ARRAY_MAX_SIZE(field, getMax(args));
  }
}

export function MaxItemsOfMappedField(
  fieldByValue: Record<string, string>,
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [fieldByValue, max],
      validator: MaxItemsOfMappedFieldConstraint,
    });
  };
}
