import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassTransferDto {
  @ApiProperty({ description: 'UUID of the class to transfer' })
  @IsNotEmpty({ message: 'classId is required' })
  @IsUUID('4', { message: 'classId must be a valid UUID' })
  classId!: string;

  @ApiProperty({ description: 'UUID of the target educator' })
  @IsNotEmpty({ message: 'targetEducatorId is required' })
  @IsUUID('4', { message: 'targetEducatorId must be a valid UUID' })
  targetEducatorId!: string;
}

export class ClassTransferAuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by class ID' })
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by source educator ID' })
  sourceEducatorId?: string;

  @ApiPropertyOptional({ description: 'Filter by target educator ID' })
  targetEducatorId?: string;
}
