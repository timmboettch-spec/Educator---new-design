import { Inject, Injectable } from '@nestjs/common';
import { GuidedPath } from 'src/database/entities';
import { GuidedPathRepository } from 'src/database/repositories';
import { GUIDED_PATH_REPOSITORY } from 'src/database/tokens';
import { RoleSlug } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes, Messages } from 'src/common/utils/messages';
import { UpdateGuidedPathReqDto } from './dto/guided-path.dto';

@Injectable()
export class GuidedPathService {
  constructor(
    @Inject(GUIDED_PATH_REPOSITORY) private readonly guidedPathRepository: GuidedPathRepository,
  ) {}

  /** Read path — lazily creates a default row on a role assignment's first-ever fetch. */
  async getOrCreate(currentUser: ICurrentUser, roleType: RoleSlug): Promise<GuidedPath> {
    return this.guidedPathRepository.findOrCreateByUserAndRole(currentUser.userId, roleType);
  }

  /**
   * Write path — upsert keyed on `(userId, roleType)`. `state` (when present) fully
   * replaces the stored blob; `completed` (when present) updates only that
   * column. Both are independent — providing one never touches the other.
   */
  async upsert(
    currentUser: ICurrentUser,
    roleType: RoleSlug,
    dto: UpdateGuidedPathReqDto,
  ): Promise<GuidedPath> {
    if (dto.state === undefined && dto.completed === undefined) {
      return throwAppError(Messages.GUIDED_PATH_UPDATE_REQUIRES_FIELD, ErrorTypes.BAD_REQUEST);
    }

    const data: Partial<GuidedPath> = {};
    if (dto.state !== undefined) {
      data.state = dto.state;
    }
    if (dto.completed !== undefined) {
      data.completed = dto.completed;
    }

    return this.guidedPathRepository.upsertByUserAndRole(currentUser.userId, roleType, data);
  }
}
