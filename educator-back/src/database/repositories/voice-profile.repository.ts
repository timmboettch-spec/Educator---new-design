import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOptionsWhere, Not, Raw, Repository } from 'typeorm';
import { SimulationV2, VoiceProfile } from 'src/database/entities';
import { VoiceProfileGender, VoiceProfileStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes } from 'src/common/utils/messages';
import type { VoiceAudioUploader } from 'src/common/interfaces/voice-profile.interface';

/** Optional catalog filters for `findAllOrdered` — see its docstring. */
export interface VoiceProfileTagFilters {
  gender?: string;
  age?: number;
  ethnicity?: string;
  emotion?: string;
}

@Injectable()
export class VoiceProfileRepository {
  constructor(
    @InjectRepository(VoiceProfile)
    private readonly repo: Repository<VoiceProfile>,
  ) {}

  async create(data: DeepPartial<VoiceProfile>): Promise<VoiceProfile> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Insert a profile, upload its audio, then record the blob path, all in one
   * transaction. The row id is needed for the blob path, so the insert comes
   * first; if `upload` throws, the insert rolls back and no half-made profile
   * is left selectable or holding its display name. Returns the saved row.
   */
  async createWithAudio(
    data: DeepPartial<VoiceProfile>,
    upload: VoiceAudioUploader,
  ): Promise<VoiceProfile> {
    return this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(VoiceProfile);
      const created = await txRepo.save(txRepo.create(data));
      const blobPath = await upload(created.voiceProfileId);
      await txRepo.update({ voiceProfileId: created.voiceProfileId }, { blobPath });
      created.blobPath = blobPath;
      return created;
    });
  }

  /**
   * Applies a change to a profile under a `FOR UPDATE` row lock, in one transaction. `build`
   * receives the freshly locked row (so it can re-check status and gender against what is really
   * committed) and returns the changes; throwing from it rolls everything back. Scenario writes
   * take a `FOR SHARE` lock on the same row (SimulationV2Repository), so this serialises against
   * them and against `retireIfUnused`.
   */
  async updateLocked(
    voiceProfileId: string,
    build: (locked: VoiceProfile) => DeepPartial<VoiceProfile>,
  ): Promise<VoiceProfile> {
    return this.repo.manager.transaction(async (manager) => {
      const locked = await manager.findOne(VoiceProfile, {
        where: { voiceProfileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throwAppError(ERROR_MSG.DB.NOT_FOUND('Voice profile'), ErrorTypes.NOT_FOUND);
      const changes = build(locked);
      return manager.save(VoiceProfile, manager.merge(VoiceProfile, locked, changes));
    });
  }

  /**
   * Retires a profile unless a scenario still uses it or it is a gender default, atomically.
   * The row is locked `FOR UPDATE` first, so a scenario write holding the `FOR SHARE` lock
   * (SimulationV2Repository `lockVoiceProfileId`) either commits before the usage count below,
   * and is counted, or waits and then finds the profile retired and is refused. Already-retired
   * is a no-op. Throws 404 / 409 (gender default) / 409 IN_USE naming up to `maxListedIds`
   * scenarios.
   */
  async retireIfUnused(voiceProfileId: string, maxListedIds: number): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const locked = await manager.findOne(VoiceProfile, {
        where: { voiceProfileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throwAppError(ERROR_MSG.DB.NOT_FOUND('Voice profile'), ErrorTypes.NOT_FOUND);
      if (locked.status === VoiceProfileStatus.RETIRED) return;

      if (locked.defaultForGender) {
        throwAppError(
          ERROR_MSG.VOICE_PROFILE.IS_DEFAULT(locked.defaultForGender),
          ErrorTypes.CONFLICT,
        );
      }

      // Soft-deleted scenarios are excluded by the entity's delete-date column; drafts count.
      const usageCount = await manager.count(SimulationV2, { where: { voiceProfileId } });
      if (usageCount > 0) {
        const rows = await manager.find(SimulationV2, {
          where: { voiceProfileId },
          select: { simulationId: true, id: true },
          order: { id: 'ASC' },
          take: maxListedIds,
        });
        throwAppError(
          ERROR_MSG.VOICE_PROFILE.IN_USE(usageCount, rows.map((row) => row.id).join(', ')),
          ErrorTypes.CONFLICT,
        );
      }

      await manager.update(
        VoiceProfile,
        { voiceProfileId },
        { status: VoiceProfileStatus.RETIRED, retiredAt: new Date() },
      );
    });
  }

  async save(entity: VoiceProfile): Promise<VoiceProfile> {
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<VoiceProfile> = {}): Promise<VoiceProfile[]> {
    return this.repo.find(options);
  }

  async exists(where: FindOptionsWhere<VoiceProfile>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(voiceProfileId: string): Promise<VoiceProfile | null> {
    return this.repo.findOne({ where: { voiceProfileId } });
  }

  async findActiveById(voiceProfileId: string): Promise<VoiceProfile | null> {
    return this.repo.findOne({ where: { voiceProfileId, status: VoiceProfileStatus.ACTIVE } });
  }

  /** Every active profile, newest last. Small table — the effective-voice resolver reads it whole. */
  async findActive(): Promise<VoiceProfile[]> {
    return this.repo.find({
      where: { status: VoiceProfileStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Catalog listing. `filters`' string tags match case-insensitively (mirrors
   * the display-name lookup below); `age` is an exact match. All optional —
   * an absent filter isn't applied.
   */
  async findAllOrdered(
    status?: VoiceProfileStatus,
    filters?: VoiceProfileTagFilters,
  ): Promise<VoiceProfile[]> {
    const ciEquals = (param: string, value: string): ReturnType<typeof Raw> =>
      Raw((alias) => `lower(${alias}) = lower(:${param})`, { [param]: value });

    const where: FindOptionsWhere<VoiceProfile> = {
      ...(status ? { status } : {}),
      ...(filters?.gender !== undefined ? { gender: ciEquals('gender', filters.gender) } : {}),
      ...(filters?.ethnicity !== undefined
        ? { ethnicity: ciEquals('ethnicity', filters.ethnicity) }
        : {}),
      ...(filters?.emotion !== undefined ? { emotion: ciEquals('emotion', filters.emotion) } : {}),
      ...(filters?.age !== undefined ? { age: filters.age } : {}),
    };
    return this.repo.find({ where, order: { createdAt: 'ASC' } });
  }

  /**
   * Another ACTIVE profile with the same display name, case-insensitively —
   * mirrors the `lower(display_name)` partial unique index.
   */
  async findActiveByDisplayName(
    displayName: string,
    excludeVoiceProfileId?: string,
  ): Promise<VoiceProfile | null> {
    return this.repo.findOne({
      where: {
        status: VoiceProfileStatus.ACTIVE,
        displayName: Raw((alias) => `lower(${alias}) = lower(:displayName)`, { displayName }),
        ...(excludeVoiceProfileId ? { voiceProfileId: Not(excludeVoiceProfileId) } : {}),
      },
    });
  }

  async findActiveDefaultForGender(gender: VoiceProfileGender): Promise<VoiceProfile | null> {
    return this.repo.findOne({
      where: { status: VoiceProfileStatus.ACTIVE, defaultForGender: gender },
    });
  }

  merge(target: VoiceProfile, ...sources: DeepPartial<VoiceProfile>[]): VoiceProfile {
    return this.repo.merge(target, ...sources);
  }
}
