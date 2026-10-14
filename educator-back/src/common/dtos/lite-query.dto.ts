import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VALIDATION_MSG } from '../messages/validation.message';
import { toOptionalBoolean } from '../utils/query-array.util';

/** Mix into a list-endpoint request DTO via IntersectionType to opt into a lite, dropdown-shaped response. */
export class LiteQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('lite') })
  @ApiPropertyOptional({
    example: true,
    description: 'Return only dropdown-shaped fields, skipping expensive per-row aggregates.',
  })
  lite?: boolean;
}
