import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { VoiceProfile } from 'src/database/entities';
import { VoiceProfileRepository, SimulationV2Repository } from 'src/database/repositories';
import { VOICE_PROFILE_REPOSITORY, SIMULATION_V2_REPOSITORY } from 'src/database/tokens';
import { ResponseResult } from 'src/common/class/response.class';
import { ICurrentUser } from 'src/common/interfaces';
import type {
  IScenarioVoiceInput,
  IScenarioVoiceProfile,
} from 'src/common/interfaces/voice-profile.interface';
import {
  DbErrorConstants,
  VoiceProfileConstants,
  VoiceProfileGender,
  VoiceProfileListStatus,
  VoiceProfileSource,
  VoiceProfileStatus,
} from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { handleError } from 'src/common/utils/common.util';
import { throwAppError } from 'src/common/utils/app-error';
import { isPgError } from 'src/common/utils/pg-error.util';
import { ErrorTypes } from 'src/common/utils/messages';
import { AzureBlobService } from 'src/common/services/azure-blob.service';
import { AudioNormalizerService } from 'src/common/services/audio-normalizer.service';
import { ListVoiceProfilesReqDto } from './dto/list-voice-profiles.dto';
import { VoiceProfileDto } from './dto/voice-profile.dto';
import { CreateVoiceProfileReqDto } from './dto/create-voice-profile.dto';
import { UpdateVoiceProfileReqDto } from './dto/update-voice-profile.dto';

const AUDIO = VoiceProfileConstants.AUDIO;
const BLOB = VoiceProfileConstants.BLOB;
const RETIRE = VoiceProfileConstants.RETIRE;

@Injectable()
export class VoiceProfilesService {
  constructor(
    @Inject(VOICE_PROFILE_REPOSITORY) private readonly voiceProfileRepo: VoiceProfileRepository,
    @Inject(SIMULATION_V2_REPOSITORY) private readonly simulationRepo: SimulationV2Repository,
    private readonly blobService: AzureBlobService,
    private readonly normalizer: AudioNormalizerService,
    private readonly configService: ConfigService,
  ) {}

  private container(): string {
    return this.configService.get<string>('azureBlob.voiceProfilesContainer') as string;
  }

  private blobPath(voiceProfileId: string): string {
    return `${BLOB.PATH_PREFIX}/${voiceProfileId}/${BLOB.FILE_NAME}`;
  }

  private async toDto(profile: VoiceProfile): Promise<VoiceProfileDto> {
    const usageCount = await this.simulationRepo.countByVoiceProfileId(profile.voiceProfileId);
    return { ...this.toDtoFields(profile), usageCount };
  }

  private async toDtos(profiles: VoiceProfile[]): Promise<VoiceProfileDto[]> {
    const counts = await this.simulationRepo.countGroupedByVoiceProfileId(
      profiles.map((p) => p.voiceProfileId),
    );
    return profiles.map((profile) => ({
      ...this.toDtoFields(profile),
      usageCount: counts.get(profile.voiceProfileId) ?? 0,
    }));
  }

  private toDtoFields(profile: VoiceProfile): Omit<VoiceProfileDto, 'usageCount'> {
    return {
      voiceProfileId: profile.voiceProfileId,
      displayName: profile.displayName,
      status: profile.status,
      gender: profile.gender ?? null,
      age: profile.age ?? null,
      ethnicity: profile.ethnicity ?? null,
      emotion: profile.emotion ?? null,
      defaultForGender: profile.defaultForGender ?? null,
      durationMs: profile.durationMs,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async findAll(
    _currentUser: ICurrentUser,
    dto: ListVoiceProfilesReqDto,
  ): Promise<ResponseResult<VoiceProfileDto[]>> {
    try {
      const status =
        dto.status === VoiceProfileListStatus.ALL ? undefined : VoiceProfileStatus.ACTIVE;
      const profiles = await this.voiceProfileRepo.findAllOrdered(status, {
        gender: dto.gender,
        age: dto.age,
        ethnicity: dto.ethnicity,
        emotion: dto.emotion,
      });
      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Voice profiles'),
        data: await this.toDtos(profiles),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async create(
    currentUser: ICurrentUser,
    dto: CreateVoiceProfileReqDto,
    file: Express.Multer.File | undefined,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    try {
      if (!file?.buffer?.length) {
        throwAppError(ERROR_MSG.VOICE_PROFILE.NO_FILE, ErrorTypes.BAD_REQUEST);
      }
      await this.assertDisplayNameFree(dto.displayName);

      const normalized = await this.normalizer.normalizeVoiceReference(file.buffer);
      // One transaction: a failed upload rolls the row back, so no profile is
      // left behind without audio and the display name stays free.
      const saved = await this.voiceProfileRepo.createWithAudio(
        {
          displayName: dto.displayName,
          status: VoiceProfileStatus.ACTIVE,
          blobPath: '',
          durationMs: normalized.durationMs,
          gender: dto.gender ?? null,
          age: dto.age ?? null,
          ethnicity: dto.ethnicity ?? null,
          emotion: dto.emotion ?? null,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
        async (voiceProfileId) => {
          const blobPath = this.blobPath(voiceProfileId);
          await this.blobService.uploadToContainer(
            this.container(),
            blobPath,
            normalized.buffer,
            BLOB.CONTENT_TYPE,
          );
          return blobPath;
        },
      );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.CREATED('Voice profile'),
        data: await this.toDto(saved),
      });
    } catch (error) {
      await this.rethrowUniqueViolation(error, { displayName: dto.displayName });
      return handleError(error);
    }
  }

  async replaceAudio(
    currentUser: ICurrentUser,
    voiceProfileId: string,
    file: Express.Multer.File | undefined,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    try {
      const profile = await this.findByIdOrThrow(voiceProfileId);
      this.assertActive(profile);
      if (!file?.buffer?.length) {
        throwAppError(ERROR_MSG.VOICE_PROFILE.NO_FILE, ErrorTypes.BAD_REQUEST);
      }

      const normalized = await this.normalizer.normalizeVoiceReference(file.buffer);
      const blobPath = profile.blobPath || this.blobPath(profile.voiceProfileId);
      await this.blobService.uploadToContainer(
        this.container(),
        blobPath,
        normalized.buffer,
        BLOB.CONTENT_TYPE,
      );

      const saved = await this.voiceProfileRepo.save(
        this.voiceProfileRepo.merge(profile, {
          blobPath,
          durationMs: normalized.durationMs,
          updatedBy: currentUser.userId,
        }),
      );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Voice profile'),
        data: await this.toDto(saved),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async update(
    currentUser: ICurrentUser,
    voiceProfileId: string,
    dto: UpdateVoiceProfileReqDto,
  ): Promise<ResponseResult<VoiceProfileDto>> {
    try {
      const profile = await this.findByIdOrThrow(voiceProfileId);
      // A retired profile is read-only: renaming it could collide with a live name, and a default
      // gender on it would make the resolver skip it silently.
      this.assertActive(profile);

      if (dto.displayName !== undefined && dto.displayName !== profile.displayName) {
        await this.assertDisplayNameFree(dto.displayName, voiceProfileId);
      }

      if (dto.defaultForGender) {
        await this.assertGenderDefaultFree(dto.defaultForGender, voiceProfileId);
      }

      // The write runs under a FOR UPDATE row lock (shared with retire() and the scenario writes),
      // so the active check and the gender check are repeated against the LOCKED row: a retire
      // that committed in between is seen, and a default can't land on a retiring profile.
      const saved = await this.voiceProfileRepo.updateLocked(voiceProfileId, (locked) => {
        this.assertActive(locked);

        // Only re-validate gender consistency when THIS request touches gender or
        // defaultForGender — never retroactively, so a profile whose
        // defaultForGender was set before this field existed (gender still
        // null) isn't blocked from unrelated edits (renaming, age, etc.).
        const touchesGenderOrDefault =
          dto.gender !== undefined || dto.defaultForGender !== undefined;
        const finalGender = dto.gender !== undefined ? dto.gender : locked.gender;
        const finalDefaultForGender =
          dto.defaultForGender !== undefined ? dto.defaultForGender : locked.defaultForGender;
        if (touchesGenderOrDefault && finalDefaultForGender) {
          this.assertGenderConsistent(finalGender, finalDefaultForGender);
        }

        return {
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.age !== undefined ? { age: dto.age } : {}),
          ...(dto.ethnicity !== undefined ? { ethnicity: dto.ethnicity } : {}),
          ...(dto.emotion !== undefined ? { emotion: dto.emotion } : {}),
          ...(dto.defaultForGender !== undefined ? { defaultForGender: dto.defaultForGender } : {}),
          updatedBy: currentUser.userId,
        };
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Voice profile'),
        data: await this.toDto(saved),
      });
    } catch (error) {
      await this.rethrowUniqueViolation(error, {
        displayName: dto.displayName,
        defaultForGender: dto.defaultForGender,
      });
      return handleError(error);
    }
  }

  /**
   * Retires a profile. Refuses (409) while any non-deleted scenario, drafts included, still
   * points at it, or while it is a gender default (clear that first so silence never wins by
   * accident). The checks and the write run in ONE repository transaction under a row lock
   * (`retireIfUnused`), so a scenario write assigning this voice at the same moment is either
   * counted or refused, never orphaned. Already-retired is a no-op.
   */
  async retire(_currentUser: ICurrentUser, voiceProfileId: string): Promise<ResponseResult<null>> {
    try {
      await this.voiceProfileRepo.retireIfUnused(voiceProfileId, RETIRE.MAX_LISTED_SCENARIO_IDS);
      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.DELETED('Voice profile'),
        data: null,
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** `GET /voice-profiles/:id/audio` — authenticated readers (any of the three roles). */
  async streamAudio(_currentUser: ICurrentUser, voiceProfileId: string): Promise<StreamableFile> {
    const profile = await this.findByIdOrThrow(voiceProfileId);
    if (profile.status === VoiceProfileStatus.RETIRED) {
      throw new GoneException(ERROR_MSG.VOICE_PROFILE.RETIRED);
    }
    return this.stream(profile);
  }

  private async stream(profile: VoiceProfile): Promise<StreamableFile> {
    const result = await this.blobService.downloadStreamFromContainer(
      this.container(),
      profile.blobPath || this.blobPath(profile.voiceProfileId),
    );
    if (!result) {
      throw new NotFoundException(ERROR_MSG.VOICE_PROFILE.AUDIO_MISSING);
    }
    return new StreamableFile(result.stream, {
      type: BLOB.CONTENT_TYPE,
      length: result.contentLength,
    });
  }

  /**
   * C1's effective-voice resolver: the scenario's own voice if set and active,
   * else the active gender-default stock voice, else `null`. Single-scenario
   * reads only — batch callers should resolve gender defaults once and reuse
   * them rather than calling this per row.
   */
  async resolveForScenario(scenario: IScenarioVoiceInput): Promise<IScenarioVoiceProfile | null> {
    let profile: VoiceProfile | null = null;
    let source: VoiceProfileSource = VoiceProfileSource.SCENARIO;

    if (scenario.voiceProfileId) {
      profile = await this.voiceProfileRepo.findActiveById(scenario.voiceProfileId);
    }

    if (!profile) {
      const gender = this.resolveGender(scenario.patientData?.gender);
      if (gender) {
        profile = await this.voiceProfileRepo.findActiveDefaultForGender(gender);
        source = VoiceProfileSource.GENDER_DEFAULT;
      }
    }

    if (!profile) return null;
    return this.toEffectiveVoice(profile, source);
  }

  private resolveGender(rawGender: string | null | undefined): VoiceProfileGender {
    const normalized = (rawGender ?? '').trim().toLowerCase();
    return VoiceProfileConstants.GENDER_FEMALE_ALIASES.includes(normalized)
      ? VoiceProfileGender.FEMALE
      : VoiceProfileGender.MALE;
  }

  /**
   * Same binary alias check as `resolveGender`, but for validating a voice's
   * own `gender` tag against `defaultForGender` — an unset/blank gender
   * returns `null` here rather than silently defaulting to MALE, so a
   * profile with no gender tag can never "match" a default by accident.
   * `resolveGender` above deliberately keeps the MALE default: it resolves a
   * *patient's* gender for the fallback lookup, where "anything else means
   * male" is the documented contract behaviour.
   */
  private resolveGenderStrict(rawGender: string | null | undefined): VoiceProfileGender | null {
    const normalized = (rawGender ?? '').trim().toLowerCase();
    if (!normalized) return null;
    return VoiceProfileConstants.GENDER_FEMALE_ALIASES.includes(normalized)
      ? VoiceProfileGender.FEMALE
      : VoiceProfileGender.MALE;
  }

  private assertGenderConsistent(
    gender: string | null | undefined,
    defaultForGender: VoiceProfileGender,
  ): void {
    if (this.resolveGenderStrict(gender) !== defaultForGender) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.GENDER_MISMATCH(gender?.trim() || '(not set)', defaultForGender),
        ErrorTypes.CONFLICT,
      );
    }
  }

  private toEffectiveVoice(
    profile: VoiceProfile,
    source: VoiceProfileSource,
  ): IScenarioVoiceProfile {
    return {
      id: profile.voiceProfileId,
      displayName: profile.displayName,
      source,
    };
  }

  /** Validates a scenario write's `voiceProfileId`: must be an active profile, or null/absent. 400 otherwise. */
  async assertValidForScenarioWrite(voiceProfileId: string | null | undefined): Promise<void> {
    if (voiceProfileId === undefined || voiceProfileId === null) return;
    // The draft/publish routes take an unvalidated body, so a malformed id must be a 400 here
    // rather than a Postgres 22P02 (500) at the lookup below.
    if (!isUUID(voiceProfileId)) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.SCENARIO_VOICE_INVALID(String(voiceProfileId)),
        ErrorTypes.BAD_REQUEST,
      );
    }
    const profile = await this.voiceProfileRepo.findActiveById(voiceProfileId);
    if (!profile) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.SCENARIO_VOICE_INVALID(voiceProfileId),
        ErrorTypes.BAD_REQUEST,
      );
    }
  }

  private async findByIdOrThrow(voiceProfileId: string): Promise<VoiceProfile> {
    const profile = await this.voiceProfileRepo.findById(voiceProfileId);
    if (!profile) {
      throwAppError(ERROR_MSG.DB.NOT_FOUND('Voice profile'), ErrorTypes.NOT_FOUND);
    }
    return profile;
  }

  /**
   * The pre-checks (assertDisplayNameFree / assertGenderDefaultFree) are check-then-write, so two
   * concurrent requests can both pass and the loser hits the partial unique index. Turn that 23505
   * into the same 409 the pre-check gives instead of a 500 from handleError. Any other error
   * returns normally so the caller falls through to handleError.
   */
  private async rethrowUniqueViolation(
    error: unknown,
    context: { displayName?: string; defaultForGender?: VoiceProfileGender | null },
  ): Promise<void> {
    const unique = DbErrorConstants.PG_UNIQUE_VIOLATION;
    if (isPgError(error, unique, VoiceProfileConstants.DB.UQ_DISPLAY_NAME_ACTIVE)) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.DISPLAY_NAME_TAKEN(context.displayName ?? ''),
        ErrorTypes.CONFLICT,
      );
    }
    if (isPgError(error, unique, VoiceProfileConstants.DB.UQ_DEFAULT_FOR_GENDER_ACTIVE)) {
      const gender = context.defaultForGender;
      const holder = gender ? await this.voiceProfileRepo.findActiveDefaultForGender(gender) : null;
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.DEFAULT_TAKEN(holder?.displayName ?? '', gender ?? ''),
        ErrorTypes.CONFLICT,
      );
    }
  }

  private assertActive(profile: VoiceProfile): void {
    if (profile.status === VoiceProfileStatus.RETIRED) {
      throwAppError(ERROR_MSG.VOICE_PROFILE.RETIRED_READ_ONLY, ErrorTypes.CONFLICT);
    }
  }

  private async assertDisplayNameFree(displayName: string, excludeId?: string): Promise<void> {
    const existing = await this.voiceProfileRepo.findActiveByDisplayName(displayName, excludeId);
    if (existing) {
      throwAppError(ERROR_MSG.VOICE_PROFILE.DISPLAY_NAME_TAKEN(displayName), ErrorTypes.CONFLICT);
    }
  }

  private async assertGenderDefaultFree(
    gender: VoiceProfileGender,
    excludeId: string,
  ): Promise<void> {
    const existing = await this.voiceProfileRepo.findActiveDefaultForGender(gender);
    if (existing && existing.voiceProfileId !== excludeId) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.DEFAULT_TAKEN(existing.displayName, gender),
        ErrorTypes.CONFLICT,
      );
    }
  }
}
