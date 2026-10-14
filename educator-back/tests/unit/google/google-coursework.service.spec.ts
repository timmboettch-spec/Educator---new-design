import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { LoggerService } from '../../../src/common/services';

describe('GoogleCourseworkService', () => {
  const courseMappingRepo = {
    findByClassId: jest.fn(),
    findBySchoolId: jest.fn(),
  };
  const courseworkMappingRepo = {
    findByClassAndSimulation: jest.fn(),
    findByClassId: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    deleteById: jest.fn(),
  };
  const classSimulationRepo = {
    find: jest.fn(),
  };
  const simulationRepo = {
    findOne: jest.fn(),
  };
  const classRepo = {
    findOne: jest.fn(),
  };
  const classroomService = {
    createCourseWork: jest.fn(),
    deleteCourseWork: jest.fn(),
  };
  const connectionService = {
    getValidAccessToken: jest.fn(),
    markConnectionNeedsReauth: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'app.apiBaseUrl') return 'http://localhost:3000/api';
      if (key === 'app.studentFrontendUrl') return 'http://localhost:5174';
      return undefined;
    }),
  } as unknown as ConfigService;
  const logger = {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleCourseworkService;

  beforeEach(() => {
    jest.clearAllMocks();
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'edu-1',
    });
    service = new GoogleCourseworkService(
      courseMappingRepo as never,
      courseworkMappingRepo as never,
      classSimulationRepo as never,
      simulationRepo as never,
      classRepo as never,
      classroomService as unknown as GoogleClassroomService,
      connectionService as unknown as GoogleConnectionService,
      configService,
      logger,
    );
  });

  it('returns existing mapping without calling Classroom', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue({
      id: 'existing-1',
      googleCourseworkId: 'cw-existing',
    });

    const result = await service.ensureCourseWorkForAssignment({
      classId: 'class-1',
      classSimulationId: 'cs-1',
      simulationId: 'sim-1',
      title: 'Sim',
    });

    expect(result?.id).toBe('existing-1');
    expect(courseMappingRepo.findByClassId).not.toHaveBeenCalled();
    expect(classroomService.createCourseWork).not.toHaveBeenCalled();
  });

  it('no-ops when class is not linked to a Google course', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseMappingRepo.findByClassId.mockResolvedValue(null);

    const result = await service.ensureCourseWorkForAssignment({
      classId: 'class-1',
      classSimulationId: 'cs-1',
      simulationId: 'sim-1',
      title: 'Sim',
    });

    expect(result).toBeNull();
    expect(classroomService.createCourseWork).not.toHaveBeenCalled();
  });

  it('creates coursework and persists mapping for linked class', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseMappingRepo.findByClassId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.createCourseWork.mockResolvedValue({
      id: 'cw-1',
      title: 'Trauma Sim',
      alternateLink: 'https://classroom.google.com/c/x',
    });
    courseworkMappingRepo.create.mockResolvedValue({
      id: 'map-1',
      googleCourseworkId: 'cw-1',
    });

    const result = await service.ensureCourseWorkForAssignment({
      classId: 'class-1',
      classSimulationId: 'cs-1',
      simulationId: 'sim-1',
      title: 'Trauma Sim',
      dueDate: '09-15-2026',
    });

    expect(connectionService.getValidAccessToken).toHaveBeenCalledWith('school-1', 'edu-1');
    expect(classroomService.createCourseWork).toHaveBeenCalledWith(
      'token-1',
      'g-course-1',
      expect.objectContaining({
        title: 'Trauma Sim',
        maxPoints: 100,
        launchLink: expect.stringContaining('auth/google/classroom/launch'),
      }),
    );
    expect(courseworkMappingRepo.create).toHaveBeenCalled();
    expect(result?.googleCourseworkId).toBe('cw-1');
  });

  it('marks connection for reauth on unauthorized create', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseMappingRepo.findByClassId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.createCourseWork.mockRejectedValue(
      new UnauthorizedException('reauth'),
    );

    await expect(
      service.ensureCourseWorkForAssignment({
        classId: 'class-1',
        classSimulationId: 'cs-1',
        simulationId: 'sim-1',
        title: 'Trauma Sim',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(connectionService.markConnectionNeedsReauth).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
  });

  it('syncs missing coursework for active class simulations', async () => {
    courseMappingRepo.findByClassId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
    });
    classSimulationRepo.find.mockResolvedValue([
      { id: 'cs-1', simulation_id: 'sim-1', due_date: '09-10-2026' },
      { id: 'cs-2', simulation_id: 'sim-2', due_date: null },
    ]);
    courseworkMappingRepo.findByClassAndSimulation
      .mockResolvedValueOnce(null) // ensure check for sim-1
      .mockResolvedValueOnce(null) // ensure create path check
      .mockResolvedValueOnce({ id: 'existing' }) // sim-2 already mapped in sync loop
      ;
    simulationRepo.findOne.mockResolvedValue({
      id: 'sim-1',
      title: 'Trauma Sim',
      description: 'desc',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.createCourseWork.mockResolvedValue({
      id: 'cw-1',
      title: 'Trauma Sim',
      alternateLink: null,
    });
    courseworkMappingRepo.create.mockResolvedValue({
      id: 'map-1',
      googleCourseworkId: 'cw-1',
    });

    const result = await service.syncCourseWorkForClass('class-1');

    expect(result.attempted).toBe(2);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(classroomService.createCourseWork).toHaveBeenCalledTimes(1);
  });

  it('deletes Classroom coursework when assignment is removed', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue({
      id: 'map-1',
      schoolId: 'school-1',
      classId: 'class-1',
      simulationId: 'sim-1',
      googleCourseId: 'g-course-1',
      googleCourseworkId: 'cw-1',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.deleteCourseWork.mockResolvedValue(undefined);
    courseworkMappingRepo.deleteById.mockResolvedValue(true);

    const deleted = await service.deleteCourseWorkForAssignment({
      classId: 'class-1',
      simulationId: 'sim-1',
    });

    expect(deleted).toBe(true);
    expect(classroomService.deleteCourseWork).toHaveBeenCalledWith(
      'token-1',
      'g-course-1',
      'cw-1',
    );
    expect(courseworkMappingRepo.deleteById).toHaveBeenCalledWith('map-1');
  });

  it('deletes all Classroom coursework for a class', async () => {
    courseworkMappingRepo.findByClassId.mockResolvedValue([
      {
        id: 'map-1',
        schoolId: 'school-1',
        classId: 'class-1',
        simulationId: 'sim-1',
        googleCourseId: 'g-course-1',
        googleCourseworkId: 'cw-1',
      },
      {
        id: 'map-2',
        schoolId: 'school-1',
        classId: 'class-1',
        simulationId: 'sim-2',
        googleCourseId: 'g-course-1',
        googleCourseworkId: 'cw-2',
      },
    ]);
    courseworkMappingRepo.findByClassAndSimulation
      .mockResolvedValueOnce({
        id: 'map-1',
        schoolId: 'school-1',
        classId: 'class-1',
        simulationId: 'sim-1',
        googleCourseId: 'g-course-1',
        googleCourseworkId: 'cw-1',
      })
      .mockResolvedValueOnce({
        id: 'map-2',
        schoolId: 'school-1',
        classId: 'class-1',
        simulationId: 'sim-2',
        googleCourseId: 'g-course-1',
        googleCourseworkId: 'cw-2',
      });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.deleteCourseWork.mockResolvedValue(undefined);
    courseworkMappingRepo.deleteById.mockResolvedValue(true);

    await service.deleteCourseWorkForClass('class-1');

    expect(classroomService.deleteCourseWork).toHaveBeenCalledTimes(2);
    expect(courseworkMappingRepo.deleteById).toHaveBeenCalledWith('map-1');
    expect(courseworkMappingRepo.deleteById).toHaveBeenCalledWith('map-2');
  });

  it('deletes Classroom coursework when DB mapping create fails after a successful create', async () => {
    courseworkMappingRepo.findByClassAndSimulation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    courseMappingRepo.findByClassId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.createCourseWork.mockResolvedValue({
      id: 'cw-orphan',
      title: 'Trauma Sim',
      alternateLink: null,
    });
    courseworkMappingRepo.create.mockRejectedValue(new Error('db write failed'));
    classroomService.deleteCourseWork.mockResolvedValue(undefined);

    await expect(
      service.ensureCourseWorkForAssignment({
        classId: 'class-1',
        classSimulationId: 'cs-1',
        simulationId: 'sim-1',
        title: 'Trauma Sim',
      }),
    ).rejects.toThrow('db write failed');

    expect(classroomService.deleteCourseWork).toHaveBeenCalledWith(
      'token-1',
      'g-course-1',
      'cw-orphan',
    );
  });
});
