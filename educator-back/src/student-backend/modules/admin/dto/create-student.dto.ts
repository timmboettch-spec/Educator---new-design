import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEmail,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({
    description: 'Student name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9\s'-]+$/, {
    message: 'Name contains invalid characters',
  })
  name!: string;

  @ApiProperty({
    description: 'Student email',
    example: 'john@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Unique key for the student (used in username-units.json)',
    example: 'john-key',
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    description: 'Array of unit IDs to grant access to',
    example: ['unit-001'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  units?: string[];
}
