import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { toOptionalBoolean } from 'src/common/utils/query-array.util';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { ClassTransferFailureReason, ClassTransferListSortField } from 'src/common/constants';
import { ClassResponseDto } from 'src/database/response-dto';

export class ListTransferClassesReqDto extends PaginationDto {
  @IsOptional()
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('search', 200) })
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @ApiPropertyOptional({ example: 'Biology' })
  search?: string;

  /**
   * The receiving educator, once chosen. When set, each class is also checked against the rules
   * that depend on the receiver (school, Google Classroom), exactly as the bulk transfer does.
   */
  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('targetEducatorId') })
  @ApiPropertyOptional({ example: '33b7e536-9585-4c7e-8d9e-89c315bfb076' })
  targetEducatorId?: string;

  /**
   * Only classes this educator could hand over (hides inactive ones). Educator-level: with
   * `targetEducatorId`, a listed class can still be non-transferable for receiver reasons.
   */
  @IsOptional()
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('transferableOnly') })
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Only classes this educator could hand over (hides inactive classes). With targetEducatorId, a class can still be non-transferable for receiver reasons (school, Google Classroom).',
  })
  transferableOnly?: boolean;

  @IsOptional()
  @IsIn(Object.values(ClassTransferListSortField), { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({
    enum: ClassTransferListSortField,
    example: ClassTransferListSortField.CLASS_NAME,
    description: 'Defaults to newest class first.',
  })
  sortBy?: ClassTransferListSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: VALIDATION_MSG.IS_ENUM('sortDir') })
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc', example: 'asc' })
  sortDir?: 'asc' | 'desc';
}

/**
 * Picks the shared class fields from `ClassResponseDto`. `schoolId` is declared here instead,
 * because this endpoint always returns it (`null` for a class with no school), whereas it is
 * optional on `ClassResponseDto`. The examples describe one inactive class, so the flags agree.
 */
export class TransferClassItemResDto extends PickType(ClassResponseDto, [
  'classId',
  'className',
  'status',
  'isActive',
  'startDate',
  'endDate',
] as const) {
  @ApiProperty({ example: 28, description: 'Live count of active students in the class.' })
  studentsCount!: number;

  @ApiProperty({ nullable: true, type: String, example: '43637818-250a-4579-ad73-de15e51a92f8' })
  schoolId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Lincoln High' })
  schoolName!: string | null;

  @ApiProperty({ example: false, description: 'Linked to a Google Classroom course.' })
  googleLinked!: boolean;

  @ApiProperty({
    example: false,
    description:
      "Without targetEducatorId: only the receiver-independent rules (the class is active). With targetEducatorId: every rule the bulk transfer applies, including the receiver's school and Google Classroom connection.",
  })
  transferable!: boolean;

  @ApiProperty({
    enum: ClassTransferFailureReason,
    nullable: true,
    example: ClassTransferFailureReason.CLASS_INACTIVE,
    description: 'Why the class cannot be transferred; null when it can.',
  })
  reasonCode!: ClassTransferFailureReason | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'This class is inactive and cannot be transferred.',
    description: 'Translated text for reasonCode; null when the class can be transferred.',
  })
  reason!: string | null;
}

export class ListTransferClassesResponseDto extends ApiPaginatedResponseDto(
  TransferClassItemResDto,
  'Classes fetched successfully.',
) {}
