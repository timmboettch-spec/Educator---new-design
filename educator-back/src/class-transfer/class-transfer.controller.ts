import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ClassTransferService } from './class-transfer.service';
import { ClassTransferDto, ClassTransferAuditQueryDto } from './dto/class-transfer.dto';
import {
  BulkClassTransferReqDto,
  BulkClassTransferResDto,
  BulkClassTransferResponseDto,
} from './dto/bulk-class-transfer.dto';
import {
  ListTransferClassesReqDto,
  ListTransferClassesResponseDto,
  TransferClassItemResDto,
} from './dto/list-transfer-classes.dto';
import {
  ListTransferTargetEducatorsReqDto,
  ListTransferTargetEducatorsResponseDto,
  TransferTargetEducatorItemResDto,
} from './dto/list-transfer-target-educators.dto';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { ClassTransferConstants } from './class-transfer.constants';
import type { JwtRequest, ApiResponse } from '../common/types';
import { AppStatus } from '../common/utils/messages';
import { ClassConstants, RoleSlug } from 'src/common/constants';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';

@ApiTags(ClassTransferConstants.SWAGGER.TAG)
@ApiBearerAuth('jwt')
@Controller(ClassTransferConstants.ROUTES.BASE)
export class ClassTransferController {
  constructor(private readonly classTransferService: ClassTransferService) { }

  @Post()
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Transfer a class from one educator to another (Admin only)' })
  async transfer(@Body() dto: ClassTransferDto, @Req() req: JwtRequest): Promise<ApiResponse> {

    const result = await this.classTransferService.transfer(dto, req.user.userId, req.user.email);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? ClassTransferConstants.MESSAGES.TRANSFER_SUCCESS,
      data: result.data ?? null,
    };
  }

  // --- Bulk transfer (RE-108) ---
  // Returns a `ResponseResult` shaped by the global response interceptor, unlike the hand-built
  // `{ status, message, data }` payloads of the legacy routes in this controller.
  @Post(ClassConstants.TRANSFER.ROUTES.BULK)
  @HttpCode(HttpStatus.OK)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiBody({ type: BulkClassTransferReqDto })
  @ApiOkResponse({ type: BulkClassTransferResponseDto })
  async bulkTransfer(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: BulkClassTransferReqDto,
  ): Promise<ResponseResult<BulkClassTransferResDto>> {
    return this.classTransferService.bulkTransfer(currentUser, dto);
  }

  // --- Class list for the transfer picker (RE-108), paginated `ResponseResult` ---
  @Get(ClassConstants.TRANSFER.ROUTES.EDUCATOR_CLASSES)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListTransferClassesResponseDto })
  async listTransferClasses(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('educatorId', new ParseUUIDPipe({ version: '4' })) educatorId: string,
    @Query() dto: ListTransferClassesReqDto,
  ): Promise<ResponseResult<TransferClassItemResDto[], IPaginationMeta>> {
    return this.classTransferService.listTransferClasses(currentUser, educatorId, dto);
  }

  // --- Receiving-educator list for the transfer picker (RE-108), paginated `ResponseResult` ---
  @Get(ClassConstants.TRANSFER.ROUTES.TARGET_EDUCATORS)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiParam({
    name: 'educatorId',
    format: 'uuid',
    description: 'The source educator, whose classes are being transferred.',
    example: 'acb51f33-6b6b-44aa-ba11-2ff670f5b68b',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListTransferTargetEducatorsResponseDto })
  async listTransferTargetEducators(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('educatorId', new ParseUUIDPipe({ version: '4' })) educatorId: string,
    @Query() dto: ListTransferTargetEducatorsReqDto,
  ): Promise<ResponseResult<TransferTargetEducatorItemResDto[], IPaginationMeta>> {
    return this.classTransferService.listTransferTargetEducators(currentUser, educatorId, dto);
  }

  @Get(ClassTransferConstants.ROUTES.EDUCATOR_CLASSES)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({
    summary: 'Get active classes for a specific educator (Admin only)',
    description:
      'Deprecated: use GET /class-transfers/educators/{educatorId}/classes (admin-scoped, paginated). Removed once the frontend has moved over.',
    deprecated: true,
  })
  async getEducatorClasses(
    @Param('educatorId') educatorId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {

    const result = await this.classTransferService.getEducatorClasses(educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? 'Classes fetched successfully',
      data: result.data ?? null,
    };
  }

  @Get(ClassTransferConstants.ROUTES.AUDIT)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Retrieve transfer audit history (Admin only)' })
  async getAuditHistory(
    @Query() query: ClassTransferAuditQueryDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {

    const result = await this.classTransferService.getAuditHistory(query);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? ClassTransferConstants.MESSAGES.AUDIT_FETCHED,
      data: result.data ?? null,
    };
  }
}
