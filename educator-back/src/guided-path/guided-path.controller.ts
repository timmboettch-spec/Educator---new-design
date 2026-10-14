import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { RoleSlug } from 'src/common/constants';
import { resolveSelectedRole } from 'src/common/utils/user-token-type.util';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { GuidedPathService } from './guided-path.service';
import {
  GuidedPathResDto,
  GuidedPathResponseDto,
  UpdateGuidedPathReqDto,
} from './dto/guided-path.dto';

/**
 * `GET`/`PUT /api/guided-path` — one Guided Path per `(userId, roleType)` pair, where `roleType`
 * is the caller's selected role.
 */
@ApiTags('Guided Path')
@RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
@Controller('guided-path')
export class GuidedPathController {
  constructor(private readonly guidedPathService: GuidedPathService) {}

  @Get()
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GuidedPathResponseDto })
  async getGuidedPath(
    @CurrentUser() currentUser: ICurrentUser,
  ): Promise<ResponseResult<GuidedPathResDto>> {
    const guidedPath = await this.guidedPathService.getOrCreate(
      currentUser,
      resolveSelectedRole(currentUser),
    );
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.FETCHED('Guided path'),
      data: guidedPath,
    });
  }

  @Put()
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GuidedPathResponseDto })
  async updateGuidedPath(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: UpdateGuidedPathReqDto,
  ): Promise<ResponseResult<GuidedPathResDto>> {
    const guidedPath = await this.guidedPathService.upsert(
      currentUser,
      resolveSelectedRole(currentUser),
      dto,
    );
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.UPDATED('Guided path'),
      data: guidedPath,
    });
  }
}
