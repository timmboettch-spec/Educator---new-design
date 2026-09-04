import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsBoolean,
  IsOptional,
  IsIn,
  IsString,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must contain at least 6 characters' })
  password!: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Remember me must be a boolean value' })
  rememberMe?: boolean;

  // Optional login scope. When set to 'admin' the auth service will reject
  // non-ADMIN users with 403 *before* issuing a token. Omitting it keeps the
  // existing behaviour so other clients are not affected.
  @ApiProperty({ example: 'admin', required: false, enum: ['admin'] })
  @IsOptional()
  @IsIn(['admin'], { message: "scope must be 'admin' when provided" })
  scope?: 'admin';

  // Optional device type for telemetry (e.g., 'desktop', 'mobile', 'tablet')
  @ApiProperty({ example: 'desktop', required: false })
  @IsOptional()
  @IsString()
  deviceType?: string;

  // Optional platform for telemetry (e.g., 'Windows', 'macOS', 'iOS', 'Android')
  @ApiProperty({ example: 'Windows', required: false })
  @IsOptional()
  @IsString()
  platform?: string;
}
