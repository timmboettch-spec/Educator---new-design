import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LmsToolType, LmsType } from 'src/common/enums/lms.enum';

export class ConfigureLmsDto {
  @ApiProperty({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({ enum: LmsType })
  @IsEnum(LmsType)
  lmsType!: LmsType;

  @ApiPropertyOptional({
    enum: LmsToolType,
    default: LmsToolType.EDUCATOR,
    description: 'LTI tool type: educator or student. Defaults to educator.',
  })
  @IsOptional()
  @IsEnum(LmsToolType)
  toolType?: LmsToolType;

  @ApiProperty({ example: 'http://localhost' })
  @IsUrl({ require_tld: false })
  issuer!: string;

  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @ApiProperty({ example: 'https://lms.example.edu/oidc/auth' })
  @IsUrl({ require_tld: false })
  authEndpoint!: string;

  @ApiProperty({ example: 'https://lms.example.edu/oidc/token' })
  @IsUrl({ require_tld: false })
  tokenEndpoint!: string;

  @ApiProperty({ example: 'https://lms.example.edu/oidc/jwks' })
  @IsUrl({ require_tld: false })
  jwksUrl!: string;

  @ApiPropertyOptional({
    description:
      'Educator Portal tool private key PEM. Leave empty on first save to auto-generate.',
  })
  @IsOptional()
  @IsString()
  platformPrivateKeyPem?: string;

  @ApiPropertyOptional({
    description: 'Educator Portal tool key ID. Leave empty on first save to auto-generate.',
  })
  @IsOptional()
  @IsString()
  platformKeyId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sharePii?: boolean;

  @ApiPropertyOptional({
    description:
      'LMS base URL (e.g. https://lms.example.edu). Used for API calls and WS fallback. Moodle: site root; Canvas: account domain; etc.',
    example: 'https://realitywork.moodlecloud.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  lmsBaseUrl?: string;

  /** @deprecated Use lmsBaseUrl — kept for backward compatibility */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  moodleUrl?: string;

  @ApiPropertyOptional({
    description:
      'LMS API token for roster/grade sync. Platform-specific: Moodle WS token, Canvas API key, etc. Kept server-side only.',
  })
  @IsOptional()
  @IsString()
  lmsApiToken?: string;

  /** @deprecated Use lmsApiToken — kept for backward compatibility */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  moodleWsToken?: string;
}

/** All fields optional — merge with saved school config for pre/post-save tests. Never persists. */
export class TestLmsConfigDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ enum: LmsType })
  @IsOptional()
  @IsEnum(LmsType)
  lmsType?: LmsType;

  @ApiPropertyOptional({
    enum: LmsToolType,
    default: LmsToolType.EDUCATOR,
    description: 'LTI tool type: educator or student. Defaults to educator.',
  })
  @IsOptional()
  @IsEnum(LmsToolType)
  toolType?: LmsToolType;

  @ApiPropertyOptional({ example: 'http://localhost' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @ApiPropertyOptional({ example: 'https://lms.example.edu/oidc/auth' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  authEndpoint?: string;

  @ApiPropertyOptional({ example: 'https://lms.example.edu/oidc/token' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  tokenEndpoint?: string;

  @ApiPropertyOptional({ example: 'https://lms.example.edu/oidc/jwks' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  jwksUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platformPrivateKeyPem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platformKeyId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sharePii?: boolean;

  @ApiPropertyOptional({
    description: 'LMS base URL for API/WS ping',
    example: 'https://realitywork.moodlecloud.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  lmsBaseUrl?: string;

  /** @deprecated Use lmsBaseUrl */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  moodleUrl?: string;

  @ApiPropertyOptional({
    description: 'LMS API token (Moodle WS token or Canvas API key)',
  })
  @IsOptional()
  @IsString()
  lmsApiToken?: string;

  /** @deprecated Use lmsApiToken */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  moodleWsToken?: string;
}

export class LmsRosterPreviewQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  nrpsUrl!: string;
}

export class LmsStudentProfileQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classId!: string;
}

export class ProvisionSyncDto {
  @ApiPropertyOptional({ description: 'LMS course / LTI context id for the mapped class' })
  @IsOptional()
  @IsString()
  lmsCourseId?: string;

  /** @deprecated Use lmsCourseId — kept for backward compatibility during rollout */
  @ApiPropertyOptional({ deprecated: true, description: 'Use lmsCourseId instead' })
  @IsOptional()
  @IsString()
  moodleCourseId?: string;

  @ApiPropertyOptional({ description: 'NRPS membership URL for the course roster' })
  @IsOptional()
  @IsString()
  nrpsUrl?: string;

  @ApiPropertyOptional({
    description: 'School context for the LMS course (defaults to educator primary school)',
  })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
