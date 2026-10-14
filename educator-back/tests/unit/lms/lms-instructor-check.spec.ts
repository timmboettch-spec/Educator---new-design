import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';

import { LmsConfigStatus, LmsType } from '../../../src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';
import { LoggerService } from '../../../src/common/services';

describe('LmsProvisionService - Instructor Check', () => {
  let service: LmsProvisionService;
  let rosterService: LmsRosterService;
  let dataSource: DataSource;

  const mockSchoolId = 'school-123';
  const mockUserId = 'user-456';
  const mockCourseId = 'course-789';
  const mockNrpsUrl = 'https://moodle.example.com/mod/lti/services.php/123/lineitems';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmsProvisionService,
        {
          provide: DataSource,
          useValue: {
            manager: {
              findOne: jest.fn(),
            },
            transaction: jest.fn(),
            query: jest.fn(),
          },
        },
        {
          provide: LmsRosterService,
          useValue: {
            fetchRosterWithWsFallback: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LmsAdapterFactory,
          useValue: {},
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LmsProvisionService>(LmsProvisionService);
    rosterService = module.get<LmsRosterService>(LmsRosterService);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('isUserInstructorInRoster', () => {
    it('should return true if user has instructor role', async () => {
      const mockConfig: LmsSchoolConfig = {
        id: 'config-1',
        schoolId: mockSchoolId,
        lmsType: LmsType.MOODLE,
        status: LmsConfigStatus.ACTIVE,
      } as LmsSchoolConfig;

      jest.spyOn(dataSource.manager, 'findOne').mockResolvedValue(mockConfig);
      jest.spyOn(rosterService, 'fetchRosterWithWsFallback').mockResolvedValue({
        members: [
          {
            userId: mockUserId,
            name: 'John Instructor',
            email: 'john@example.com',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
          },
        ],
        context: { id: mockCourseId, label: 'Test Course', title: 'Test Course' },
      });

      const result = await service.isUserInstructorInRoster({
        nrpsUrl: mockNrpsUrl,
        lmsUserId: mockUserId,
        schoolId: mockSchoolId,
        lmsCourseId: mockCourseId,
      });

      expect(result.isInstructor).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return false if user has learner role only', async () => {
      const mockConfig: LmsSchoolConfig = {
        id: 'config-1',
        schoolId: mockSchoolId,
        lmsType: LmsType.MOODLE,
        status: LmsConfigStatus.ACTIVE,
      } as LmsSchoolConfig;

      jest.spyOn(dataSource.manager, 'findOne').mockResolvedValue(mockConfig);
      jest.spyOn(rosterService, 'fetchRosterWithWsFallback').mockResolvedValue({
        members: [
          {
            userId: mockUserId,
            name: 'Jane Student',
            email: 'jane@example.com',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
        ],
        context: { id: mockCourseId, label: 'Test Course', title: 'Test Course' },
      });

      const result = await service.isUserInstructorInRoster({
        nrpsUrl: mockNrpsUrl,
        lmsUserId: mockUserId,
        schoolId: mockSchoolId,
        lmsCourseId: mockCourseId,
      });

      expect(result.isInstructor).toBe(false);
      expect(result.error).toBeNull();
    });

    it('should return false if user not found in roster', async () => {
      const mockConfig: LmsSchoolConfig = {
        id: 'config-1',
        schoolId: mockSchoolId,
        lmsType: LmsType.MOODLE,
        status: LmsConfigStatus.ACTIVE,
      } as LmsSchoolConfig;

      jest.spyOn(dataSource.manager, 'findOne').mockResolvedValue(mockConfig);
      jest.spyOn(rosterService, 'fetchRosterWithWsFallback').mockResolvedValue({
        members: [
          {
            userId: 'different-user',
            name: 'Other User',
            email: 'other@example.com',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
          },
        ],
        context: { id: mockCourseId, label: 'Test Course', title: 'Test Course' },
      });

      const result = await service.isUserInstructorInRoster({
        nrpsUrl: mockNrpsUrl,
        lmsUserId: mockUserId,
        schoolId: mockSchoolId,
        lmsCourseId: mockCourseId,
      });

      expect(result.isInstructor).toBe(false);
      expect(result.error).toBe('User not found in course roster');
    });

    it('should return false with error if no school config', async () => {
      jest.spyOn(dataSource.manager, 'findOne').mockResolvedValue(null);

      const result = await service.isUserInstructorInRoster({
        nrpsUrl: mockNrpsUrl,
        lmsUserId: mockUserId,
        schoolId: mockSchoolId,
        lmsCourseId: mockCourseId,
      });

      expect(result.isInstructor).toBe(false);
      expect(result.error).toBe('No active LMS config for school');
    });

    it('should handle roster fetch errors gracefully', async () => {
      const mockConfig: LmsSchoolConfig = {
        id: 'config-1',
        schoolId: mockSchoolId,
        lmsType: LmsType.MOODLE,
        status: LmsConfigStatus.ACTIVE,
      } as LmsSchoolConfig;

      jest.spyOn(dataSource.manager, 'findOne').mockResolvedValue(mockConfig);
      jest
        .spyOn(rosterService, 'fetchRosterWithWsFallback')
        .mockRejectedValue(new Error('Network error'));

      const result = await service.isUserInstructorInRoster({
        nrpsUrl: mockNrpsUrl,
        lmsUserId: mockUserId,
        schoolId: mockSchoolId,
        lmsCourseId: mockCourseId,
      });

      expect(result.isInstructor).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
