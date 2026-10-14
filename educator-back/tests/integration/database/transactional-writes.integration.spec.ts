import { BadRequestException, ConflictException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import {
  Class,
  ClassSimulation,
  ClassTransferAudit,
  Educator,
  EducatorSimulation,
  Invite,
  InviteStatus,
  Student,
  User,
  SimulationV2,
  UserRole,
  VoiceProfile,
} from '../../../src/database/entities';
import { InviteRepository } from '../../../src/database/repositories/invite.repository';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { VoiceProfileRepository } from '../../../src/database/repositories/voice-profile.repository';
import { SimulationV2Repository } from '../../../src/database/repositories/simulation-v2.repository';
import { ClassSimulationRepository } from '../../../src/database/repositories/class-simulation.repository';
import { VoiceProfileStatus } from '../../../src/common/constants';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { AUTH_MSG } from '../../../src/common/messages/auth.message';
import type {
  AcceptInviteInput,
  IBulkAssignClassSimulationsInput,
  TransferClassInput,
} from '../../../src/common/interfaces';

type Row = Record<string, unknown>;
type EntityClass = abstract new (...args: never[]) => unknown;
type Tables = Map<EntityClass, Row[]>;
type WriteOp = 'update' | 'save';
type FailHook = (entity: EntityClass, op: WriteOp, patch: Row) => boolean;

const clone = (tables: Tables): Tables =>
  new Map([...tables].map(([entity, rows]) => [entity, rows.map((row) => ({ ...row }))]));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, expected]) => {
    if (expected instanceof FindOperator) {
      if (expected.type === 'isNull') return row[key] === null || row[key] === undefined;
      if (expected.type === 'in') return (expected.value as unknown[]).includes(row[key]);
      throw new Error(`Unsupported operator ${expected.type}`);
    }
    return row[key] === expected;
  });

/**
 * In-memory stand-in for Postgres behind `repo.manager.transaction(...)`. Each transaction works
 * on a copy of the tables and only replaces them when the callback resolves, so a thrown write
 * discards every earlier write. Transactions are serialised, the way the row lock taken by a
 * guarded `UPDATE` serialises two accepts of the same invite.
 */
class FakeDatabase {
  tables: Tables = new Map();
  writes: { entity: EntityClass; op: WriteOp; patch: Row }[] = [];
  failOn: FailHook = () => false;
  transactionCount = 0;
  private lock: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  /** Primary-key column per entity for generated ids; `id` unless listed. */
  primaryKeys = new Map<EntityClass, string>([[VoiceProfile, 'voiceProfileId']]);

  seed(entity: EntityClass, rows: Row[]): void {
    this.tables.set(entity, [...(this.tables.get(entity) ?? []), ...rows]);
  }

  rows(entity: EntityClass): Row[] {
    return this.tables.get(entity) ?? [];
  }

  /** Non-transactional repository surface used by the code under test. */
  create = (data: Row): Row => ({ ...data });
  findOne = (): Promise<null> => Promise.resolve(null);

  readonly manager = {
    transaction: <T>(work: (manager: unknown) => Promise<T>): Promise<T> => {
      this.transactionCount += 1;
      const run = this.lock.then(async () => {
        const staged = clone(this.tables);
        const result = await work(this.transactionalManager(staged));
        this.tables = staged;
        return result;
      });
      this.lock = run.catch(() => undefined);
      return run;
    },
  };

  private transactionalManager(staged: Tables): Record<string, unknown> {
    const table = (entity: EntityClass): Row[] => {
      if (!staged.has(entity)) staged.set(entity, []);
      return staged.get(entity) as Row[];
    };
    const write = (entity: EntityClass, op: WriteOp, patch: Row): void => {
      this.writes.push({ entity, op, patch });
      if (this.failOn(entity, op, patch)) throw new Error(`forced ${op} failure`);
    };
    const update = (entity: EntityClass, where: Row, patch: Row): { affected: number } => {
      write(entity, 'update', patch);
      const hits = table(entity).filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, patch));
      return { affected: hits.length };
    };
    const save = (entity: EntityClass, data: Row): Row => {
      write(entity, 'save', data);
      const row = { [this.primaryKeys.get(entity) ?? 'id']: `gen-${this.nextId++}`, ...data };
      table(entity).push(row);
      return { ...row };
    };
    const find = (entity: EntityClass, options: { where: Row; take?: number }): Row[] =>
      table(entity)
        .filter((row) => matches(row, options.where))
        .slice(0, options.take)
        .map((row) => ({ ...row }));

    return {
      update: (entity: EntityClass, where: Row, patch: Row) =>
        Promise.resolve(update(entity, where, patch)),
      save: (entity: EntityClass, data: Row | Row[]) =>
        Promise.resolve(
          Array.isArray(data) ? data.map((row) => save(entity, row)) : save(entity, data),
        ),
      findOne: (entity: EntityClass, options: { where: Row }) =>
        Promise.resolve(find(entity, options)[0] ?? null),
      create: (_entity: EntityClass, data: Row) => ({ ...data }),
      merge: (_entity: EntityClass, target: Row, ...sources: Row[]) =>
        Object.assign(target, ...sources),
      count: (entity: EntityClass, options: { where: Row }) =>
        Promise.resolve(table(entity).filter((row) => matches(row, options.where)).length),
      delete: (entity: EntityClass, where: Row) => {
        const before = table(entity).length;
        staged.set(
          entity,
          table(entity).filter((row) => !matches(row, where)),
        );
        return Promise.resolve({ affected: before - table(entity).length });
      },
      find: (entity: EntityClass, options: { where: Row; take?: number }) =>
        Promise.resolve(find(entity, options)),
      getRepository: (entity: EntityClass) => ({
        create: (data: Row) => ({ ...data }),
        save: (data: Row) => Promise.resolve(save(entity, data)),
        update: (where: Row, patch: Row) => Promise.resolve(update(entity, where, patch)),
        findOne: jest.fn((options: { where: Row; relations?: string[] }) =>
          Promise.resolve(find(entity, options)[0] ?? null),
        ),
      }),
    };
  }
}

describe('Transactional multi-step writes (mocked database)', () => {
  let db: FakeDatabase;
  let inviteRepo: InviteRepository;
  let classRepo: ClassRepository;
  let classSimulationRepo: ClassSimulationRepository;
  let voiceProfileRepo: VoiceProfileRepository;
  let simulationRepo: SimulationV2Repository;

  beforeEach(() => {
    db = new FakeDatabase();
    db.primaryKeys.set(SimulationV2, 'simulationId');
    simulationRepo = new SimulationV2Repository(db as unknown as Repository<SimulationV2>);
    classSimulationRepo = new ClassSimulationRepository(
      db as unknown as Repository<ClassSimulation>,
    );
    inviteRepo = new InviteRepository(db as unknown as Repository<Invite>);
    classRepo = new ClassRepository(db as unknown as Repository<Class>);
    voiceProfileRepo = new VoiceProfileRepository(db as unknown as Repository<VoiceProfile>);
  });

  describe('VoiceProfileRepository.createWithAudio', () => {
    const data = { displayName: 'Stock Female 1', blobPath: '', durationMs: 9800 };

    it('inserts the row, uploads with its id, then records the blob path, in one transaction', async () => {
      const upload = jest.fn((id: string) => Promise.resolve(`voices/${id}/voice.wav`));

      const saved = await voiceProfileRepo.createWithAudio(data, upload);

      expect(upload).toHaveBeenCalledWith('gen-1');
      expect(saved.voiceProfileId).toBe('gen-1');
      expect(saved.blobPath).toBe('voices/gen-1/voice.wav');
      expect(db.transactionCount).toBe(1);
      expect(db.rows(VoiceProfile)).toEqual([
        expect.objectContaining({
          voiceProfileId: 'gen-1',
          displayName: 'Stock Female 1',
          blobPath: 'voices/gen-1/voice.wav',
        }),
      ]);
      expect(db.writes.map((w) => w.op)).toEqual(['save', 'update']);
    });

    it('rolls the insert back when the upload throws, leaving no profile row', async () => {
      const upload = jest.fn().mockRejectedValue(new Error('blob unavailable'));

      await expect(voiceProfileRepo.createWithAudio(data, upload)).rejects.toThrow(
        'blob unavailable',
      );

      expect(db.rows(VoiceProfile)).toEqual([]);
      expect(db.writes.map((w) => w.op)).toEqual(['save']);
    });

    it('rolls back when recording the blob path fails after a successful upload', async () => {
      db.failOn = (entity, op) => entity === VoiceProfile && op === 'update';
      const upload = jest.fn((id: string) => Promise.resolve(`voices/${id}/voice.wav`));

      await expect(voiceProfileRepo.createWithAudio(data, upload)).rejects.toThrow(
        'forced update failure',
      );

      expect(db.rows(VoiceProfile)).toEqual([]);
    });
  });

  describe('VoiceProfileRepository.retireIfUnused', () => {
    const VP = 'vp-1';
    const seedProfile = (overrides: Row = {}): void =>
      db.seed(VoiceProfile, [
        {
          voiceProfileId: VP,
          status: VoiceProfileStatus.ACTIVE,
          defaultForGender: null,
          ...overrides,
        },
      ]);
    const status = (): unknown => db.rows(VoiceProfile)[0].status;
    const httpStatus = async (promise: Promise<unknown>): Promise<number | string> =>
      promise.then(
        () => 'ok',
        (error: { getStatus?: () => number }) => error.getStatus?.() ?? 'other',
      );

    it('retires an unused profile and stamps retiredAt, in one transaction', async () => {
      seedProfile();

      await voiceProfileRepo.retireIfUnused(VP, 5);

      expect(status()).toBe(VoiceProfileStatus.RETIRED);
      expect(db.rows(VoiceProfile)[0].retiredAt).toBeInstanceOf(Date);
      expect(db.transactionCount).toBe(1);
    });

    it('409s while scenarios (drafts included) use it, naming up to the limit of ids, and stays active', async () => {
      seedProfile();
      db.seed(
        SimulationV2,
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({
          simulationId: `s-${id}`,
          id,
          voiceProfileId: VP,
        })),
      );

      const error = await voiceProfileRepo.retireIfUnused(VP, 5).catch((e: unknown) => e);

      expect((error as { getStatus: () => number }).getStatus()).toBe(409);
      const message = JSON.stringify((error as { getResponse: () => unknown }).getResponse());
      expect(message).toContain('7');
      expect(message).toContain('a, b, c, d, e');
      expect(message).not.toContain('f, g');
      expect(status()).toBe(VoiceProfileStatus.ACTIVE);
    });

    it('409s for a gender default, 404s for an unknown id, and is a no-op when already retired', async () => {
      seedProfile({ defaultForGender: 'female' });
      expect(await httpStatus(voiceProfileRepo.retireIfUnused(VP, 5))).toBe(409);
      expect(status()).toBe(VoiceProfileStatus.ACTIVE);

      expect(await httpStatus(voiceProfileRepo.retireIfUnused('missing', 5))).toBe(404);

      db.tables.set(VoiceProfile, [
        { voiceProfileId: VP, status: VoiceProfileStatus.RETIRED, retiredAt: null },
      ]);
      await voiceProfileRepo.retireIfUnused(VP, 5);
      expect(db.rows(VoiceProfile)[0].retiredAt).toBeNull();
    });

    describe('racing a scenario write that assigns the same voice', () => {
      const assign = (): Promise<unknown> =>
        simulationRepo.create({ id: 'sc-1', voiceProfileId: VP } as never, {
          lockVoiceProfileId: VP,
        });

      it('scenario write wins: the retire counts it and is refused (no orphaned scenario)', async () => {
        seedProfile();

        const [created, retired] = await Promise.allSettled([
          assign(),
          voiceProfileRepo.retireIfUnused(VP, 5),
        ]);

        expect(created.status).toBe('fulfilled');
        expect(retired.status).toBe('rejected');
        expect(status()).toBe(VoiceProfileStatus.ACTIVE);
        expect(db.rows(SimulationV2)).toHaveLength(1);
      });

      it('retire wins: the scenario write is refused with 400 and saves nothing', async () => {
        seedProfile();

        const [retired, created] = await Promise.allSettled([
          voiceProfileRepo.retireIfUnused(VP, 5),
          assign(),
        ]);

        expect(retired.status).toBe('fulfilled');
        expect(created.status).toBe('rejected');
        expect((created as PromiseRejectedResult).reason.getStatus()).toBe(400);
        expect(status()).toBe(VoiceProfileStatus.RETIRED);
        expect(db.rows(SimulationV2)).toHaveLength(0);
      });
    });
  });

  describe('SimulationV2Repository lockVoiceProfileId', () => {
    const VP = 'vp-1';

    it('create: refuses (400) a retired or missing voice before writing the scenario', async () => {
      db.seed(VoiceProfile, [{ voiceProfileId: VP, status: VoiceProfileStatus.RETIRED }]);

      await expect(
        simulationRepo.create({ id: 'sc-1' } as never, { lockVoiceProfileId: VP }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        simulationRepo.create({ id: 'sc-1' } as never, { lockVoiceProfileId: 'missing' }),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.rows(SimulationV2)).toHaveLength(0);
    });

    it('create: saves with an active voice, and with no voice to lock', async () => {
      db.seed(VoiceProfile, [{ voiceProfileId: VP, status: VoiceProfileStatus.ACTIVE }]);

      await simulationRepo.create({ id: 'sc-1' } as never, { lockVoiceProfileId: VP });
      await simulationRepo.create({ id: 'sc-2' } as never, { lockVoiceProfileId: null });
      await simulationRepo.create({ id: 'sc-3' } as never);

      expect(db.rows(SimulationV2)).toHaveLength(3);
    });

    it('updateById: refuses (400) a retired voice and writes no scenario update', async () => {
      db.seed(VoiceProfile, [{ voiceProfileId: VP, status: VoiceProfileStatus.RETIRED }]);
      db.seed(SimulationV2, [{ simulationId: 's-1', id: 'sc-1', voiceProfileId: null }]);

      await expect(
        simulationRepo.updateById('s-1', { voiceProfileId: VP } as never, {
          lockVoiceProfileId: VP,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.rows(SimulationV2)[0].voiceProfileId).toBeNull();
      expect(db.writes.filter((w) => w.entity === SimulationV2)).toEqual([]);
    });

    it('updateById: writes with an active voice', async () => {
      db.seed(VoiceProfile, [{ voiceProfileId: VP, status: VoiceProfileStatus.ACTIVE }]);
      db.seed(SimulationV2, [{ simulationId: 's-1', id: 'sc-1', voiceProfileId: null }]);

      await simulationRepo.updateById('s-1', { voiceProfileId: VP } as never, {
        lockVoiceProfileId: VP,
      });

      expect(db.rows(SimulationV2)[0].voiceProfileId).toBe(VP);
    });
  });

  describe('VoiceProfileRepository.updateLocked', () => {
    it('builds the change from the locked row and saves it', async () => {
      db.seed(VoiceProfile, [
        { voiceProfileId: 'vp-1', status: VoiceProfileStatus.ACTIVE, displayName: 'Old' },
      ]);
      const build = jest.fn((locked: VoiceProfile) => ({ displayName: `${locked.displayName}!` }));

      const saved = await voiceProfileRepo.updateLocked('vp-1', build);

      expect(saved.displayName).toBe('Old!');
      expect(db.transactionCount).toBe(1);
    });

    it('sees a retire that committed first and refuses to apply the change', async () => {
      db.seed(VoiceProfile, [
        { voiceProfileId: 'vp-1', status: VoiceProfileStatus.ACTIVE, defaultForGender: null },
      ]);

      const [retired, updated] = await Promise.allSettled([
        voiceProfileRepo.retireIfUnused('vp-1', 5),
        voiceProfileRepo.updateLocked('vp-1', (locked) => {
          if (locked.status === VoiceProfileStatus.RETIRED) throw new Error('retired');
          return { defaultForGender: 'female' } as never;
        }),
      ]);

      expect(retired.status).toBe('fulfilled');
      expect(updated.status).toBe('rejected');
      expect(db.rows(VoiceProfile)[0].defaultForGender).toBeNull();
    });
  });

  describe('InviteRepository.acceptInvite', () => {
    const input: AcceptInviteInput = {
      inviteId: 'invite-1',
      userId: 'user-1',
      roleId: 'role-educator',
      userRoleId: 'ur-1',
      hashedPassword: 'hash',
    };

    beforeEach(() => {
      db.seed(Invite, [
        { id: 'invite-1', status: InviteStatus.PENDING, is_active: true, deleted_at: null },
      ]);
      db.seed(User, [{ id: 'user-1', password: null }]);
      db.seed(UserRole, [
        {
          userRoleId: 'ur-1',
          userId: 'user-1',
          roleId: 'role-educator',
          status: CommonStatus.PENDING,
        },
      ]);
      db.seed(Educator, [
        { id: 'edu-1', userRoleId: 'ur-1', is_active: false, districtAdminId: 'da-1' },
      ]);
    });

    const snapshot = (): Row => ({
      invite: db.rows(Invite)[0].status,
      password: db.rows(User)[0].password,
      userRole: db.rows(UserRole)[0].status,
      educator: db.rows(Educator)[0].is_active,
    });

    it('activates user role, educator and marks the invite accepted in one transaction', async () => {
      const result = await inviteRepo.acceptInvite(input);

      expect(result?.id).toBe('edu-1');
      expect(result?.is_active).toBe(true);
      expect(db.transactionCount).toBe(1);
      expect(snapshot()).toEqual({
        invite: InviteStatus.ACCEPTED,
        password: 'hash',
        userRole: CommonStatus.ACTIVE,
        educator: true,
      });
      expect(db.rows(Invite)[0].is_active).toBe(false);
      expect(db.rows(Invite)[0].deleted_at).toBeInstanceOf(Date);
    });

    it('flips the invite first, then user, user_role and educator', async () => {
      await inviteRepo.acceptInvite(input);

      expect(db.writes.map((w) => w.entity)).toEqual([Invite, User, UserRole, Educator]);
    });

    it('throws 409 INVITE_ALREADY_USED on a sequential second accept and writes nothing else', async () => {
      await inviteRepo.acceptInvite(input);
      db.writes = [];

      await expect(inviteRepo.acceptInvite({ ...input, hashedPassword: 'second' })).rejects.toThrow(
        new ConflictException(AUTH_MSG.INVITE_ALREADY_USED),
      );

      expect(db.writes.map((w) => w.entity)).toEqual([Invite]);
      expect(db.rows(User)[0].password).toBe('hash');
    });

    it('lets exactly one of two concurrent accepts win', async () => {
      const results = await Promise.allSettled([
        inviteRepo.acceptInvite({ ...input, hashedPassword: 'a' }),
        inviteRepo.acceptInvite({ ...input, hashedPassword: 'b' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect(db.rows(User)[0].password).toBe('a');
    });

    it('persists nothing when the last write (educator) fails', async () => {
      db.failOn = (entity) => entity === Educator;

      await expect(inviteRepo.acceptInvite(input)).rejects.toThrow('forced update failure');

      expect(db.writes.map((w) => w.entity)).toEqual([Invite, User, UserRole, Educator]);
      expect(snapshot()).toEqual({
        invite: InviteStatus.PENDING,
        password: null,
        userRole: CommonStatus.PENDING,
        educator: false,
      });
    });

    it('stops at a failing middle write (user) and rolls back the invite flip', async () => {
      db.failOn = (entity) => entity === User;

      await expect(inviteRepo.acceptInvite(input)).rejects.toThrow('forced update failure');

      expect(db.writes.map((w) => w.entity)).toEqual([Invite, User]);
      expect(snapshot()).toEqual({
        invite: InviteStatus.PENDING,
        password: null,
        userRole: CommonStatus.PENDING,
        educator: false,
      });
    });

    it('returns null and skips the educator write when no educator is linked', async () => {
      db.tables.set(Educator, []);

      await expect(inviteRepo.acceptInvite(input)).resolves.toBeNull();

      expect(db.writes.map((w) => w.entity)).toEqual([Invite, User, UserRole]);
      expect(db.rows(Invite)[0].status).toBe(InviteStatus.ACCEPTED);
    });
  });

  describe('ClassRepository.transferToEducator', () => {
    const input: TransferClassInput = {
      classId: 'class-1',
      className: 'Biology',
      sourceEducatorId: 'edu-src',
      sourceEducatorName: 'Source',
      targetEducatorId: 'edu-tgt',
      targetEducatorName: 'Target',
      adminId: 'admin-1',
      adminEmail: null,
    };

    beforeEach(() => {
      db.seed(Class, [{ id: 'class-1', educator_id: 'edu-src' }]);
      db.seed(Student, [
        { student_id: 's1', class_id: 'class-1', educator_id: 'edu-src' },
        { student_id: 's2', class_id: 'class-1', educator_id: 'edu-src' },
      ]);
      db.seed(ClassSimulation, [
        { class_id: 'class-1', simulation_id: 'sim-new', is_active: true },
        { class_id: 'class-1', simulation_id: 'sim-restore', is_active: true },
        { class_id: 'class-1', simulation_id: 'sim-inactive', is_active: false },
      ]);
      db.seed(EducatorSimulation, [
        {
          id: 'es-src',
          educator_id: 'edu-src',
          unit_id: 'unit-9',
          scenario_id: 'sim-new',
          deleted_at: null,
        },
        {
          id: 'es-tgt',
          educator_id: 'edu-tgt',
          unit_id: 'unit-1',
          scenario_id: 'sim-restore',
          deleted_at: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
    });

    const ownership = (): Row => ({
      class: db.rows(Class)[0].educator_id,
      students: db.rows(Student).map((s) => s.educator_id),
      audits: db.rows(ClassTransferAudit).length,
      library: db
        .rows(EducatorSimulation)
        .filter((e) => e.educator_id === 'edu-tgt' && e.deleted_at === null)
        .map((e) => e.scenario_id)
        .sort(),
    });

    it('moves class, students, audit and library entries together', async () => {
      const audit = await classRepo.transferToEducator(input);

      expect(audit.id).toBeDefined();
      expect(db.transactionCount).toBe(1);
      expect(ownership()).toEqual({
        class: 'edu-tgt',
        students: ['edu-tgt', 'edu-tgt'],
        audits: 1,
        library: ['sim-new', 'sim-restore'],
      });
      expect(db.rows(ClassTransferAudit)[0]).toMatchObject({
        classId: 'class-1',
        sourceEducatorId: 'edu-src',
        targetEducatorId: 'edu-tgt',
        adminId: 'admin-1',
      });
    });

    it('copies the unit id from the source library entry and restores soft-deleted ones', async () => {
      await classRepo.transferToEducator(input);

      const target = db.rows(EducatorSimulation).filter((e) => e.educator_id === 'edu-tgt');
      expect(target.find((e) => e.scenario_id === 'sim-new')?.unit_id).toBe('unit-9');
      expect(target.find((e) => e.scenario_id === 'sim-restore')?.id).toBe('es-tgt');
      expect(target.some((e) => e.scenario_id === 'sim-inactive')).toBe(false);
    });

    it('makes no library writes when the class has no active simulations', async () => {
      db.tables.set(ClassSimulation, []);

      await classRepo.transferToEducator(input);

      expect(db.writes.some((w) => w.entity === EducatorSimulation)).toBe(false);
      expect(ownership()).toMatchObject({ class: 'edu-tgt', audits: 1 });
    });

    it('rolls back everything, including the audit row, when the library sync fails', async () => {
      db.failOn = (entity, op) => entity === EducatorSimulation && op === 'save';

      await expect(classRepo.transferToEducator(input)).rejects.toThrow('forced save failure');

      expect(ownership()).toEqual({
        class: 'edu-src',
        students: ['edu-src', 'edu-src'],
        audits: 0,
        library: [],
      });
    });

    it('rolls back when restoring a soft-deleted library entry fails', async () => {
      db.failOn = (entity, op) => entity === EducatorSimulation && op === 'update';

      await expect(classRepo.transferToEducator(input)).rejects.toThrow('forced update failure');

      expect(ownership()).toMatchObject({ class: 'edu-src', audits: 0, library: [] });
    });
  });

  describe('ClassSimulationRepository.createManyAndChargeSeats', () => {
    const row = (classId: string, isAi: boolean) => ({
      classId,
      simulationId: 'sim-1',
      startDate: '2030-09-01',
      dueDate: '2030-10-16',
      endDate: '2030-12-15',
      isAi,
    });
    const input = (seatsToCharge: number): IBulkAssignClassSimulationsInput => ({
      educatorId: 'edu-1',
      seatsToCharge,
      rows: [row('class-1', true), row('class-2', true), row('class-3', false)],
    });
    const state = () => ({
      assignments: db.rows(ClassSimulation).length,
      tokens: db.rows(Educator)[0].tokens,
      allocated: db.rows(Educator)[0].allocated_tokens,
    });

    beforeEach(() => {
      db.seed(Educator, [{ id: 'edu-1', is_active: true, tokens: 20, allocated_tokens: 4 }]);
    });

    it('inserts every row and moves the seats together', async () => {
      const result = await classSimulationRepo.createManyAndChargeSeats(input(12));

      expect(db.transactionCount).toBe(1);
      expect(state()).toEqual({ assignments: 3, tokens: 8, allocated: 16 });
      expect(result).toMatchObject({ previousTokens: 20, newTokens: 8 });
      expect(result.saved.map((saved) => saved.class_id)).toEqual([
        'class-1',
        'class-2',
        'class-3',
      ]);
    });

    it('persists no assignment when the seat update fails', async () => {
      db.failOn = (entity, op) => entity === Educator && op === 'update';

      await expect(classSimulationRepo.createManyAndChargeSeats(input(12))).rejects.toThrow(
        'forced update failure',
      );
      expect(state()).toEqual({ assignments: 0, tokens: 20, allocated: 4 });
    });

    it('rolls back earlier inserts when a later insert fails', async () => {
      db.failOn = (entity, op, patch) =>
        entity === ClassSimulation && op === 'save' && patch.class_id === 'class-3';

      await expect(classSimulationRepo.createManyAndChargeSeats(input(12))).rejects.toThrow(
        'forced save failure',
      );
      expect(state()).toEqual({ assignments: 0, tokens: 20, allocated: 4 });
    });

    it('refuses a short balance and writes nothing', async () => {
      await expect(classSimulationRepo.createManyAndChargeSeats(input(21))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(state()).toEqual({ assignments: 0, tokens: 20, allocated: 4 });
    });

    it('lets only one of two concurrent charges spend the same seats', async () => {
      // Different classes, so this is purely a seat race: 12 + 12 > 20.
      const other: IBulkAssignClassSimulationsInput = {
        ...input(12),
        rows: [row('class-4', true), row('class-5', true)],
      };
      const results = await Promise.allSettled([
        classSimulationRepo.createManyAndChargeSeats(input(12)),
        classSimulationRepo.createManyAndChargeSeats(other),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(state().tokens).toBe(8);
    });

    describe('identical request sent twice (double-click / retry)', () => {
      // The reported bug: 12 seats, one AI assignment costing 3, sent twice at once → both 201,
      // two rows, 12 → 9 → 6. Expected: one row, 3 seats charged, the other request refused.
      const single = (): IBulkAssignClassSimulationsInput => ({
        educatorId: 'edu-1',
        seatsToCharge: 3,
        rows: [row('class-1', true)],
      });

      beforeEach(() => {
        db.tables.set(Educator, [
          { id: 'edu-1', is_active: true, tokens: 12, allocated_tokens: 0 },
        ]);
      });

      it('saves and charges once when both arrive at the same moment', async () => {
        const [first, second] = await Promise.all([
          classSimulationRepo.createManyAndChargeSeats(single()),
          classSimulationRepo.createManyAndChargeSeats(single()),
        ]);

        expect(first.saved).toHaveLength(1);
        expect(first.conflicts).toEqual([]);
        expect(second.saved).toEqual([]);
        expect(second.conflicts).toHaveLength(1);
        expect(state()).toEqual({ assignments: 1, tokens: 9, allocated: 3 });
      });

      it('refuses a retry sent after the first one committed', async () => {
        await classSimulationRepo.createManyAndChargeSeats(single());
        const retry = await classSimulationRepo.createManyAndChargeSeats(single());

        expect(retry.conflicts).toHaveLength(1);
        expect(state()).toEqual({ assignments: 1, tokens: 9, allocated: 3 });
      });

      it('refuses the duplicate even when its class id is uppercase (review F1)', async () => {
        const [first, second] = await Promise.all([
          classSimulationRepo.createManyAndChargeSeats(single()),
          classSimulationRepo.createManyAndChargeSeats({
            ...single(),
            rows: [{ ...row('class-1', true), classId: 'CLASS-1' }],
          }),
        ]);

        expect(first.saved).toHaveLength(1);
        expect(second.saved).toEqual([]);
        expect(second.conflicts).toHaveLength(1);
        expect(state()).toEqual({ assignments: 1, tokens: 9, allocated: 3 });
      });

      it('still allows the same simulation for a non-overlapping window', async () => {
        await classSimulationRepo.createManyAndChargeSeats(single());
        const later = await classSimulationRepo.createManyAndChargeSeats({
          ...single(),
          rows: [
            {
              ...row('class-1', true),
              startDate: '2031-01-01',
              dueDate: '2031-02-01',
              endDate: '2031-03-01',
            },
          ],
        });

        expect(later.saved).toHaveLength(1);
        expect(state()).toEqual({ assignments: 2, tokens: 6, allocated: 6 });
      });
    });
  });
});
