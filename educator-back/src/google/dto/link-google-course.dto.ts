import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LinkGoogleCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  googleCourseId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  googleCourseName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  googleCourseSection?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  googleCourseOwnerId?: string;
}
