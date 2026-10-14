import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EducatorsService } from './educators.service';
import {
  UpdateEducatorDto,
  RequestSeatsDto,
  RemoveSeatsDto,
  ReallocateSeatsDto,
} from './dto/educator.dto';
import { UpdateProfileDto } from '../users/dto/user.dto';
import { EducatorConstants } from './educators.constants';

import { throwAppError } from 'src/common/utils/app-error';
import { ApiResponse } from 'src/common/types';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import type { JwtRequest } from 'src/common/types';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Schools } from 'src/database/entities';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import { resolveActingAdminId, resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';

@ApiTags(EducatorConstants.SWAGGER.TAG)
@ApiBearerAuth('JWT-auth')
@Controller(EducatorConstants.ROUTES.BASE)
export class EducatorsController {
  constructor(private readonly educatorsService: EducatorsService) { }

  @Get()
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'List all educators belonging to the authenticated admin' })
  async findAll(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.educatorsService.findAll(req.user.userId);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Get(EducatorConstants.ROUTES.ADMIN)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'List all educators for a specific admin ID' })
  async findByAdmin(
    @Param('adminId', new ParseUUIDPipe()) adminId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    // A district admin may only fetch their own educators — `:adminId` is matched against
    // `Educator.admin.userRole.userId` in `EducatorsService.findAll` (i.e. the admin's own
    // userId, same value `GET /educators` uses via `req.user.userId`), so ownership here must
    // compare against the caller's userId too, otherwise any district admin could enumerate any
    // other admin's educators just by changing the path param.
    if (req.user.userId !== adminId) {
      throwAppError(EducatorConstants.MESSAGES.ADMIN_FETCH_FORBIDDEN, ErrorTypes.UNAUTHORIZED);
    }

    const result = await this.educatorsService.findAll(adminId);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Get(EducatorConstants.ROUTES.PROFILE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Get authenticated educator profile' })
  async getProfile(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.educatorsService.getProfile(resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorConstants.ROUTES.REQUEST_SEATS)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Educator requests the admin allocate additional AI seats' })
  async requestSeats(@Req() req: JwtRequest, @Body() dto: RequestSeatsDto): Promise<ApiResponse> {
    if (req.user.type && req.user.type !== UserTokenType.EDUCATOR) {
      throwAppError(EducatorConstants.MESSAGES.SEAT_REQUEST_FORBIDDEN, ErrorTypes.FORBIDDEN);
    }
    const result = await this.educatorsService.requestMoreSeats(resolveActingEducatorId(req), {
      requested_seats: dto.requested_seats,
      note: dto.note,
    });
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put('profile')
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Update authenticated educator profile' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateProfile(
    @Req() req: JwtRequest,
    @Body() body: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.updateProfile(
      resolveActingEducatorId(req),
      { full_name: body.fullName, profile_picture_url: body.profilePictureUrl },
      file,
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(EducatorConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Get a single educator by ID (admin must own the educator)' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ApiResponse> {
    const educator = await this.educatorsService.findById(id);
    if (!educator) {
      throw new NotFoundException(EducatorConstants.MESSAGES.NOT_FOUND);
    }

    if (!educator.success) {
      throwAppError(educator.message!, educator.type);
    }
    return {
      status: AppStatus.SUCCESS,
      message: educator.message!,
      data: educator.data,
    };
  }

  @Put(EducatorConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Update an educator record (admin must own the educator)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEducatorDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const educator = await this.educatorsService.findByIdAndOwner(id, req.user.userId);
    if (!educator) {
      throw new NotFoundException(EducatorConstants.MESSAGES.NOT_FOUND);
    }

    let targetSchool: Schools | null | undefined = undefined;
    if (dto.school_id !== undefined) {
      if (!dto.school_id) {
        targetSchool = null;
      } else {
        targetSchool = await this.educatorsService.findSchoolByOwner(
          dto.school_id,
          req.user.userId,
        );
        if (!targetSchool) {
          throw new BadRequestException(EducatorConstants.MESSAGES.SCHOOL_NOT_OWNED);
        }
      }
    }

    const result = await this.educatorsService.update(educator, dto, targetSchool);
    if (!result.success) throwAppError(result.message!, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  // Registered before `DELETE :id` below — a route-param pattern would otherwise shadow this
  // literal path (`:id` matches the literal segment "profile-picture" too), routing every
  // DELETE here into `remove()` instead and defeating this route's own EDUCATOR-only decorator.
  @Delete(EducatorConstants.ROUTES.PROFILE_PICTURE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Remove the authenticated educator profile picture' })
  async removeProfilePicture(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.educatorsService.removeProfilePicture(resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Delete(EducatorConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Delete an educator (admin must own the educator)' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const educator = await this.educatorsService.findByIdAndOwner(id, req.user.userId);
    if (!educator) {
      throw new NotFoundException(EducatorConstants.MESSAGES.NOT_FOUND);
    }

    const result = await this.educatorsService.remove(educator);
    if (!result.success) {
      throwAppError(result.message!, result.type);
    }
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: null,
    };
  }

  @Post(EducatorConstants.ROUTES.RESEND_INVITE)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Resend invitation email to a pending educator' })
  async resendInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const userId = req.user.userId;
    const result = await this.educatorsService.resendInvite(id, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: null };
  }

  @Post(':id/schools')
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Assign an additional school to an educator (admin must own both)' })
  async addSchool(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('school_id') schoolId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    if (!schoolId) throw new BadRequestException('school_id is required');
    const result = await this.educatorsService.addSchool(id, schoolId, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(':id/schools/:schoolId')
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Remove a school assignment from an educator (admin must own both)' })
  async removeSchool(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.removeSchool(id, schoolId, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorConstants.ROUTES.REMOVE_SEATS)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Remove available seats from an educator and refund them to the admin' })
  async removeSeats(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RemoveSeatsDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.removeSeats(id, dto.amount, resolveActingAdminId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorConstants.ROUTES.REALLOCATE_SEATS)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({
    summary:
      'Transfer available seats from this educator to a target educator belonging to the same admin',
  })
  async reallocateSeats(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReallocateSeatsDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.reallocateSeats(
      id,
      dto.target_educator_id,
      dto.amount,
      resolveActingAdminId(req),
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
