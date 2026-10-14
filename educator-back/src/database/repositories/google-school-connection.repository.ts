import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, In, Repository } from 'typeorm';
import { GoogleSchoolConnection } from 'src/database/entities';
import { GoogleConnectionStatus } from 'src/google/google.constants';

@Injectable()
export class GoogleSchoolConnectionRepository {
  constructor(
    @InjectRepository(GoogleSchoolConnection)
    private readonly repo: Repository<GoogleSchoolConnection>,
  ) {}

  async create(data: DeepPartial<GoogleSchoolConnection>): Promise<GoogleSchoolConnection> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: GoogleSchoolConnection): Promise<GoogleSchoolConnection> {
    return this.repo.save(entity);
  }

  async findOne(
    options: FindOneOptions<GoogleSchoolConnection>,
  ): Promise<GoogleSchoolConnection | null> {
    return this.repo.findOne(options);
  }

  /** @deprecated Prefer findBySchoolAndEducator — school may have multiple connections. */
  async findBySchoolId(schoolId: string): Promise<GoogleSchoolConnection | null> {
    return this.repo.findOne({ where: { schoolId } });
  }

  /**
   * The subset of `schoolIds` where the educator has their own **usable** Google Classroom
   * connection. Only `ACTIVE` counts: `REVOKED` and `ERROR` rows can't sync (see
   * `GoogleConnectionService.getValidAccessToken`).
   */
  async findConnectedSchoolIds(educatorId: string, schoolIds: string[]): Promise<string[]> {
    if (schoolIds.length === 0) return [];
    const connections = await this.repo.find({
      where: {
        connectedByEducatorId: educatorId,
        schoolId: In(schoolIds),
        status: GoogleConnectionStatus.ACTIVE,
      },
      select: { id: true, schoolId: true },
    });
    return connections.map((connection) => connection.schoolId);
  }

  async findBySchoolAndEducator(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleSchoolConnection | null> {
    return this.repo.findOne({
      where: { schoolId, connectedByEducatorId: educatorId },
    });
  }

  async findBySchoolAndGoogleAccountId(
    schoolId: string,
    googleAccountId: string,
  ): Promise<GoogleSchoolConnection | null> {
    return this.repo.findOne({
      where: { schoolId, googleAccountId },
    });
  }

  async findBySchoolAndGoogleEmail(
    schoolId: string,
    googleAccountEmail: string,
  ): Promise<GoogleSchoolConnection | null> {
    const email = googleAccountEmail.trim().toLowerCase();
    if (!email) {
      return null;
    }
    return this.repo
      .createQueryBuilder('c')
      .where('c.school_id = :schoolId', { schoolId })
      .andWhere('LOWER(c.google_account_email) = :email', { email })
      .getOne();
  }

  async deleteBySchoolAndEducator(schoolId: string, educatorId: string): Promise<boolean> {
    const result = await this.repo.delete({
      schoolId,
      connectedByEducatorId: educatorId,
    });
    return (result.affected ?? 0) > 0;
  }

  /** @deprecated Prefer deleteBySchoolAndEducator. */
  async deleteBySchoolId(schoolId: string): Promise<boolean> {
    const result = await this.repo.delete({ schoolId });
    return (result.affected ?? 0) > 0;
  }
}
