import { IsEmail, IsNotEmpty, IsUUID, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { InvitesConstants } from '../invites.constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Invite, Educator } from 'src/database/entities';

export class CreateInviteDto {
  @ApiProperty({ example: InvitesConstants.VALIDATION.EMAIL_EXAMPLE })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({ example: InvitesConstants.VALIDATION.SCHOOL_ID_EXAMPLE })
  @Transform(({ value }) => (value === '' ? undefined : (value as string)))
  @IsUUID()
  @IsNotEmpty()
  school_id!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @ApiPropertyOptional({ example: '9087687656' })
  @IsOptional()
  phone_number?: string;

  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsOptional()
  tokens?: number;
}

export class RecordInviteDto {
  @ApiProperty({ example: InvitesConstants.VALIDATION.EMAIL_EXAMPLE })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({ example: InvitesConstants.VALIDATION.SCHOOL_ID_EXAMPLE })
  @Transform(({ value }) => (value === '' ? undefined : (value as string)))
  @IsUUID()
  @IsNotEmpty()
  school_id!: string;

  @ApiProperty({ example: InvitesConstants.VALIDATION.CREATOR_ID_EXAMPLE })
  @Transform(({ value }) => (value === '' ? undefined : (value as string)))
  @IsUUID()
  @IsNotEmpty()
  creator_id!: string;
}

export interface InviteCreateResponse {
  /** Null when an already-active district admin is granted the Educator role directly — no invite is created to accept. */
  invite: Invite | null;
  educator: Educator;
}

export interface InviteDetails {
  email: string;
  full_name: string;
}

export class UpdateInviteDto {
  @IsUUID('4', { message: 'Invalid Invite ID format' })
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: InvitesConstants.VALIDATION.EMAIL_EXAMPLE })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @ApiPropertyOptional({ example: '9087687656' })
  @IsOptional()
  phone_number?: string;

  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsOptional()
  tokens?: number;
}
