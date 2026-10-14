import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsUUID,
} from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { ClassConstants, ClassTransferFailureReason } from 'src/common/constants';

// Decorators run bottom-up and only the first failure is reported: keep basic checks at the bottom.
export class BulkClassTransferReqDto {
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('sourceEducatorId') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('sourceEducatorId') })
  @ApiProperty({ example: 'acb51f33-6b6b-44aa-ba11-2ff670f5b68b' })
  sourceEducatorId!: string;

  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('targetEducatorId') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('targetEducatorId') })
  @ApiProperty({ example: '33b7e536-9585-4c7e-8d9e-89c315bfb076' })
  targetEducatorId!: string;

  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classIds') })
  @ArrayUnique({ message: VALIDATION_MSG.ARRAY_UNIQUE('classIds') })
  @ArrayMaxSize(ClassConstants.TRANSFER.BULK_MAX_CLASSES, {
    message: VALIDATION_MSG.ARRAY_MAX_SIZE('classIds', ClassConstants.TRANSFER.BULK_MAX_CLASSES),
  })
  @ArrayNotEmpty({ message: VALIDATION_MSG.ARRAY_NOT_EMPTY('classIds') })
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('classIds') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('classIds') })
  @ApiProperty({
    example: ['c5ee0000-0000-4000-8000-c1a550000001', '6f1d2c3b-4a5e-4f60-9b7a-8c9d0e1f2a3b'],
    maxItems: ClassConstants.TRANSFER.BULK_MAX_CLASSES,
  })
  classIds!: string[];
}

export class BulkClassTransferEducatorResDto {
  @ApiProperty({ example: 'acb51f33-6b6b-44aa-ba11-2ff670f5b68b' })
  id!: string;

  @ApiProperty({ example: 'Jhon Educator' })
  name!: string;
}

export class BulkClassTransferredItemResDto {
  @ApiProperty({ example: 'c5ee0000-0000-4000-8000-c1a550000001' })
  classId!: string;

  @ApiProperty({ example: 'Biology, Period 3' })
  className!: string;

  @ApiProperty({ example: 'e446f8f1-fa0d-4227-ae13-09b6b6229d65' })
  auditId!: string;

  @ApiProperty({ example: '2026-10-08T07:56:24.801Z' })
  transferredAt!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example:
      'This class is linked to Google Classroom. Add Max Educator to the Google Classroom course first so roster sync and grade passback keep working.',
  })
  notice!: string | null;
}

export class BulkClassTransferFailedItemResDto {
  @ApiProperty({ example: '6f1d2c3b-4a5e-4f60-9b7a-8c9d0e1f2a3b' })
  classId!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Chemistry, Period 1' })
  className!: string | null;

  @ApiProperty({
    enum: ClassTransferFailureReason,
    example: ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
  })
  reasonCode!: ClassTransferFailureReason;

  @ApiProperty({ example: "The receiving educator is not assigned to this class's school." })
  reason!: string;
}

export class BulkClassTransferResDto {
  @ApiProperty({ example: '0b8f3c1e-2d4a-4b6c-8e9f-a1b2c3d4e5f6' })
  batchId!: string;

  @ApiProperty({ type: BulkClassTransferEducatorResDto })
  sourceEducator!: BulkClassTransferEducatorResDto;

  @ApiProperty({ type: BulkClassTransferEducatorResDto })
  targetEducator!: BulkClassTransferEducatorResDto;

  @ApiProperty({ example: 2 })
  requestedCount!: number;

  @ApiProperty({ example: 1 })
  transferredCount!: number;

  @ApiProperty({ example: 1 })
  failedCount!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-10-08T07:56:24.846Z',
    description: 'When the last class in this batch was transferred; null when none was.',
  })
  transferredAt!: string | null;

  @ApiProperty({ type: [BulkClassTransferredItemResDto] })
  transferred!: BulkClassTransferredItemResDto[];

  @ApiProperty({ type: [BulkClassTransferFailedItemResDto] })
  failed!: BulkClassTransferFailedItemResDto[];
}

export class BulkClassTransferResponseDto extends ApiResponseDto(
  BulkClassTransferResDto,
  '1 of 2 classes transferred.',
) {}
