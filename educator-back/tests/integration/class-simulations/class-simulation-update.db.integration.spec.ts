import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource, FindOneOptions } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import {
  Class,
  ClassEducator,
  ClassSimulation,
  Educator,
  EducatorSchool,
} from '../../../src/database/entities';
import { ClassSimulationRepository } from '../../../src/database/repositories/class-simulation.repository';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { EducatorSchoolRepository } from '../../../src/database/repositories/educator-school.repository';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../../src/database/tokens';
import { DatabaseService } from '../../../src/database/services/database.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { LoggerService } from '../../../src/common/services';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { RoleSlug } from '../../../src/common/constants';
import { ERROR_MSG } from '../../../src/common/messages/error.message';
import type { ICurrentUser } from '../../../src/common/interfaces';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

const MARKER = 'CS-UPDATE-DB-TEST';

/**
 * Runs `ClassSimulationService.update` against real Postgres: access scoping through the real
 * `classes`/`class_educators` rows, the service-level overlap check (the only guard since
 * 1790224730322-AlignSchemaWithEntities dropped the overlap trigger), date normalisation, and
 * the date-only guarded write racing `remove()`.
 */
describeWithDb('ClassSimulationService.update (DB Integration)', () => {
  let dataSource: DataSource;
  let service: ClassSimulationService;
  let csRepo: ClassSimulationRepository;
  let ownerUser: ICurrentUser;
  let coInstructorUser: ICurrentUser;
  let outsiderUser: ICurrentUser;
  let classId: string;

  const simulationId = `${MARKER}-sim`;

  const seedAssignment = (startDate: string, endDate: string): Promise<ClassSimulation> =>
    csRepo.create({
      class_id: classId,
      simulation_id: simulationId,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
    });

  const readRow = (id: string): Promise<ClassSimulation | null> =>
    dataSource.getRepository(ClassSimulation).findOne({ where: { id } });

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    csRepo = new ClassSimulationRepository(dataSource.getRepository(ClassSimulation));

    const module = await Test.createTestingModule({
      providers: [
        ClassSimulationService,
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: csRepo },
        {
          provide: CLASS_REPOSITORY,
          useValue: new ClassRepository(dataSource.getRepository(Class)),
        },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: new EducatorSchoolRepository(dataSource.getRepository(EducatorSchool)),
        },
        { provide: EDUCATOR_REPOSITORY, useValue: {} },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: {} },
        { provide: SIMULATION_V2_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: STUDENT_REPOSITORY, useValue: {} },
        { provide: UNIT_REPOSITORY, useValue: {} },
        { provide: DatabaseService, useValue: {} },
        { provide: EducatorsService, useValue: {} },
        {
          provide: NotificationsGateway,
          useValue: { notifyEducatorSimulationDueDateReminder: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('3') } },
        { provide: GoogleCourseworkService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ClassSimulationService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    const educatorRepo = dataSource.getRepository(Educator);
    const [owner, coInstructor, outsider] = await Promise.all(
      ['owner', 'co-instructor', 'outsider'].map((role) =>
        educatorRepo.save({
          email: `cs-update-db-test-${role}@example.com`,
          full_name: `${MARKER} ${role}`,
          status: CommonStatus.ACTIVE,
          is_active: true,
        }),
      ),
    );
    // School-less class, so access depends only on ownership / co-instruction.
    const ownedClass = await dataSource.getRepository(Class).save({
      class_name: `${MARKER}-Class`,
      educator_id: owner.id,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      status: CommonStatus.ACTIVE,
      is_active: true,
    });
    // Class.id is declared optional on the entity; save() always returns the generated uuid.
    classId = ownedClass.id as string;
    await dataSource
      .getRepository(ClassEducator)
      .save({ classId, educatorId: coInstructor.id, isPrimary: false });

    const asEducator = (educatorId: string): ICurrentUser => ({
      userId: `user-${educatorId}`,
      educatorId,
      roles: [RoleSlug.EDUCATOR],
    });
    ownerUser = asEducator(owner.id);
    coInstructorUser = asEducator(coInstructor.id);
    outsiderUser = asEducator(outsider.id);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(`DELETE FROM class_simulations WHERE simulation_id LIKE $1`, [
      `${MARKER}-%`,
    ]);
    await dataSource.query(
      `DELETE FROM class_educators WHERE class_id IN (SELECT id FROM classes WHERE class_name LIKE $1)`,
      [`${MARKER}-%`],
    );
    await dataSource.query(`DELETE FROM classes WHERE class_name LIKE $1`, [`${MARKER}-%`]);
    await dataSource.query(`DELETE FROM educators WHERE email LIKE 'cs-update-db-test-%'`);
  });

  it('DB: stores MM-DD-YYYY / ISO date-time input as YYYY-MM-DD', async () => {
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');

    await service.update(ownerUser, assignment.id, {
      startDate: '02-01-2026',
      endDate: '2026-02-28T10:30:00Z',
    });

    expect(await readRow(assignment.id)).toMatchObject({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
    });
  });

  it('DB: normalises a legacy MM-DD-YYYY date the request did not send', async () => {
    const assignment = await seedAssignment('01-05-2026', '01-31-2026');

    await service.update(ownerUser, assignment.id, { dueDate: '2026-01-20' });

    expect(await readRow(assignment.id)).toMatchObject({
      start_date: '2026-01-05',
      due_date: '2026-01-20',
      end_date: '2026-01-31',
    });
  });

  it('DB: rejects an overlapping update with 409 and leaves the row untouched', async () => {
    await seedAssignment('2026-03-01', '2026-03-31');
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');

    const attempt = service.update(ownerUser, assignment.id, { endDate: '03-05-2026' });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { message: ERROR_MSG.CLASS_SIMULATION.OVERLAPPING_ASSIGNMENT },
    });
    expect((await readRow(assignment.id))?.end_date).toBe('2026-01-31');
  });

  it('DB: allows a range that ends the day before a sibling starts', async () => {
    await seedAssignment('2026-03-01', '2026-03-31');
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');

    const result = await service.update(ownerUser, assignment.id, { endDate: '2026-02-28' });

    expect(result.data).toMatchObject({ endDate: '2026-02-28' });
    expect((await readRow(assignment.id))?.end_date).toBe('2026-02-28');
  });

  it('DB: lets a co-instructor update the dates', async () => {
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');

    await service.update(coInstructorUser, assignment.id, { endDate: '2026-02-15' });

    expect((await readRow(assignment.id))?.end_date).toBe('2026-02-15');
  });

  it('DB: answers 404 to an educator who neither owns nor co-instructs the class', async () => {
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');

    const attempt = service.update(outsiderUser, assignment.id, { endDate: '2026-02-15' });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toMatchObject({
      response: { message: ERROR_MSG.DB.NOT_FOUND('Class') },
    });
    expect((await readRow(assignment.id))?.end_date).toBe('2026-01-31');
  });

  it('DB: does not re-activate an assignment removed between the read and the write', async () => {
    const assignment = await seedAssignment('2026-01-01', '2026-01-31');
    const realFindOne = csRepo.findOne.bind(csRepo);
    // Let update() read the active row, then deactivate it the way remove() does, before the
    // write runs.
    jest
      .spyOn(csRepo, 'findOne')
      .mockImplementationOnce(async (options: FindOneOptions<ClassSimulation>) => {
        const row = await realFindOne(options);
        await csRepo.deactivateIfActive(assignment.id);
        return row;
      });

    const attempt = service.update(ownerUser, assignment.id, { endDate: '2026-02-15' });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    const stored = await readRow(assignment.id);
    expect(stored?.is_active).toBe(false);
    expect(stored?.deleted_at).not.toBeNull();
    expect(stored?.end_date).toBe('2026-01-31');
  });
});
