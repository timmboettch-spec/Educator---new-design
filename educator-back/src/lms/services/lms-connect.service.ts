import { BadGatewayException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { LmsConfigService } from './lms-config.service';
import { LmsRosterService } from './lms-roster.service';

import { LmsClassMapping } from 'src/database/entities';
import { LMS_CLASS_MAPPING_REPOSITORY } from 'src/database/tokens';
import { LmsClassMappingRepository } from 'src/database/repositories';

@Injectable()
export class LmsConnectService {
  constructor(
    @Inject(LMS_CLASS_MAPPING_REPOSITORY)
    private readonly classMappingRepo: LmsClassMappingRepository,
    private readonly configService: LmsConfigService,
    private readonly rosterService: LmsRosterService,
  ) {}

  async previewRoster(
    schoolId: string,
    nrpsUrl: string,
  ): Promise<{
    members: Array<{
      lmsUserId: string;
      name: string | null;
      email: string | null;
      roles: string[];
    }>;
    note: string;
  }> {
    const config = await this.configService.getActiveBySchoolId(schoolId);
    let roster: import('../interfaces/lms.interfaces').LmsRosterResponse;
    try {
      roster = await this.rosterService.fetchRoster(config, nrpsUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LMS roster request failed';
      if (
        message.includes('LMS token request failed') ||
        message.includes('LMS connection failed')
      ) {
        throw new BadGatewayException(message);
      }
      throw error;
    }

    return {
      members: roster.members.map((member) => ({
        lmsUserId: member.userId,
        name: member.name,
        email: member.email,
        roles: member.roles,
      })),
      note: 'Roster is returned in memory only and is not persisted.',
    };
  }

  async getClassMapping(classId: string): Promise<LmsClassMapping> {
    const mapping = await this.classMappingRepo.findOne({ where: { classId } });
    if (!mapping) {
      throw new NotFoundException(`No LMS mapping found for class ${classId}`);
    }
    return mapping;
  }
}
