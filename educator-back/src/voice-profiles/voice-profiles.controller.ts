import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { RoleSlug, VoiceProfileConstants } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { VoiceProfilesService } from './voice-profiles.service';
import { ListVoiceProfilesReqDto } from './dto/list-voice-profiles.dto';
import { VoiceProfileDto, VoiceProfileListResponseDto } from './dto/voice-profile.dto';
import {
  CreateVoiceProfileReqDto,
  CreateVoiceProfileResponseDto,
} from './dto/create-voice-profile.dto';
import { ReplaceVoiceProfileAudioResponseDto } from './dto/replace-voice-profile-audio.dto';
import {
  UpdateVoiceProfileReqDto,
  UpdateVoiceProfileResponseDto,
} from './dto/update-voice-profile.dto';
import { RetireVoiceProfileResponseDto } from './dto/retire-voice-profile.dto';

const ALLOWED_MIME_PREFIXES = ['audio/'];

/** Cheap early filter on the CLIENT-SUPPLIED mime type; it proves nothing about the bytes. The real gate is AudioNormalizerService, which identifies the container from magic bytes and pins ffmpeg to it. Matches the multer pattern in CLAUDE.md: reject via BadRequestException, never a bare Error, so ValidationPipe-style 400s are consistent. */
const uploadInterceptor = FileInterceptor(VoiceProfileConstants.UPLOAD.FIELD_NAME, {
  storage: memoryStorage(),
  limits: { fileSize: VoiceProfileConstants.UPLOAD.MAX_FILE_BYTES },
  fileFilter: (_req, file, callback) => {
    const isAudio = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype?.startsWith(prefix));
    if (!isAudio) {
      callback(new BadRequestException(ERROR_MSG.VOICE_PROFILE.UNDECODABLE), false);
      return;
    }
    callback(null, true);
  },
});

/**
 * Every `/api/voice-profiles/*` route. Admin CRUD is SCENARIO_ADMIN-only at the
 * class level; the audio-streaming route widens that to the educator roles.
 * Every route requires a login: there is no public or signed-link route.
 */
@ApiTags(VoiceProfileConstants.SWAGGER.TAG)
@RequiredRoles(RoleSlug.SCENARIO_ADMIN)
@Controller(VoiceProfileConstants.ROUTES.BASE)
export class VoiceProfilesController {
  constructor(private readonly voiceProfilesService: VoiceProfilesService) {}

  @Get(VoiceProfileConstants.ROUTES.AUDIO)
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN, RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR)
  @Header('Cache-Control', VoiceProfileConstants.STREAM.AUTHED_CACHE_CONTROL)
  @ApiProduces('audio/wav')
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async streamAudio(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return this.voiceProfilesService.streamAudio(currentUser, id);
  }

  @Get()
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: VoiceProfileListResponseDto })
  async findAll(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListVoiceProfilesReqDto,
  ): Promise<ResponseResult<VoiceProfileDto[]>> {
    return this.voiceProfilesService.findAll(currentUser, dto);
  }

  @Post()
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string', example: 'Stock Female 1' },
        file: {
          type: 'string',
          format: 'binary',
          description:
            'WAV/MP3/M4A/OGG/WebM/FLAC, 5-30s upload (the stored clip is cut to 10s), max 20MB',
        },
        gender: { type: 'string', example: 'female', nullable: true },
        age: { type: 'integer', example: 34, nullable: true },
        ethnicity: { type: 'string', example: 'Not Hispanic or Latino', nullable: true },
        emotion: { type: 'string', example: 'calm', nullable: true },
      },
      required: ['displayName', 'file'],
    },
  })
  @ApiOkResponse({ type: CreateVoiceProfileResponseDto })
  @UseInterceptors(uploadInterceptor)
  async create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: CreateVoiceProfileReqDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    return this.voiceProfilesService.create(currentUser, dto, file);
  }

  @Put(VoiceProfileConstants.ROUTES.AUDIO)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'WAV/MP3/M4A/OGG/WebM/FLAC, 5-30s upload (the stored clip is cut to 10s), max 20MB',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ReplaceVoiceProfileAudioResponseDto })
  @UseInterceptors(uploadInterceptor)
  async replaceAudio(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    return this.voiceProfilesService.replaceAudio(currentUser, id, file);
  }

  @Patch(VoiceProfileConstants.ROUTES.ID)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: UpdateVoiceProfileResponseDto })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoiceProfileReqDto,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    return this.voiceProfilesService.update(currentUser, id, dto);
  }

  @Delete(VoiceProfileConstants.ROUTES.ID)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: RetireVoiceProfileResponseDto })
  async retire(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResponseResult<null>> {
    return this.voiceProfilesService.retire(currentUser, id);
  }
}
