import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesOrderLine } from '../entities/sales-order-line.entity';

export class SalesOrderLineResponseDto implements SalesOrderLine {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  salesOrderLineId!: string;

  @ApiProperty({ example: 'SO-10023' })
  so!: string;

  @ApiProperty({ example: 1 })
  line!: number;

  @ApiProperty({ example: 'Acme Nursing School' })
  customer!: string;

  @ApiProperty({ example: 'ABCD1234EFGH5678' })
  redeemCode!: string;

  @ApiProperty({ example: 'HS-ONLINE-AI-SEAT-10' })
  sku!: string;

  @ApiProperty({ example: 10 })
  qty!: number;

  @ApiPropertyOptional({ example: 'HS Online AI Access' })
  productName?: string;

  @ApiPropertyOptional({ example: 'Software' })
  type?: string;

  @ApiPropertyOptional({ example: 'HS' })
  simGroup?: string;

  @ApiPropertyOptional({ example: 'AI Simulation' })
  category?: string;

  @ApiPropertyOptional({ example: 'Web' })
  platform?: string;

  @ApiPropertyOptional({ example: 'GPT-4' })
  ai?: string;

  @ApiPropertyOptional({ example: 'Manikin' })
  hw?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  start?: Date | null;

  @ApiPropertyOptional({ example: '2027-01-01' })
  end?: Date | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
