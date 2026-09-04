import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommonStatus } from '../../common/enums/status.enum';
import { ProductConstants } from '../products.constants';

export class ProductMetaDto {
  @ApiProperty({ example: '54% utilized' })
  @IsString()
  label!: string;
}

export class ProductDto {
  @ApiProperty({ example: 'Total Seats' })
  @IsString()
  @IsNotEmpty({ message: ProductConstants.VALIDATION.TITLE_REQUIRED })
  title?: string;

  @ApiProperty({ example: 242 })
  @IsInt()
  @Min(0)
  value?: number;

  @ApiProperty({ example: 'cube' })
  @IsString()
  @IsNotEmpty({ message: ProductConstants.VALIDATION.ICON_REQUIRED })
  icon?: string;

  @ApiPropertyOptional({ example: { label: '54% utilized' } })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProductMetaDto)
  meta?: ProductMetaDto | null;

  @ApiPropertyOptional({ enum: CommonStatus, default: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus, { message: ProductConstants.VALIDATION.STATUS_ENUM })
  status?: CommonStatus;
}
