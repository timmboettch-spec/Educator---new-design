import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto, EmptyDataDto } from 'src/common/dtos/api-response.dto';

export class VerifyOtpReqDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: VALIDATION_MSG.IS_EMAIL('email') })
  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('otp') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('otp') })
  @ApiProperty({ example: '123456' })
  otp!: string;
}

export class VerifyOtpResponseDto extends ApiResponseDto(EmptyDataDto) { }
