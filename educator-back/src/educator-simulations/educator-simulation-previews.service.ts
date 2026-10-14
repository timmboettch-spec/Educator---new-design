import { Inject, Injectable } from '@nestjs/common';
import { ResponseResult } from 'src/common/class/response.class';
import { PreviewConstants } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { throwAppError } from 'src/common/utils/app-error';
import { handleError } from 'src/common/utils/common.util';
import { ErrorTypes } from 'src/common/utils/messages';
import { isSimulationVisibleToEducators } from 'src/common/utils/simulation-visibility.util';
import {
  EducatorSimulationPreviewRepository,
  SimulationV2Repository,
} from 'src/database/repositories';
import {
  EDUCATOR_SIMULATION_PREVIEW_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
} from 'src/database/tokens';
import {
  PreviewAllowanceResDto,
  PreviewScenarioReqDto,
} from './dto/educator-simulation-preview.dto';

@Injectable()
export class EducatorSimulationPreviewsService {
  constructor(
    @Inject(EDUCATOR_SIMULATION_PREVIEW_REPOSITORY)
    private readonly previewRepo: EducatorSimulationPreviewRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
  ) {}

  private toAllowance(usedCount: number): PreviewAllowanceResDto {
    return {
      remaining: Math.max(PreviewConstants.MAX_ALLOWANCE - usedCount, 0),
      max: PreviewConstants.MAX_ALLOWANCE,
    };
  }

  /** Only educator tokens carry `educatorId`. */
  private resolveEducatorId(currentUser: ICurrentUser): string {
    const educatorId = String(currentUser?.educatorId ?? '').trim();
    if (!educatorId) {
      throwAppError(ERROR_MSG.COMMON.BAD_REQUEST, ErrorTypes.BAD_REQUEST);
    }
    return educatorId;
  }

  /** Unknown, draft and archived simulations are 404, like the catalog. */
  private async assertSimulationVisible(scenarioId: string): Promise<void> {
    const simulation = await this.simulationV2Repository.findByBusinessId(scenarioId);
    if (!simulation || !isSimulationVisibleToEducators(simulation.status)) {
      throwAppError(ERROR_MSG.DB.NOT_FOUND('Simulation'), ErrorTypes.NOT_FOUND);
    }
  }

  async getAllowance(
    currentUser: ICurrentUser,
    dto: PreviewScenarioReqDto,
  ): Promise<ResponseResult<PreviewAllowanceResDto>> {
    try {
      const educatorId = this.resolveEducatorId(currentUser);
      await this.assertSimulationVisible(dto.scenarioId);

      const preview = await this.previewRepo.findByEducatorAndScenario(educatorId, dto.scenarioId);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Preview allowance'),
        data: this.toAllowance(preview?.usedCount ?? 0),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async usePreview(
    currentUser: ICurrentUser,
    dto: PreviewScenarioReqDto,
  ): Promise<ResponseResult<PreviewAllowanceResDto>> {
    try {
      const educatorId = this.resolveEducatorId(currentUser);
      await this.assertSimulationVisible(dto.scenarioId);

      const usedCount = await this.previewRepo.consumeIfAvailable(
        educatorId,
        dto.scenarioId,
        PreviewConstants.MAX_ALLOWANCE,
      );
      if (usedCount === null) {
        throwAppError(ERROR_MSG.PREVIEW.ALLOWANCE_EXHAUSTED, ErrorTypes.CONFLICT);
      }

      return new ResponseResult({
        message: SUCCESS_MSG.PREVIEW.USED,
        data: this.toAllowance(usedCount),
      });
    } catch (error) {
      return handleError(error);
    }
  }
}
