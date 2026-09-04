import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClassesService } from '../../../src/class/classes.service';
import { Class } from '../../../src/class/entity/class.entity';
import { ClassEducator } from '../../../src/class/entity/class-educator.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';

describe('ClassesService - Co-Educator', () => {
  let service: ClassesService;
  let classRepo: Repository<Class>;
  let classEducatorRepo: Repository<ClassEducator>;
  let dataSource: DataSource;

  const mockClassId = 'class-123';
  const mockEducatorId1 = 'educator-1';
  const mockEducatorId2 = 'educator-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        {
          provide: getRepositoryToken(Class),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ClassEducator),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Student),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Educator),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ClassSimulation),
          useValue: {},
        },
        {
          provide: getRepositoryToken(EducatorSchool),
          useValue: {
            findOne: jest.fn(),
          },
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
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
    classRepo = module.get<Repository<Class>>(getRepositoryToken(Class));
    classEducatorRepo = module.get<Repository<ClassEducator>>(getRepositoryToken(ClassEducator));
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

      jest.spyOn(classEducatorRepo, 'create').mockReturnValue(mockClassEducator);
      jest.spyOn(classEducatorRepo, 'save').mockResolvedValue(mockClassEducator);

      await service.addEducatorToClass(mockClassId, mockEducatorId2, false);

      expect(classEducatorRepo.create).toHaveBeenCalledWith({
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      });
      expect(classEducatorRepo.save).toHaveBeenCalledWith(mockClassEducator);
    });

    it('should not add duplicate educator to class_educators', async () => {
      const existing = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(existing);
      jest.spyOn(classEducatorRepo, 'create');
      jest.spyOn(classEducatorRepo, 'save');

      await service.addEducatorToClass(mockClassId, mockEducatorId2, false);

      expect(classEducatorRepo.create).not.toHaveBeenCalled();
      expect(classEducatorRepo.save).not.toHaveBeenCalled();
    });

    it('should promote educator to primary if requested', async () => {
      const existing = {
        classId: mockClassId,
        educatorId: mockEducatorId2,
        isPrimary: false,
      } as ClassEducator;

      jest.spyOn(classEducatorRepo, 'findOne').mockResolvedValue(existing);
      jest.spyOn(classEducatorRepo, 'save').mockResolvedValue({ ...existing, isPrimary: true });

      await service.addEducatorToClass(mockClassId, mockEducatorId2, true);

      expect(existing.isPrimary).toBe(true);
      expect(classEducatorRepo.save).toHaveBeenCalledWith(existing);
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
