import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { Transcript } from 'src/database/entities';

@Injectable()
export class TranscriptRepository {
  constructor(
    @InjectRepository(Transcript)
    private readonly repo: Repository<Transcript>,
  ) { }

  async create(data: DeepPartial<Transcript>): Promise<Transcript> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Transcript> = {}): Promise<Transcript[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Transcript>): Promise<Transcript | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<Transcript> = {}): Promise<[Transcript[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<Transcript> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<Transcript>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(transcriptId: string): Promise<Transcript | null> {
    return this.repo.findOne({ where: { transcriptId } });
  }

  /** Lookup by the original external business identifier, not the surrogate transcriptId. */
  async findByBusinessId(id: string): Promise<Transcript | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<Transcript[]> {
    return this.repo.find({ where: { userId } });
  }

  async findByScenarioId(scenarioId: string): Promise<Transcript[]> {
    return this.repo.find({ where: { scenarioId } });
  }

  async updateById(transcriptId: string, data: DeepPartial<Transcript>): Promise<Transcript | null> {
    await this.repo.update({ transcriptId }, data);
    return this.findById(transcriptId);
  }

  async updateByBusinessId(id: string, data: DeepPartial<Transcript>): Promise<Transcript | null> {
    await this.repo.update({ id }, data);
    return this.findByBusinessId(id);
  }

  async update(where: FindOptionsWhere<Transcript>, data: DeepPartial<Transcript>): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(transcriptId: string): Promise<void> {
    await this.repo.delete({ transcriptId });
  }

  async softDelete(transcriptId: string): Promise<void> {
    await this.repo.softDelete({ transcriptId });
  }

  async upsertByBusinessId(rows: DeepPartial<Transcript>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.repo.upsert(rows, { conflictPaths: ['id'] });
  }
}
