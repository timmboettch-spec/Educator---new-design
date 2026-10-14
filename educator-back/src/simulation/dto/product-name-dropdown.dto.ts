import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';

/**
 * Response of `GET simulations/product-names/my-library/dropdown` and
 * `GET simulations/product-names/catalog/dropdown`: a page of product names, each a value the
 * `productName` filter accepts. Their request is `FilterDropdownReqDto`.
 */
export class ListProductNamesDropdownResponseDto extends ApiPaginatedResponseDto(
  String,
  'Product names fetched successfully',
) {}
