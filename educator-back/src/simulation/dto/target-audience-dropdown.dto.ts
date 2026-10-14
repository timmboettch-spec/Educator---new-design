import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';

/**
 * Response of `GET simulations/target-audiences/my-library/dropdown` and
 * `GET simulations/target-audiences/catalog/dropdown`: a page of audience texts, each a value the
 * `targetAudience` filter accepts. Their request is `FilterDropdownReqDto`.
 */
export class ListTargetAudiencesDropdownResponseDto extends ApiPaginatedResponseDto(
  String,
  'Target audiences fetched successfully',
) {}
