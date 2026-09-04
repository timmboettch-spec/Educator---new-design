import { SchoolsService } from './schools.service';
import { SchoolDto, SchoolIdDto, AdminIdDto } from './dto/school.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
  Put,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as types from 'src/common/types';
import { throwAppError } from 'src/common/utils/app-error';
import { SchoolConstants } from './schools.constants';
import { Messages, AppStatus, ErrorTypes } from 'src/common/utils/messages';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiResponse } from 'src/common/types';
import { CommonStatus } from 'src/common/enums/status.enum';

@ApiTags(SchoolConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
@Controller(SchoolConstants.ROUTES.BASE)
export class SchoolsController {
  constructor(private readonly schoolService: SchoolsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new school' })
  async create(@Body() dto: SchoolDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const roles = req.user.roles || [];
    const isDistrictAdmin = roles.includes('District Admin');

    if (!isDistrictAdmin) {
      throw new ForbiddenException(Messages.FORBIDDEN);
    }

    const targetUserId = dto.user_id ? dto.user_id : req.user.userId;

    const user = await this.schoolService.findUserById(targetUserId);
    if (!user || user.status !== CommonStatus.ACTIVE) {
      throw new ForbiddenException(Messages.FORBIDDEN);
    }

    const existingSchool = await this.schoolService.findByCriteria(dto.school_name, targetUserId);
    if (existingSchool) {
      throw new BadRequestException(Messages.SCHOOL_EXISTS);
    }

    const result = await this.schoolService.create(targetUserId, dto);
    if (!result.success)
      throwAppError(result.message || Messages.FAILED_TO_SAVE_SCHOOL, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_CREATED,
      data: result.data,
    };
  }

  @Get(SchoolConstants.ROUTES.USER)
  async findAll(
    @Req() req: types.JwtRequest,
    @Query('status') status?: string,
  ): Promise<ApiResponse> {
    const result = await this.schoolService.findAll(req.user.userId, status);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_FETCHED,
      data: result.data,
    };
  }

  @Get(SchoolConstants.ROUTES.ADMIN)
  @ApiOperation({ summary: 'List all schools for a specific admin ID' })
  async findByAdmin(
    @Param() params: AdminIdDto,
    @Req() req: types.JwtRequest,
    @Query('status') status?: string,
  ): Promise<ApiResponse> {
    const roles = req.user.roles || [];
    if (params.adminId !== req.user.userId && !roles.includes('Super Admin')) {
      throwAppError(Messages.SCHOOL_ADMIN_FETCH_FORBIDDEN, ErrorTypes.FORBIDDEN);
    }

    const result = await this.schoolService.findAll(params.adminId, status);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_FETCHED,
      data: result.data,
    };
  }

  @Get(SchoolConstants.ROUTES.ID)
  async findOne(@Param() params: SchoolIdDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const school = await this.schoolService.findByIdAndOwner(params.id, req.user.userId);
    if (!school) {
      throw new NotFoundException(Messages.SCHOOL_NOT_FOUND);
    }

    const result = await this.schoolService.findOne(school);
    if (!result.success) throwAppError(result.message || Messages.SCHOOL_NOT_FOUND, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_FETCHED,
      data: result.data,
    };
  }

  @Put(SchoolConstants.ROUTES.ID)
  async update(
    @Param() params: SchoolIdDto,
    @Body() dto: SchoolDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const school = await this.schoolService.findByIdAndOwner(params.id, req.user.userId);
    if (!school) {
      throw new NotFoundException(Messages.SCHOOL_NOT_FOUND);
    }

    const result = await this.schoolService.update(school, dto);
    if (!result.success) throwAppError(result.message || Messages.SCHOOL_NOT_FOUND, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_UPDATED,
      data: result.data,
    };
  }

  @Delete(SchoolConstants.ROUTES.ID)
  async remove(@Param() params: SchoolIdDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const user = await this.schoolService.findUserById(req.user.userId);
    if (!user || user.status !== CommonStatus.ACTIVE) {
      throw new ForbiddenException(Messages.FORBIDDEN);
    }

    const school = await this.schoolService.findByIdAndOwner(params.id, req.user.userId);
    if (!school) {
      throw new NotFoundException(Messages.SCHOOL_NOT_FOUND);
    }

    const result = await this.schoolService.remove(school);
    if (!result.success) throwAppError(result.message || Messages.SCHOOL_NOT_FOUND, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || Messages.SCHOOL_DELETED,
      data: result.data,
    };
  }
}
