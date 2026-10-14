import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

export class ActivityOverviewReqDto {
  @ApiPropertyOptional({ description: 'The UUID of the school this class belongs to' })
  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('school_id') })
  school_id?: string;
}

export class ActivityOverviewResDto {
  @ApiProperty({ example: 5 })
  activeClasses!: number;

  @ApiProperty({ example: 2 })
  classesWithUnreadReports!: number;

  @ApiProperty({ example: 7 })
  totalUnreadReports!: number;

  @ApiProperty({ example: 1 })
  classesClosingSoon!: number;

  @ApiProperty({ example: 42 })
  studentsInActiveClasses!: number;

  @ApiProperty({ example: 1 })
  classesWithStudentsNearAvatarLimit!: number;
}

export class ActivityOverviewResponseDto extends ApiResponseDto(ActivityOverviewResDto) {}
