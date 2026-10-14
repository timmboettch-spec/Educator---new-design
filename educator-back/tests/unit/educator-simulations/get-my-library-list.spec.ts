import { ForbiddenException } from '@nestjs/common';
import { ResponseResult } from 'src/common/class/response.class';
import { LibraryDifficulty, LibraryModality } from 'src/common/constants';
import { IMyLibraryFullRow, IMyLibraryLiteRow, ICurrentUser } from 'src/common/interfaces';
import { ListMyLibraryReqDto } from 'src/educator-simulations/dto/list-my-library.dto';
import { EducatorSimulationsService } from 'src/educator-simulations/educator-simulations.service';
import {
  EducatorSimulationRepository,
  SimulationV2Repository,
  UnitRepository,
} from 'src/database/repositories';

const currentUser = { userId: 'user-1', educatorId: 'edu-1' } as ICurrentUser;

const makeRow = (o: Partial<IMyLibraryLiteRow> = {}): IMyLibraryLiteRow => ({
  id: 'entry-1',
  scenarioId: 'cardiac-arrest',
  title: 'Cardiac Arrest',
  description: 'A cardiac arrest simulation.',
  learnerLevel: 'Post-Secondary Nursing',
  difficulty: 'Advanced',
  avatarEnabled: true,
  ...o,
});

const makeFullRow = (o: Partial<IMyLibraryFullRow> = {}): IMyLibraryFullRow => ({
  ...makeRow(),
  unitId: 'adult-health',
  unit: { id: 'adult-health', name: 'Adult Health', imageUrl: 'https://cdn/unit.png' },
  estimatedDuration: '45 minutes',
  timeAllotment: '30 minutes',
  scenarioImage: 'https://cdn/cardiac.png',
  productName: 'Sim Mannequin Pro',
  clinicalSetting: 'Medical-Surgical Unit',
  learningObjectives: ['Recognise cardiac arrest', 'Start CPR within one minute'],
  ...o,
});

const makeDto = (o: Partial<ListMyLibraryReqDto> = {}): ListMyLibraryReqDto =>
  Object.assign(new ListMyLibraryReqDto(), o);

describe('EducatorSimulationsService.getMyLibraryList', () => {
  const repo = { findVisiblePageByEducatorId: jest.fn() };
  let service: EducatorSimulationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EducatorSimulationsService(
      repo as unknown as EducatorSimulationRepository,
      {} as UnitRepository,
      {} as SimulationV2Repository,
    );
  });

  it('maps a saved entry to the full item shape by default', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [makeFullRow()], total: 1 });

    const result = await service.getMyLibraryList(currentUser, makeDto());

    expect(result).toBeInstanceOf(ResponseResult);
    expect(result.data).toEqual([
      {
        id: 'entry-1',
        unitId: 'adult-health',
        unit: { id: 'adult-health', name: 'Adult Health', imageUrl: 'https://cdn/unit.png' },
        scenario: {
          id: 'cardiac-arrest',
          title: 'Cardiac Arrest',
          description: 'A cardiac arrest simulation.',
          learnerLevel: 'Post-Secondary Nursing',
          difficulty: 'Advanced',
          estimatedDuration: '45 minutes',
          timeAllotment: '30 minutes',
          scenarioImage: 'https://cdn/cardiac.png',
          avatarEnabled: true,
          productName: 'Sim Mannequin Pro',
          clinicalSetting: 'Medical-Surgical Unit',
          learningObjectives: ['Recognise cardiac arrest', 'Start CPR within one minute'],
        },
      },
    ]);
  });

  it('keeps a null unit and null optional fields on the full item', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({
      rows: [
        makeFullRow({
          unit: null,
          estimatedDuration: null,
          timeAllotment: null,
          scenarioImage: null,
          avatarEnabled: false,
          productName: null,
          clinicalSetting: null,
          learningObjectives: [],
        }),
      ],
      total: 1,
    });

    const result = await service.getMyLibraryList(currentUser, makeDto());

    expect(result.data?.[0]).toMatchObject({
      unit: null,
      scenario: {
        estimatedDuration: null,
        timeAllotment: null,
        scenarioImage: null,
        avatarEnabled: false,
        productName: null,
        clinicalSetting: null,
        learningObjectives: [],
      },
    });
  });

  it('scopes the query to the acting educator and reports meta for the default first page', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [makeFullRow()], total: 1 });

    const result = await service.getMyLibraryList(currentUser, makeDto());

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith({
      educatorId: 'edu-1',
      skip: 0,
      take: 10,
      filters: { search: undefined },
      lite: false,
    });
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('refuses a caller without an educator profile', async () => {
    await expect(
      service.getMyLibraryList({ userId: 'user-2' } as ICurrentUser, makeDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findVisiblePageByEducatorId).not.toHaveBeenCalled();
  });

  it('turns page and pageSize into skip and take and builds meta for a middle page', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [makeFullRow()], total: 23 });

    const result = await service.getMyLibraryList(currentUser, makeDto({ page: 3, pageSize: 5 }));

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith({
      educatorId: 'edu-1',
      skip: 10,
      take: 5,
      filters: { search: undefined },
      lite: false,
    });
    expect(result.meta).toEqual({
      total: 23,
      page: 3,
      pageSize: 5,
      totalPages: 5,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it('reports zero pages for an empty library', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [], total: 0 });

    const result = await service.getMyLibraryList(currentUser, makeDto());

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('asks the repository for the lite variant when lite is set and sends only the card fields', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [makeFullRow()], total: 1 });

    const result = await service.getMyLibraryList(currentUser, makeDto({ lite: true }));

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith({
      educatorId: 'edu-1',
      skip: 0,
      take: 10,
      filters: { search: undefined },
      lite: true,
    });
    expect(result.data?.[0]).toEqual({
      id: 'entry-1',
      scenario: {
        id: 'cardiac-arrest',
        title: 'Cardiac Arrest',
        description: 'A cardiac arrest simulation.',
        learnerLevel: 'Post-Secondary Nursing',
        difficulty: 'Advanced',
        avatarEnabled: true,
      },
    });
  });

  it('passes the search to the repository normalized (whitespace collapsed, lower case)', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [], total: 0 });

    await service.getMyLibraryList(currentUser, makeDto({ search: 'CARDIAC   Arrest' }));

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { search: 'cardiac arrest' } }),
    );
  });

  it('passes the search to the repository inside filters', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [], total: 0 });

    await service.getMyLibraryList(currentUser, makeDto({ search: 'cardiac' }));

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { search: 'cardiac' } }),
    );
  });

  it('lower-cases difficulties for the repository compare and passes modality and unit ids', async () => {
    repo.findVisiblePageByEducatorId.mockResolvedValue({ rows: [], total: 0 });

    await service.getMyLibraryList(
      currentUser,
      makeDto({
        modality: [LibraryModality.AVATAR],
        difficulty: [LibraryDifficulty.EASY, LibraryDifficulty.MEDIUM],
        unitId: ['adult-health'],
      }),
    );

    expect(repo.findVisiblePageByEducatorId).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          modality: [LibraryModality.AVATAR],
          difficulties: ['easy', 'medium'],
          unitIds: ['adult-health'],
        }) as unknown,
      }),
    );
  });
});
