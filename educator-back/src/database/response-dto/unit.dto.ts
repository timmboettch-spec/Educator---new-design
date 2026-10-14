import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Unit } from '../entities/unit.entity';
import { UnitCategory } from 'src/common/constants';

export class UnitResponseDto implements Unit {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  unitId!: string;

  @ApiProperty({ example: 'cardiac-care' })
  id!: string;

  @ApiProperty({ example: 'Cardiac Care' })
  name!: string;

  @ApiPropertyOptional({ example: 'A unit covering cardiac care scenarios.' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/units/cardiac-care.png' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: UnitCategory.AI_ONLY, enum: UnitCategory })
  category?: UnitCategory;

  @ApiPropertyOptional({ example: 'Cardiac Assessment' })
  actionGroupName?: string;

  @ApiPropertyOptional({ example: 'Actions available while assessing a cardiac patient.' })
  actionGroupDescription?: string;

  @ApiPropertyOptional({ example: {} })
  actions?: object;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
