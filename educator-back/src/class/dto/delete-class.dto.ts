import { ApiResponseDto, EmptyDataDto } from 'src/common/dtos/api-response.dto';

export class DeleteClassResponseDto extends ApiResponseDto(
  EmptyDataDto,
  'Class deleted successfully',
) {}
