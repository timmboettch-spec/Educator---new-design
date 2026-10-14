import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ClassesService } from '../../../src/class/classes.service';

import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LoggerService } from '../../../src/common/services';
import { Class, ClassEducator } from 'src/database/entities';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import type { ClassEducatorRepository, ClassRepository } from 'src/database/repositories';

describe('ClassesService - Co-Educator', () => {
  let service: ClassesService;
  let classRepo: ClassRepository;
  let classEducatorRepo: ClassEducatorRepository;
  let dataSource: DataSource;

  const mockClassId = 'class-123';
  const mockEducatorId1 = 'educator-1';
  const mockEducatorId2 = 'educator-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        {
          provide: CLASS_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: CLASS_EDUCATOR_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: STUDENT_REPOSITORY,
          useValue: {},
        },
        {
          provide: EDUCATOR_REPOSITORY,
          useValue: {},
        },
        {
          provide: SIMULATION_REPORT_REPOSITORY,
          useValue: {},
        },
        {
          provide: CLASS_SIMULATION_REPOSITORY,
          useValue: {},
        },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: GOOGLE_COURSE_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: GOOGLE_STUDENT_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: LMS_CLASS_MAPPING_REPOSITORY,
          useValue: { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() },
        },
        {
          provide: LMS_STUDENT_MAPPING_REPOSITORY,
          useValue: { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
            transaction: jest.fn(),
            manager: {
              findOne: jest.fn(),
            },
          },
        },
        {
          provide: ClassSimulationService,
          useValue: {},
        },
        {
          provide: LmsProvisionService,
          useValue: {},
        },
        {
          provide: LmsConfigService,
          useValue: {},
        },
        {
          provide: LmsAssignmentService,
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

    service = module.get<ClassesService>(ClassesService);
    classRepo = module.get<ClassRepository>(CLASS_REPOSITORY);
    classEducatorRepo = module.get<ClassEducatorRepository>(CLASS_EDUCATOR_REPOSITORY);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('addEducatorToClass', () => {
    it('should add a new educator to class_educators', async () => {
      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(null);
      const mockClassEducator = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classEducatorRepo, 'create').mockResolvedValue(mockClassEducator);

      await service.addEducatorToClass(mockClassId, mockEducatorId2, false);

      expect(classEducatorRepo.create).toHaveBeenCalledWith({
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      });
    });

    it('should not add duplicate educator to class_educators', async () => {
      const existing = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(existing);
      jest.spyOn(classEducatorRepo, 'create');

      await service.addEducatorToClass(mockClassId, mockEducatorId2, false);

      expect(classEducatorRepo.create).not.toHaveBeenCalled();
    });

    it('should promote educator to primary if requested', async () => {
      const existing = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(existing);
      jest.spyOn(classEducatorRepo, 'create').mockResolvedValue({ ...existing, isPrimary: true });

      await service.addEducatorToClass(mockClassId, mockEducatorId2, true);

      expect(existing.isPrimary).toBe(true);
      expect(classEducatorRepo.create).toHaveBeenCalledWith(existing);
    });
  });

  describe('canEducatorAccessClass', () => {
    it('should return true if educator is primary owner', async () => {
      const mockClass = {
        id: mockClassId,
        educator_id: mockEducatorId1,
        is_active: true,
      } as Class;

      jest.spyOn(classRepo, 'findOne').mockResolvedValue(mockClass);

      const result = await service.canEducatorAccessClass(mockClassId, mockEducatorId1);

      expect(result).toBe(true);
    });

    it('should return true if educator is co-instructor', async () => {
      const mockClass = {
        id: mockClassId,
        educator_id: mockEducatorId1,
        is_active: true,
      } as Class;

      const mockClassEducator = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classRepo, 'findOne').mockResolvedValue(mockClass);
      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(mockClassEducator);

      const result = await service.canEducatorAccessClass(mockClassId, mockEducatorId2);

      expect(result).toBe(true);
    });

    it('should return false if educator has no access', async () => {
      const mockClass = {
        id: mockClassId,
        educator_id: mockEducatorId1,
        is_active: true,
      } as Class;

      jest.spyOn(classRepo, 'findOne').mockResolvedValue(mockClass);
      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(null);

      const result = await service.canEducatorAccessClass(mockClassId, 'educator-3');

      expect(result).toBe(false);
    });

    it('should return false if class does not exist', async () => {
      jest.spyOn(classRepo, 'findOne').mockResolvedValue(null);

      const result = await service.canEducatorAccessClass(mockClassId, mockEducatorId1);

      expect(result).toBe(false);
    });
  });
});
