import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClassTransferService } from './class-transfer.service';
import { ClassTransferDto, ClassTransferAuditQueryDto } from './dto/class-transfer.dto';
import { ClassTransferConstants } from './class-transfer.constants';
import type { JwtRequest, ApiResponse } from '../common/types';
import { AppStatus } from '../common/utils/messages';

@ApiTags(ClassTransferConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('jwt')
@Controller(ClassTransferConstants.ROUTES.BASE)
export class ClassTransferController {
  constructor(private readonly classTransferService: ClassTransferService) {}

  private isAdmin(req: JwtRequest): boolean {
    const roles = req.user.roles ?? [];
    return (
      roles.includes(ClassTransferConstants.ROLE.ADMIN) ||
      roles.includes(ClassTransferConstants.ROLE.DISTRICT_ADMIN)
    );
  }

  @Post()
  @ApiOperation({ summary: 'Transfer a class from one educator to another (Admin only)' })
  async transfer(@Body() dto: ClassTransferDto, @Req() req: JwtRequest): Promise<ApiResponse> {
    if (!this.isAdmin(req)) {
      throw new ForbiddenException(ClassTransferConstants.ERRORS.FORBIDDEN);
    }

    const result = await this.classTransferService.transfer(dto, req.user.userId, req.user.email);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? ClassTransferConstants.MESSAGES.TRANSFER_SUCCESS,
      data: result.data ?? null,
    };
  }

  @Get(ClassTransferConstants.ROUTES.EDUCATOR_CLASSES)
  @ApiOperation({ summary: 'Get active classes for a specific educator (Admin only)' })
  async getEducatorClasses(
    @Param('educatorId') educatorId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    if (!this.isAdmin(req)) {
      throw new ForbiddenException(ClassTransferConstants.ERRORS.FORBIDDEN);
    }

    const result = await this.classTransferService.getEducatorClasses(educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? 'Classes fetched successfully',
      data: result.data ?? null,
    };
  }

  @Get(ClassTransferConstants.ROUTES.AUDIT)
  @ApiOperation({ summary: 'Retrieve transfer audit history (Admin only)' })
  async getAuditHistory(
    @Query() query: ClassTransferAuditQueryDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    if (!this.isAdmin(req)) {
      throw new ForbiddenException(ClassTransferConstants.ERRORS.FORBIDDEN);
    }

    const result = await this.classTransferService.getAuditHistory(query);

    return {
      status: AppStatus.SUCCESS,
      message: result.message ?? ClassTransferConstants.MESSAGES.AUDIT_FETCHED,
      data: result.data ?? null,
    };
  }
}
