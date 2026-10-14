import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { ServiceAuth } from 'src/common/decorators/service-auth.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { AvatarConstants, RoleSlug } from 'src/common/constants';
import { AvatarsService } from './avatars.service';
import { CreateAvatarReqDto, CreateAvatarResDto, CreateAvatarResponseDto } from './dto/create-avatar.dto';
import { UpdateAvatarReqDto, UpdateAvatarResDto, UpdateAvatarResponseDto } from './dto/update-avatar.dto';
import { GetAvatarResDto, GetAvatarResponseDto } from './dto/get-avatar.dto';
import { DeleteAvatarResponseDto } from './dto/delete-avatar.dto';
import { AvatarListItemResDto, ListAvatarsReqDto, ListAvatarsResponseDto } from './dto/list-avatars.dto';

@ApiTags(AvatarConstants.SWAGGER.TAG)
@Controller(AvatarConstants.ROUTES.BASE)
export class AvatarsController {
  constructor(private readonly avatarsService: AvatarsService) { }

  @Get()
  // Also callable with the service key, by the scenario app's server-side
  // catalog proxy (`/api/avatars`). That proxy is the avatar picker's only
  // source: the avatar platform's own /v1/avatars is a ClusterIP service
  // inside AKS with no public route, so a browser cannot reach it.
  //
  // This widens the original rule, which marked only POST and PATCH on the
  // grounds that "a CI key should not read the whole catalog". The caller here
  // is not CI -- it is a server-side route behind an admin-gated page, and the
  // list it reads is the same one the picker already renders. Note the key now
  // grants read as well as write, so it is no longer write-only; that is the
  // trade accepted for a picker that cannot silently go stale.
  //
  // The GETs ignore the caller: `findAll`/`findOne` take `_currentUser` and
  // never dereference it, so a service caller with no JWT is safe here in a
  // way it would not be on a route that reads the user.
  @ServiceAuth()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListAvatarsResponseDto })
  async findAll(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListAvatarsReqDto,
  ): Promise<ResponseResult<AvatarListItemResDto[], IPaginationMeta>> {
    return this.avatarsService.findAll(currentUser, dto);
  }

  @Get(':avatarId')
  // Same proxy, same reasoning as the list above. `assetPath` is only on this
  // response, not the list one, so a management screen that shows a single
  // avatar's package version has to come through here.
  @ServiceAuth()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GetAvatarResponseDto })
  async findOne(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('avatarId') avatarId: string,
  ): Promise<ResponseResult<GetAvatarResDto>> {
    return this.avatarsService.findOne(currentUser, avatarId);
  }

  @Post()
  // Also callable by the avatar build pipeline with the service key. It
  // creates the row after uploading a package, then PATCHes status to
  // 'ready' once the upload verifies. The GETs are NOT marked: a CI key
  // should not read the whole catalog.
  @ServiceAuth()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: CreateAvatarResponseDto })
  async create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: CreateAvatarReqDto,
  ): Promise<ResponseResult<CreateAvatarResDto>> {
    return this.avatarsService.create(currentUser, dto);
  }

  @Patch(':avatarId')
  // Also callable by the avatar build pipeline with the service key. It
  // creates the row after uploading a package, then PATCHes status to
  // 'ready' once the upload verifies. The GETs are NOT marked: a CI key
  // should not read the whole catalog.
  @ServiceAuth()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: UpdateAvatarResponseDto })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('avatarId') avatarId: string,
    @Body() dto: UpdateAvatarReqDto,
  ): Promise<ResponseResult<UpdateAvatarResDto>> {
    return this.avatarsService.update(currentUser, avatarId, dto);
  }

  // `:avatarId` is the business id (`avatar-10`), not the uuid PK, so no
  // ParseUUIDPipe here -- unlike UnitsController, whose route key IS a uuid.
  @Delete(':avatarId')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: DeleteAvatarResponseDto })
  async remove(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('avatarId') avatarId: string,
  ): Promise<ResponseResult<null>> {
    return this.avatarsService.remove(currentUser, avatarId);
  }
}
