import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkLinkCourseItem {
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

export class BulkLinkGoogleCoursesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkLinkCourseItem)
  courses!: BulkLinkCourseItem[];
}
