import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Avatar } from 'src/database/entities';
import { AvatarRepository, SimulationV2Repository } from 'src/database/repositories';
import { AVATAR_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { ResponseResult } from 'src/common/class/response.class';
import { ICurrentUser } from 'src/common/interfaces';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { buildPaginationMeta } from 'src/common/utils/pagination.util';
import { AvatarConstants, AvatarStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { handleError } from 'src/common/utils/common.util';
import { CreateAvatarReqDto, CreateAvatarResDto } from './dto/create-avatar.dto';
import { UpdateAvatarReqDto, UpdateAvatarResDto } from './dto/update-avatar.dto';
import { GetAvatarResDto } from './dto/get-avatar.dto';
import { AvatarListItemResDto, ListAvatarsReqDto } from './dto/list-avatars.dto';

@Injectable()
export class AvatarsService {
  constructor(
    @Inject(AVATAR_REPOSITORY) private readonly avatarRepository: AvatarRepository,
    @Inject(SIMULATION_V2_REPOSITORY) private readonly simulationV2Repository: SimulationV2Repository,
  ) {}

  private toAvatarResDto(avatar: Avatar): CreateAvatarResDto {
    return {
      avatarUuid: avatar.avatarUuid,
      avatarId: avatar.avatarId,
      displayName: avatar.displayName,
      appearance: avatar.appearance,
      unrealMap: avatar.unrealMap,
      assetPath: avatar.assetPath,
      status: avatar.status,
    };
  }

  private toListItemResDto(avatar: Avatar): AvatarListItemResDto {
    return {
      avatarUuid: avatar.avatarUuid,
      avatarId: avatar.avatarId,
      displayName: avatar.displayName,
      appearance: avatar.appearance,
      unrealMap: avatar.unrealMap,
      status: avatar.status,
    };
  }

  /**
   * An avatar is only routable if the pod knows which map to launch. Marking
   * one `ready` without `unrealMap` is the most expensive mistake this table
   * can carry: the pod starts, passes every probe, reports healthy, and streams
   * the WRONG PATIENT to a student who cannot tell.
   */
  private assertServableIfReady(status?: AvatarStatus, unrealMap?: string | null): void {
    if (status === AvatarStatus.READY && !unrealMap?.trim()) {
      throw new BadRequestException(ERROR_MSG.AVATAR.READY_WITHOUT_MAP);
    }
  }

  async findAll(
    _currentUser: ICurrentUser,
    dto: ListAvatarsReqDto,
  ): Promise<ResponseResult<AvatarListItemResDto[], IPaginationMeta>> {
    try {
      // Ready-only unless asked otherwise: the picker must never offer an
      // avatar that cannot be served.
      const { items, total, page, pageSize } = await this.avatarRepository.findAndCountPaginated({
        page: dto.page,
        pageSize: dto.pageSize,
        status: dto.status ?? AvatarStatus.READY,
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Avatars'),
        data: items.map((avatar) => this.toListItemResDto(avatar)),
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Any status — a scenario may legitimately reference a retired avatar. */
  async findOne(_currentUser: ICurrentUser, avatarId: string): Promise<ResponseResult<GetAvatarResDto>> {
    try {
      const avatar = await this.avatarRepository.findByAvatarId(avatarId);
      if (!avatar) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Avatar'));
      }

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Avatar'),
        data: this.toAvatarResDto(avatar),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async create(
    _currentUser: ICurrentUser,
    dto: CreateAvatarReqDto,
  ): Promise<ResponseResult<CreateAvatarResDto>> {
    try {
      const existing = await this.avatarRepository.findByAvatarId(dto.avatarId);
      if (existing) {
        throw new ConflictException(ERROR_MSG.DB.DUPLICATE_ENTRY('Avatar'));
      }
      this.assertServableIfReady(dto.status, dto.unrealMap);

      const avatar = await this.avatarRepository.create({
        ...dto,
        status: dto.status ?? AvatarStatus.SYNCING,
        gpuSku: AvatarConstants.DEFAULTS.GPU_SKU,
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.CREATED('Avatar'),
        data: this.toAvatarResDto(avatar),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Upsert-by-id on the publish pipeline's behalf: re-publishing the same
   * avatar at a new package version is an update, not an error, and the script
   * should not have to ask which it is.
   */
  async update(
    _currentUser: ICurrentUser,
    avatarId: string,
    dto: UpdateAvatarReqDto,
  ): Promise<ResponseResult<UpdateAvatarResDto>> {
    try {
      const avatar = await this.avatarRepository.findByAvatarId(avatarId);
      if (!avatar) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Avatar'));
      }

      const merged = this.avatarRepository.merge(avatar, dto);
      this.assertServableIfReady(merged.status, merged.unrealMap);
      const saved = await this.avatarRepository.save(merged);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Avatar'),
        data: this.toAvatarResDto(saved),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Soft-delete an avatar, refused while any scenario still points at it.
   *
   * The guard mirrors UnitsService.remove and the database agrees with it:
   * `simulations.avatarId` references `avatars.avatar_id` ON DELETE RESTRICT.
   * Checking here turns what would be a 500 from the driver into a 400 that
   * says why.
   *
   * Soft, not hard, because the avatar platform reads this catalog to decide
   * whether a session can start. A row that vanishes mid-term takes its
   * scenarios' history with it; a retired row keeps the link readable.
   */
  async remove(_currentUser: ICurrentUser, avatarId: string): Promise<ResponseResult<null>> {
    try {
      const existing = await this.avatarRepository.findByAvatarId(avatarId);
      if (!existing) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Avatar'));
      }

      const scenarioCount = await this.simulationV2Repository.countSimulationByAvatarId(avatarId);
      if (scenarioCount > 0) {
        throw new BadRequestException(ERROR_MSG.COMMON.BAD_REQUEST);
      }

      await this.avatarRepository.softDeleteByAvatarId(avatarId);

      return new ResponseResult({ message: SUCCESS_MSG.COMMON.DELETED('Avatar'), data: null });
    } catch (error) {
      return handleError(error);
    }
  }
}
