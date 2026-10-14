import { Avatar } from 'src/database/entities';
import { AvatarStatus } from 'src/common/constants';

export interface PaginatedAvatarsParams {
  page?: number;
  pageSize?: number;
  status?: AvatarStatus;
}

export interface PaginatedAvatarsResult {
  items: Avatar[];
  total: number;
  page: number;
  pageSize: number;
}
