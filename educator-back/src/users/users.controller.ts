import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Put,
  Req,
  Body,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { EducatorsService } from '../educators/educators.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { throwAppError } from 'src/common/utils/app-error';
import { UserConstants } from './users.constants';
import * as types from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import { ChangePasswordDto, UpdateProfileDto } from './dto/user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@ApiTags(UserConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('jwt')
@Controller(UserConstants.ROUTES.BASE)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly educatorsService: EducatorsService,
  ) {}

  @Get()
  @ApiOperation({ summary: UserConstants.SWAGGER.LIST })
  async findAll(): Promise<types.ApiResponse> {
    const result = await this.usersService.findAll();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(UserConstants.ROUTES.PROFILE_PICTURE)
  @ApiOperation({ summary: UserConstants.SWAGGER.PROFILE_PICTURE })
  async getProfilePicture(@Req() req: types.JwtRequest): Promise<types.ApiResponse> {
    const url = await this.usersService.getProfilePicture(req.user.userId, req.user.type);
    return {
      status: AppStatus.SUCCESS,
      message: UserConstants.MESSAGES.PROFILE_PICTURE_FETCHED,
      data: { profile_picture: url ?? null },
    };
  }

  @Put(UserConstants.ROUTES.PROFILE)
  @ApiOperation({ summary: UserConstants.SWAGGER.UPDATE_PROFILE })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateProfile(
    @Req() req: types.JwtRequest,
    @Body() body: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<types.ApiResponse> {
    if (!req.user?.userId) throwAppError(UserConstants.VALIDATION.USER_ID_REQUIRED);

    if (req.user.type === 'educator') {
      const result = await this.educatorsService.updateProfile(
        req.user.userId,
        { full_name: body.full_name, profile_picture_url: body.profile_picture_url },
        file,
      );
      if (!result.success) throwAppError(result.message!, result.type);
      return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
    }

    const result = await this.usersService.updateProfile(
      req.user.userId,
      { full_name: body.full_name, profile_picture_url: body.profile_picture_url },
      file,
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(UserConstants.ROUTES.CHANGE_PASSWORD)
  @ApiOperation({ summary: UserConstants.SWAGGER.CHANGE_PASSWORD })
  async changePassword(@Body() body: ChangePasswordDto): Promise<types.ApiResponse> {
    const result = await this.usersService.changePassword(
      body.user_id,
      body.old_password,
      body.new_password,
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(UserConstants.ROUTES.ID)
  @ApiOperation({ summary: UserConstants.SWAGGER.GET_ONE })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<types.ApiResponse> {
    const result = await this.usersService.findById(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(UserConstants.ROUTES.PROFILE_PICTURE)
  @ApiOperation({ summary: UserConstants.SWAGGER.REMOVE_PROFILE_PICTURE })
  async removeProfilePhoto(@Req() req: types.JwtRequest): Promise<types.ApiResponse> {
    if (!req.user?.userId) throwAppError(UserConstants.VALIDATION.USER_ID_REQUIRED);

    const result = await this.usersService.removeProfilePhoto(req.user.userId, req.user.type);

    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
