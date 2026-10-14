import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { ClassTransferTargetSortField } from 'src/common/constants';

export class ListTransferTargetEducatorsReqDto extends PaginationDto {
  @IsOptional()
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('search', 200) })
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @ApiPropertyOptional({
    example: 'Max',
    maxLength: 200,
    description: 'Matches the full name or the email.',
  })
  search?: string;

  @IsOptional()
  @IsIn(Object.values(ClassTransferTargetSortField), { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({
    enum: ClassTransferTargetSortField,
    example: ClassTransferTargetSortField.NAME,
    default: ClassTransferTargetSortField.NAME,
    description:
      'name sorts on the displayed label (full name, else email, else id). Defaults to name.',
  })
  sortBy?: ClassTransferTargetSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: VALIDATION_MSG.IS_ENUM('sortDir') })
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc', example: 'asc' })
  sortDir?: 'asc' | 'desc';
}

/** An educator the classes can be handed to: same admin, active, and not the source educator. */
export class TransferTargetEducatorItemResDto {
  @ApiProperty({ example: '33b7e536-9585-4c7e-8d9e-89c315bfb076' })
  educatorId!: string;

  @ApiProperty({
    example: 'Max Educator',
    description: 'Full name; falls back to the email, then the id, when the name is not set.',
  })
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: 'max.educator@school.org' })
  email!: string | null;

  @ApiProperty({
    example: 2,
    description:
      'Number of schools the educator is assigned to. A count, not a list, so the row stays small however many schools there are.',
  })
  schoolsCount!: number;
}

export class ListTransferTargetEducatorsResponseDto extends ApiPaginatedResponseDto(
  TransferTargetEducatorItemResDto,
  'Educators fetched successfully.',
) {}
