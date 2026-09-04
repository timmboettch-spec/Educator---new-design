import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CommonStatus } from 'src/common/enums/status.enum';

export class CreateEducatorDto {
  @ApiProperty({ example: 'educator@school.edu' })
  @IsEmail({}, { message: 'A valid email is required' })
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email?: string;

  @ApiPropertyOptional({ example: 'P@ssword123' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @ApiPropertyOptional({ enum: CommonStatus, default: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus, { message: 'Status must be ACTIVE or INACTIVE' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: 'UUID of the school this educator belongs to' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'school_id must be a valid UUID' })
  school_id?: string;

  @ApiPropertyOptional({ description: 'Phone number of the educator' })
  @IsOptional()
  @IsString()
  phone_number?: string;

  @ApiPropertyOptional({ description: 'Number of tokens/seats to allocate' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500, { message: 'Maximum 500 seats can be allocated per educator' })
  tokens?: number;
}

export class UpdateEducatorDto {
  @ApiPropertyOptional({ enum: CommonStatus })
  @IsOptional()
  @IsEnum(CommonStatus, { message: 'Status must be ACTIVE or INACTIVE' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: 'UUID of the school' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'school_id must be a valid UUID' })
  school_id?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ description: 'Phone number of the educator' })
  @IsOptional()
  @IsString()
  phone_number?: string;

  @ApiPropertyOptional({ description: 'Number of tokens to allocate' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500, { message: 'Maximum 500 seats can be allocated per educator' })
  tokens?: number;
}

export class EducatorIdDto {
  @IsUUID('4', { message: 'Invalid Educator ID format' })
  @IsNotEmpty()
  id?: string;
}

export class AdminIdDto {
  @IsUUID('4', { message: 'Invalid Admin ID format' })
  @IsNotEmpty()
  adminId?: string;
}

export class RequestSeatsDto {
  @ApiPropertyOptional({
    example: 25,
    description:
      'Suggested number of additional AI seats. Optional — omit to send a general "please allocate more seats" request.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null || value === undefined ? undefined : Number(value),
  )
  @IsInt({ message: 'requested_seats must be an integer' })
  @Min(1, { message: 'requested_seats must be at least 1' })
  @Max(500, { message: 'requested_seats cannot exceed 500' })
  requested_seats?: number;

  @ApiPropertyOptional({
    example: 'Preparing three new classes next month — could I get more AI seats?',
    description: 'Optional message from the educator to the admin.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500, { message: 'note must be 500 characters or fewer' })
  note?: string;
}

export class RemoveSeatsDto {
  @ApiProperty({
    example: 10,
    description: 'Number of available seats to remove from the educator and refund to the admin',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? value : Number(value)))
  @IsInt({ message: 'Amount must be a whole number' })
  @Min(1, { message: 'Amount must be at least 1' })
  amount!: number;
}

export class ReallocateSeatsDto {
  @ApiProperty({ description: 'UUID of the target educator who will receive the seats' })
  @IsNotEmpty()
  @IsUUID('4', { message: 'target_educator_id must be a valid UUID' })
  target_educator_id!: string;

  @ApiProperty({
    example: 5,
    description: 'Number of available seats to transfer from source educator to target educator',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? value : Number(value)))
  @IsInt({ message: 'Amount must be a whole number' })
  @Min(1, { message: 'Amount must be at least 1' })
  amount!: number;
}
