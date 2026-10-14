import { ClassesService } from '../../../src/class/classes.service';
import { GoogleCourseMapping, GoogleCourseworkMapping } from '../../../src/database/entities';
import { LmsType } from '../../../src/common/enums/lms.enum';

describe('ClassesService.getClassLmsLinkage', () => {
  const classRow = { id: 'class-1', school_id: 'school-1', is_active: true };

  const classRepo = { findActiveByIdWithSchoolForEducator: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn() };
  const lmsClassMappingRepo = { findOne: jest.fn() };
  const googleRows = new Map<unknown, unknown>();
  const dataSource = {
    manager: {
      findOne: jest.fn(async (entity: unknown) => googleRows.get(entity) ?? null),
      find: jest.fn(async (entity: unknown) => googleRows.get(`${String(entity)}:many`) ?? []),
    },
  };
  const lmsConfigService = { getOptionalBySchoolId: jest.fn() };
  const lmsAssignmentService = { findByClass: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new ClassesService(
    {} as never,
    classRepo as never,
    {} as never,
    {} as never,
    {} as never,
    educatorSchoolRepo as never,
    {} as never,
    {} as never,
    lmsClassMappingRepo as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    lmsConfigService as never,
    lmsAssignmentService as never,
    logger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    googleRows.clear();
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(classRow);
    educatorSchoolRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
    lmsClassMappingRepo.findOne.mockResolvedValue(null);
    lmsConfigService.getOptionalBySchoolId.mockResolvedValue(null);
    lmsAssignmentService.findByClass.mockResolvedValue([]);
  });

  it('names the LTI platform from the school config and drops mappings with no simulation', async () => {
    lmsClassMappingRepo.findOne.mockResolvedValue({ lmsCourseId: '12345' });
    lmsConfigService.getOptionalBySchoolId.mockResolvedValue({ lmsType: LmsType.CANVAS });
    lmsAssignmentService.findByClass.mockResolvedValue([
      { simulationId: 'sim-1', lmsLineItemLabel: 'Chest Pain Scenario' },
      { simulationId: null, lmsLineItemLabel: 'Orphaned line item' },
    ]);

    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result.data).toEqual({
      provider: 'canvas',
      course: { id: '12345', name: null, url: null },
      assignments: [{ simulationId: 'sim-1', label: 'Chest Pain Scenario', url: null }],
    });
  });

  it('falls back to a generic provider when the school has no LMS config row', async () => {
    lmsClassMappingRepo.findOne.mockResolvedValue({ lmsCourseId: '12345' });

    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result.data).toMatchObject({ provider: 'lms' });
  });

  it('returns the Google course and its CourseWork links', async () => {
    googleRows.set(GoogleCourseMapping, {
      googleCourseId: '98765',
      googleCourseName: 'Realityworks Test Course',
    });
    googleRows.set(`${String(GoogleCourseworkMapping)}:many`, [
      {
        simulationId: 'sim-1',
        title: 'Diabetes Sim',
        alternateLink: 'https://classroom.google.com/c/abc/a/def',
      },
    ]);

    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result.data).toEqual({
      provider: 'google_classroom',
      course: { id: '98765', name: 'Realityworks Test Course', url: null },
      assignments: [
        {
          simulationId: 'sim-1',
          label: 'Diabetes Sim',
          url: 'https://classroom.google.com/c/abc/a/def',
        },
      ],
    });
  });

  it('reports a manual class as unlinked', async () => {
    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result).toMatchObject({
      success: true,
      data: { provider: null, course: null, assignments: [] },
    });
  });

  it('reports unlinked instead of an error when the educator cannot access the class', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result).toMatchObject({ success: true, data: { provider: null } });
    expect(lmsClassMappingRepo.findOne).not.toHaveBeenCalled();
    expect(dataSource.manager.findOne).not.toHaveBeenCalled();
  });

  it('logs and reports unlinked when a mapping lookup throws', async () => {
    lmsClassMappingRepo.findOne.mockRejectedValue(new Error('decrypt failed'));

    const result = await service.getClassLmsLinkage('class-1', 'edu-1');

    expect(result).toMatchObject({ success: true, data: { provider: null } });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('ClassesService list LMS linkage enrichment', () => {
  const query = jest.fn();
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new ClassesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
    logger as never,
  );

  const enrich = (classes: unknown[]): Promise<void> =>
    (
      service as unknown as {
        enrichClassesWithLmsLinkage: (rows: unknown[]) => Promise<void>;
      }
    ).enrichClassesWithLmsLinkage(classes);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flattens the LTI provider and course onto the matching class only', async () => {
    query.mockResolvedValue([
      {
        class_id: 'class-1',
        lms_course_id: 'ctx-hash',
        lms_type: 'canvas',
        google_course_id: null,
        google_course_name: null,
      },
    ]);
    const classes = [{ id: 'class-1' }, { id: 'class-2' }];

    await enrich(classes);

    expect(classes[0]).toMatchObject({
      lms_linkage: { provider: 'canvas', courseId: 'ctx-hash', courseName: null },
    });
    expect(classes[1]).toMatchObject({ lms_linkage: null });
  });

  it('flattens the Google course name', async () => {
    query.mockResolvedValue([
      {
        class_id: 'class-1',
        lms_course_id: null,
        lms_type: null,
        google_course_id: '98765',
        google_course_name: 'Realityworks Test Course',
      },
    ]);
    const classes = [{ id: 'class-1' }];

    await enrich(classes);

    expect(classes[0]).toMatchObject({
      lms_linkage: {
        provider: 'google_classroom',
        courseId: '98765',
        courseName: 'Realityworks Test Course',
      },
    });
  });

  it('keeps the field present as null when the enrichment query fails', async () => {
    query.mockRejectedValue(new Error('relation does not exist'));
    const classes = [{ id: 'class-1' }];

    await enrich(classes);

    expect(classes[0]).toHaveProperty('lms_linkage', null);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the field present as null for a listing with no usable class ids', async () => {
    const classes = [{ id: '' }];

    await enrich(classes);

    expect(classes[0]).toHaveProperty('lms_linkage', null);
    expect(query).not.toHaveBeenCalled();
  });
});
