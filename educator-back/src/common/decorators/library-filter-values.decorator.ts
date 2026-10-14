import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { SimulationConstants } from '../constants/simulation.constants';
import { VALIDATION_MSG } from '../messages/validation.message';
import { toRepeatedStringArray } from '../utils/query-array.util';

/**
 * A multi-value free-text My Library filter: optional, repeated query parameters (a single value
 * also works, commas are not separators), each value a string of bounded length (blank entries are dropped, so
 * an all-blank parameter means no filter), with a bounded number of values. Whether a value exists is not checked; an unknown one matches nothing.
 */
export function LibraryFilterValues(name: string): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => toRepeatedStringArray(value)),
    IsArray({ message: VALIDATION_MSG.IS_ARRAY(name) }),
    ArrayMaxSize(SimulationConstants.LIBRARY_FILTER.MAX_VALUES_PER_FILTER, {
      message: VALIDATION_MSG.ARRAY_MAX_SIZE(
        name,
        SimulationConstants.LIBRARY_FILTER.MAX_VALUES_PER_FILTER,
      ),
    }),
    IsString({ each: true, message: VALIDATION_MSG.IS_STRING(name) }),
    MaxLength(SimulationConstants.LIBRARY_FILTER.MAX_VALUE_LENGTH, {
      each: true,
      message: VALIDATION_MSG.MAX_LENGTH(name, SimulationConstants.LIBRARY_FILTER.MAX_VALUE_LENGTH),
    }),
  );
}
