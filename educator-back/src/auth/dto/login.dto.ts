import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { DistrictAdminResponseDto } from 'src/database/response-dto';
import { CommonStatus } from 'src/common/enums/status.enum';
import { LoginAccessStatus } from 'src/common/constants';

export class LoginReqDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: VALIDATION_MSG.IS_EMAIL('email') })
  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('password') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('password') })
  @ApiProperty({ example: 'StrongP@ssw0rd' })
  password!: string;
}

export class LoginDistrictAdminDto extends PickType(DistrictAdminResponseDto, [
  'districtAdminId',
  'fullName',
  'isLicenseActive',
  'subscriptions',
] as const) {
  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/ava-thompson.png' })
  profilePictureUrl?: string | null;
}

/** One entry of `LoginEducatorDto.schools` — mirrors `EducatorSchoolAuthDto` (`educator-school.util.ts`). */
export class LoginEducatorSchoolDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'Lakeside High School' })
  schoolName!: string;

  @ApiProperty({ example: false })
  lmsEnabled!: boolean;

  @ApiProperty({ example: true })
  googleClassroomEnabled!: boolean;
}

/** Legacy `educators` row linked via the specific EDUCATOR user_roles row — not part of the src/database response-dto layer. */
export class LoginEducatorDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  /** Empty for educators created via the v2-backed invite flow — see user.email instead. */
  @ApiPropertyOptional({ example: 'ava.thompson@example.com' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'Ava Thompson' })
  fullName!: string | null;

  @ApiProperty({ example: CommonStatus.ACTIVE, enum: CommonStatus })
  status!: CommonStatus;

  @ApiPropertyOptional({ example: '+1 555 0100' })
  phoneNumber!: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/ava-thompson.png' })
  profilePictureUrl?: string | null;

  @ApiProperty({ example: false })
  lmsEnabled!: boolean;

  /** School ids/names the educator is assigned to — needed by clients for a school-deactivation kill-switch. */
  @ApiProperty({ type: [LoginEducatorSchoolDto] })
  schools!: LoginEducatorSchoolDto[];
}

/** Legacy `students` row linked via the specific STUDENT user_roles row — not part of the src/database response-dto layer. */
export class LoginStudentDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiPropertyOptional({ example: 'REP-PH9N' })
  studentCode?: string;

  @ApiPropertyOptional({ example: CommonStatus.ACTIVE, enum: CommonStatus })
  status?: CommonStatus;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId?: string;

  /** Populated on the student session-restore path (`GET /auth/me`), where the class is joined in. */
  @ApiPropertyOptional({ example: 'Respiratory Therapy 101' })
  className?: string;
}

/**
 * AI seat usage for a role assignment — present on educator and district admin entries only.
 * Built by `calculateAiSeats` (`src/common/utils/ai-seats.util.ts`).
 */
export class AiSeatsDto {
  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 10 })
  consumed!: number;

  @ApiProperty({ example: 15 })
  available!: number;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z', nullable: true })
  invalidatedAt!: Date | null;
}

/**
 * One of the account's ACTIVE role assignments, with whichever profile (district admin /
 * educator / student) is linked to that specific role — never more than one of the three is
 * populated per entry, since each maps 1:1 to a single user_roles row.
 */
export class LoginUserRoleDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'District Admin' })
  name!: string;

  @ApiProperty({ example: 'district_admin' })
  slug!: string;

  @ApiPropertyOptional({ type: LoginDistrictAdminDto })
  districtAdmin?: LoginDistrictAdminDto;

  @ApiPropertyOptional({ type: LoginEducatorDto })
  educator?: LoginEducatorDto;

  @ApiPropertyOptional({ type: LoginStudentDto })
  student?: LoginStudentDto;
}

/**
 * The `userRoles[]` entry the current access token is typed to, plus its AI seat usage —
 * `aiSeats` is only ever computed for the active role, never for every entry in `userRoles[]`.
 */
export class ActiveRoleDto extends PickType(LoginUserRoleDto, ['id', 'name', 'slug'] as const) {
  /** Educator and district admin roles only — absent for every other role. */
  @ApiPropertyOptional({ type: AiSeatsDto })
  aiSeats?: AiSeatsDto;
}

/** Legacy `users` row (v2-descended: email/status) — not part of the src/database response-dto layer. */
export class LoginUserDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId!: string;

  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;

  @ApiProperty({ example: CommonStatus.ACTIVE, enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: [LoginUserRoleDto] })
  userRoles!: LoginUserRoleDto[];
}

/** Issued alongside a fresh `accessToken` cookie on signup/login/select-role — not present on session-restore (`GET /auth/me`). */
export class LoginTokensDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abc123' })
  accessToken!: string;

  @ApiProperty({ example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' })
  csrfToken!: string;
}

export class LoginResDto {
  @ApiProperty({ type: LoginUserDto })
  user!: LoginUserDto;

  @ApiProperty({ example: LoginAccessStatus.ACCESS_GRANTED, enum: LoginAccessStatus })
  accessStatus!: LoginAccessStatus;

  /** The `userRoles[]` entry the current access token is typed to; absent while role selection is still pending. */
  @ApiPropertyOptional({ type: ActiveRoleDto })
  activeRole?: ActiveRoleDto | null;

  /** Present on signup/login/select-role responses only. */
  @ApiPropertyOptional({ type: LoginTokensDto })
  tokens?: LoginTokensDto;
}

export class LoginResponseDto extends ApiResponseDto(LoginResDto) { }
