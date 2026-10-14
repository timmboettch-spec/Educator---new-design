import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';

export class CsrfTokenResDto {
  @ApiProperty({ example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' })
  csrfToken!: string;
}

export class CsrfTokenResponseDto extends ApiResponseDto(CsrfTokenResDto) { }
