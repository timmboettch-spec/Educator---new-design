import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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
import { Schools } from 'src/schools/entity/schools.entity';
import { throwAppError } from 'src/common/utils/app-error';
import { ApiResponse } from 'src/common/types';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import type { JwtRequest } from 'src/common/types';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@ApiTags(EducatorConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
@Controller(EducatorConstants.ROUTES.BASE)
export class EducatorsController {
  constructor(private readonly educatorsService: EducatorsService) { }

  @Get()
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
  @ApiOperation({ summary: 'List all educators for a specific admin ID' })
  async findByAdmin(
    @Param('adminId', new ParseUUIDPipe()) adminId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const roles = req.user.roles || [];
    if (adminId !== req.user.userId && !roles.includes('Super Admin')) {
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
  @ApiOperation({ summary: 'Get authenticated educator profile' })
  async getProfile(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.educatorsService.getProfile(req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorConstants.ROUTES.REQUEST_SEATS)
  @ApiOperation({ summary: 'Educator requests the admin allocate additional AI seats' })
  async requestSeats(@Req() req: JwtRequest, @Body() dto: RequestSeatsDto): Promise<ApiResponse> {
    if (req.user.type && req.user.type !== 'educator') {
      throwAppError(EducatorConstants.MESSAGES.SEAT_REQUEST_FORBIDDEN, ErrorTypes.FORBIDDEN);
    }
    const result = await this.educatorsService.requestMoreSeats(req.user.userId, {
      requested_seats: dto.requested_seats,
      note: dto.note,
    });
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update authenticated educator profile' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateProfile(
    @Req() req: JwtRequest,
    @Body() body: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.updateProfile(
      req.user.userId,
      { full_name: body.full_name, profile_picture_url: body.profile_picture_url },
      file,
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(EducatorConstants.ROUTES.ID)
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

  @Delete(EducatorConstants.ROUTES.ID)
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

  @Delete(EducatorConstants.ROUTES.PROFILE_PICTURE)
  @ApiOperation({ summary: 'Remove the authenticated educator profile picture' })
  async removeProfilePicture(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.educatorsService.removeProfilePicture(req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Post(EducatorConstants.ROUTES.RESEND_INVITE)
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
  @ApiOperation({ summary: 'Remove available seats from an educator and refund them to the admin' })
  async removeSeats(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RemoveSeatsDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.educatorsService.removeSeats(id, dto.amount, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorConstants.ROUTES.REALLOCATE_SEATS)
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
      req.user.userId,
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
