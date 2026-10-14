import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClassSimulationController } from 'src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { ListClassSimulationsReqDto } from 'src/class-simulations/dto/list-class-simulations.dto';
import { ResponseResult } from 'src/common/class/response.class';
import { ClassSimulationSortField, RoleSlug } from 'src/common/constants';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { IClassSimulationListingRow, ICurrentUser } from 'src/common/interfaces';
import { Class } from 'src/database/entities';

const CLASS_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const currentUser = { userId: 'user-1', educatorId: 'edu-1' } as ICurrentUser;

const makeRow = (o: Partial<IClassSimulationListingRow> = {}): IClassSimulationListingRow => ({
  classSimulationId: 'cs-1',
  simId: 'colostomy-care',
  simName: 'Colostomy Care and Education',
  isArchived: false,
  startDate: '2026-01-01',
  dueDate: '2026-12-31',
  closeDate: '2026-12-31',
  startedCount: 3,
  completedCount: 1,
  averageScore: 78,
  avatarEnabled: true,
  unitId: 'gastrointestinal-care',
  unitName: 'Gastrointestinal Care',
  ...o,
});

const makeDto = (o: Partial<ListClassSimulationsReqDto> = {}): ListClassSimulationsReqDto =>
  Object.assign(new ListClassSimulationsReqDto(), { classId: CLASS_ID, ...o });

describe('ClassSimulationService.findClassSimulations', () => {
  let service: ClassSimulationService;
  const classSimulationRepo = { findForClassListing: jest.fn() };
  const classRepo = { findActiveByIdWithSchoolForEducator: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn() };

  beforeEach(() => {
    // Only the three repositories are used by this method; every other dependency is unused.
    service = new ClassSimulationService(
      {} as never, // educatorService
      classSimulationRepo as never,
      classRepo as never,
      {} as never, // simulationRepo
      {} as never, // studentRepo
      {} as never, // unitRepository
      {} as never, // simulationReportRepo
      {} as never, // dataSource
      {} as never, // notificationsGateway
      {} as never, // configService
      {} as never, // logger
      {} as never, // googleCourseworkService
      educatorSchoolRepo as never,
      {} as never, // educatorRepo
    );

    // No school -> accessible without the school-assignment lookup.
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({ id: CLASS_ID } as Class);
    classSimulationRepo.findForClassListing.mockResolvedValue({ rows: [makeRow()], total: 1 });
  });

  afterEach(() => jest.clearAllMocks());

  describe('success and validation paths', () => {
    it('checks class access for the acting educator and the query classId', async () => {
      await service.findClassSimulations(currentUser, makeDto());
      expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(CLASS_ID, 'edu-1');
    });

    it('returns the rows with pagination meta and the exact response field set', async () => {
      const result = await service.findClassSimulations(currentUser, makeDto());

      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.data).toEqual([makeRow()]);
      expect(Object.keys(result.data![0]).sort()).toEqual(
        [
          'averageScore',
          'avatarEnabled',
          'classSimulationId',
          'closeDate',
          'completedCount',
          'dueDate',
          'isArchived',
          'simId',
          'simName',
          'startDate',
          'startedCount',
          'unitId',
          'unitName',
        ].sort(),
      );
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('never returns an assignment status field', async () => {
      const result = await service.findClassSimulations(currentUser, makeDto());
      expect(result.data![0]).not.toHaveProperty('assignmentStatus');
      expect(result.data![0]).not.toHaveProperty('status');
    });

    it('includes archived simulations as returned by the repository', async () => {
      classSimulationRepo.findForClassListing.mockResolvedValue({
        rows: [makeRow({ isArchived: true, simName: null })],
        total: 1,
      });
      const result = await service.findClassSimulations(currentUser, makeDto());
      expect(result.data![0].isArchived).toBe(true);
    });

    it('defaults to simName ASC when no sort is given', async () => {
      await service.findClassSimulations(currentUser, makeDto());
      expect(classSimulationRepo.findForClassListing).toHaveBeenCalledWith(
        CLASS_ID,
        { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' },
        { skip: 0, take: 10 },
      );
    });

    it('applies sortDir to the default simName sort', async () => {
      await service.findClassSimulations(currentUser, makeDto({ sortDir: 'desc' }));
      expect(classSimulationRepo.findForClassListing).toHaveBeenCalledWith(
        CLASS_ID,
        { field: ClassSimulationSortField.SIM_NAME, direction: 'DESC' },
        expect.any(Object),
      );
    });

    it.each(Object.values(ClassSimulationSortField))(
      'passes sortBy=%s through with an upper-cased direction',
      async (sortBy) => {
        await service.findClassSimulations(currentUser, makeDto({ sortBy, sortDir: 'desc' }));
        expect(classSimulationRepo.findForClassListing).toHaveBeenCalledWith(
          CLASS_ID,
          { field: sortBy, direction: 'DESC' },
          expect.any(Object),
        );
      },
    );

    it('defaults the direction to ASC when only sortBy is given', async () => {
      await service.findClassSimulations(
        currentUser,
        makeDto({ sortBy: ClassSimulationSortField.AVERAGE_SCORE }),
      );
      expect(classSimulationRepo.findForClassListing).toHaveBeenCalledWith(
        CLASS_ID,
        { field: ClassSimulationSortField.AVERAGE_SCORE, direction: 'ASC' },
        expect.any(Object),
      );
    });

    it('translates page/pageSize into skip/take and builds the meta', async () => {
      classSimulationRepo.findForClassListing.mockResolvedValue({ rows: [makeRow()], total: 45 });
      const result = await service.findClassSimulations(
        currentUser,
        makeDto({ page: 3, pageSize: 20 }),
      );
      expect(classSimulationRepo.findForClassListing).toHaveBeenCalledWith(
        CLASS_ID,
        expect.any(Object),
        { skip: 40, take: 20 },
      );
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        pageSize: 20,
        totalPages: 3,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('returns an empty page with correct meta when the page is past the end', async () => {
      classSimulationRepo.findForClassListing.mockResolvedValue({ rows: [], total: 3 });
      const result = await service.findClassSimulations(
        currentUser,
        makeDto({ page: 5, pageSize: 10 }),
      );
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 3, page: 5, totalPages: 1, hasNextPage: false }),
      );
    });

    it('returns an empty list for a class with no assigned simulations', async () => {
      classSimulationRepo.findForClassListing.mockResolvedValue({ rows: [], total: 0 });
      const result = await service.findClassSimulations(currentUser, makeDto());
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual(expect.objectContaining({ total: 0, totalPages: 0 }));
    });

    it('allows a class in an active school the educator is assigned to', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        id: CLASS_ID,
        school_id: 'school-1',
        school: { is_active: true },
      } as Class);
      educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });

      await service.findClassSimulations(currentUser, makeDto());

      expect(educatorSchoolRepo.findOne).toHaveBeenCalledWith({
        where: { educator: { id: 'edu-1' }, school: { id: 'school-1' } },
      });
      expect(classSimulationRepo.findForClassListing).toHaveBeenCalled();
    });

    it.each<[string, Partial<Class> | null, unknown]>([
      ['the class is unknown or not owned/co-instructed', null, null],
      [
        'the class school is inactive',
        { id: CLASS_ID, school_id: 'school-1', school: { is_active: false } } as Partial<Class>,
        { id: 'es-1' },
      ],
      [
        'the educator is no longer assigned to the class school',
        { id: CLASS_ID, school_id: 'school-1', school: { is_active: true } } as Partial<Class>,
        null,
      ],
    ])('throws 404 when %s', async (_case, classEntity, assignment) => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(classEntity);
      educatorSchoolRepo.findOne.mockResolvedValue(assignment);

      await expect(service.findClassSimulations(currentUser, makeDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(classSimulationRepo.findForClassListing).not.toHaveBeenCalled();
    });

    it('throws 403 when the caller has no educator id', async () => {
      await expect(
        service.findClassSimulations({ userId: 'user-1' } as ICurrentUser, makeDto()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(classRepo.findActiveByIdWithSchoolForEducator).not.toHaveBeenCalled();
    });

    it('wraps an unexpected repository error via handleError', async () => {
      classSimulationRepo.findForClassListing.mockRejectedValue(new Error('db down'));
      await expect(service.findClassSimulations(currentUser, makeDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

describe('ClassSimulationController.findForClassListing', () => {
  it('declares @RequiredRoles(Educator) only', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      ClassSimulationController.prototype.findForClassListing,
    ) as RoleSlug[] | undefined;
    expect(roles).toEqual([RoleSlug.EDUCATOR]);
  });

  it('delegates to the listing service and returns its result untouched', async () => {
    const expected = new ResponseResult({ message: 'ok', data: [] });
    const findClassSimulations = jest.fn().mockResolvedValue(expected);
    const controller = new ClassSimulationController(
      { findClassSimulations } as unknown as ClassSimulationService,
      {} as never,
    );
    const dto = makeDto({ sortBy: ClassSimulationSortField.STARTED_COUNT });

    const result = await controller.findForClassListing(currentUser, dto);

    expect(findClassSimulations).toHaveBeenCalledWith(currentUser, dto);
    expect(result).toBe(expected);
  });
});
