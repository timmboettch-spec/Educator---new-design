import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto, EmptyDataDto } from 'src/common/dtos/api-response.dto';

export class ResendOtpReqDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: VALIDATION_MSG.IS_EMAIL('email') })
  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;
}

export class ResendOtpResponseDto extends ApiResponseDto(EmptyDataDto) { }
