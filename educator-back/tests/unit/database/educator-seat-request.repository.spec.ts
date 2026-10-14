import { NotFoundException } from '@nestjs/common';
import { EducatorSeatRequestRepository } from '../../../src/database/repositories/educator-seat-request.repository';
import { SeatRequestCooldownException } from '../../../src/common/exceptions/seat-request-cooldown.exception';
import { Educator, EducatorSeatRequest } from '../../../src/database/entities';

describe('EducatorSeatRequestRepository', () => {
  const getRawOne = jest.fn();
  const limit = jest.fn();
  const orderBy = jest.fn();
  const andWhere = jest.fn();
  const where = jest.fn();
  const select = jest.fn();
  const createQueryBuilder = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const findOneOrFail = jest.fn();
  const findEducator = jest.fn();
  const del = jest.fn();

  const seatRepo = { createQueryBuilder, create, save, findOneOrFail };
  const educatorRepo = { findOne: findEducator };
  const manager = {
    getRepository: jest.fn((entity: unknown) => (entity === Educator ? educatorRepo : seatRepo)),
  };
  const transaction = jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager));
  const ownRepo = { delete: del, manager: { transaction } };

  const repository = new EducatorSeatRequestRepository(ownRepo as never);

  const input = {
    educatorId: 'edu-1',
    districtAdminId: 'admin-1',
    requestedSeats: 5,
    note: 'Need more',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const qb = { select, where, andWhere, orderBy, limit, getRawOne };
    select.mockReturnValue(qb);
    where.mockReturnValue(qb);
    andWhere.mockReturnValue(qb);
    orderBy.mockReturnValue(qb);
    limit.mockReturnValue(qb);
    createQueryBuilder.mockReturnValue(qb);
    getRawOne.mockReset().mockResolvedValue(undefined);
    findEducator.mockReset().mockResolvedValue({ id: 'edu-1' });
  });

  describe('createWithinCooldown', () => {
    it('locks, checks the window and inserts inside one transaction', async () => {
      const reloaded = { seatRequestId: 'sr-1', requestedAt: new Date('2026-10-13T10:00:00.000Z') };
      create.mockReturnValue({ ...input });
      save.mockResolvedValue({ seatRequestId: 'sr-1' });
      findOneOrFail.mockResolvedValue(reloaded);

      const result = await repository.createWithinCooldown(input, 1440);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(findEducator).toHaveBeenCalledWith({
        where: { id: 'edu-1', is_active: true },
        lock: { mode: 'for_no_key_update' },
      });
      expect(manager.getRepository).toHaveBeenCalledWith(EducatorSeatRequest);
      expect(create).toHaveBeenCalledWith(input);
      expect(findOneOrFail).toHaveBeenCalledWith({ where: { seatRequestId: 'sr-1' } });
      expect(result).toBe(reloaded);
    });

    it('compares against now() in SQL in minutes with bound parameters, newest first', async () => {
      create.mockReturnValue({});
      save.mockResolvedValue({ seatRequestId: 'sr-1' });
      findOneOrFail.mockResolvedValue({});

      await repository.createWithinCooldown(input, 1440);

      expect(createQueryBuilder).toHaveBeenCalledWith('sr');
      expect(where).toHaveBeenCalledWith('sr.educator_id = :educatorId', { educatorId: 'edu-1' });
      const [windowSql, windowParams] = andWhere.mock.calls[0] as [string, unknown];
      expect(windowSql).toContain('now()');
      expect(windowSql).toContain("interval '1 minute'");
      expect(windowSql).toContain(':cooldownMinutes');
      expect(windowParams).toEqual({ cooldownMinutes: 1440 });
      expect(orderBy).toHaveBeenCalledWith('sr.requested_at', 'DESC');
      expect(limit).toHaveBeenCalledWith(1);
    });

    it('stores null for omitted requestedSeats and note', async () => {
      create.mockReturnValue({});
      save.mockResolvedValue({ seatRequestId: 'sr-2' });
      findOneOrFail.mockResolvedValue({});

      await repository.createWithinCooldown(
        { educatorId: 'edu-1', districtAdminId: 'admin-1' },
        1440,
      );

      expect(create).toHaveBeenCalledWith({
        educatorId: 'edu-1',
        districtAdminId: 'admin-1',
        requestedSeats: null,
        note: null,
      });
    });

    it('throws NotFoundException and inserts nothing when no active educator row is locked', async () => {
      findEducator.mockResolvedValue(null);

      await expect(repository.createWithinCooldown(input, 1440)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(createQueryBuilder).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('throws SeatRequestCooldownException with the stored requestedAt inside the window', async () => {
      getRawOne.mockResolvedValue({ requestedAt: '2026-10-13T10:00:00.000Z' });

      const error = await repository.createWithinCooldown(input, 1440).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SeatRequestCooldownException);
      expect((error as SeatRequestCooldownException).requestedAt).toEqual(
        new Date('2026-10-13T10:00:00.000Z'),
      );
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('hardDeleteById', () => {
    it('permanently deletes by id and returns the affected count', async () => {
      del.mockResolvedValue({ affected: 1 });

      await expect(repository.hardDeleteById('sr-1')).resolves.toBe(1);
      expect(del).toHaveBeenCalledWith({ seatRequestId: 'sr-1' });
    });

    it('returns 0 when the driver reports no affected count', async () => {
      del.mockResolvedValue({});

      await expect(repository.hardDeleteById('sr-1')).resolves.toBe(0);
    });
  });
});
