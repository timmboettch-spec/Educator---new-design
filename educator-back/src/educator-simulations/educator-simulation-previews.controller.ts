import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseResult } from 'src/common/class/response.class';
import { PreviewConstants, RoleSlug } from 'src/common/constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import {
  GetPreviewAllowanceResponseDto,
  PreviewAllowanceResDto,
  PreviewScenarioReqDto,
  UsePreviewResponseDto,
} from './dto/educator-simulation-preview.dto';
import { EducatorSimulationPreviewsService } from './educator-simulation-previews.service';

@ApiTags(PreviewConstants.SWAGGER.TAG)
@RequiredRoles(RoleSlug.EDUCATOR)
@Controller(PreviewConstants.ROUTES.BASE)
export class EducatorSimulationPreviewsController {
  constructor(private readonly previewsService: EducatorSimulationPreviewsService) {}

  @Get(PreviewConstants.ROUTES.PREVIEW)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiParam({ name: 'scenarioId', example: 'assessment_ea_1775638894969' })
  @ApiOkResponse({ type: GetPreviewAllowanceResponseDto })
  async getAllowance(
    @CurrentUser() currentUser: ICurrentUser,
    @Param() dto: PreviewScenarioReqDto,
  ): Promise<ResponseResult<PreviewAllowanceResDto>> {
    return this.previewsService.getAllowance(currentUser, dto);
  }

  @Post(PreviewConstants.ROUTES.PREVIEW)
  @HttpCode(HttpStatus.OK)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiParam({ name: 'scenarioId', example: 'assessment_ea_1775638894969' })
  @ApiOkResponse({ type: UsePreviewResponseDto })
  async usePreview(
    @CurrentUser() currentUser: ICurrentUser,
    @Param() dto: PreviewScenarioReqDto,
  ): Promise<ResponseResult<PreviewAllowanceResDto>> {
    return this.previewsService.usePreview(currentUser, dto);
  }
}
