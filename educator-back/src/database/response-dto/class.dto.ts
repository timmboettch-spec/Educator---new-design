import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommonStatus } from 'src/common/enums/status.enum';

/**
 * Mirrors the `Class` entity's own scalar columns, camelCase. Deliberately does NOT
 * `implements Class` (database-entities-rules.md's usual pattern) — the `Class` entity
 * (src/database/entities/class.entity.ts) itself uses snake_case TS property names
 * (`class_name`, `start_date`, `id`, ...), a pre-existing violation of that same rules file
 * that's out of scope to fix here. Implementing it literally would force this DTO's fields
 * to snake_case too, which conflicts with dto-rules.md's camelCase requirement — so this DTO
 * is manually mapped from the entity instead (see `ClassesService`'s private mapper).
 */
export class ClassResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId!: string;

  @ApiPropertyOptional({ example: 'A1B2C3D4' })
  lmsClassId?: string;

  @ApiPropertyOptional({ example: 'moodle-course-1029' })
  lmsClassReference?: string;

  @ApiPropertyOptional({ example: 'manual' })
  origin?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  googleCourseId?: string | null;

  @ApiProperty({ example: 'Oncology Nursing — Sec D' })
  className!: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  educatorId?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  schoolId?: string;

  @ApiPropertyOptional({ example: 'Fall' })
  term?: string;

  @ApiPropertyOptional({ example: '2026' })
  year?: string;

  @ApiPropertyOptional({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  status?: CommonStatus;

  @ApiPropertyOptional({ example: 28 })
  totalNoOfStudents?: number;

  @ApiProperty({ example: '2026-01-01' })
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  endDate!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt?: Date | null;
}
