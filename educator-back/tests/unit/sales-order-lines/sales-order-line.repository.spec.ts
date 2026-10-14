import { SalesOrderLineRepository } from '../../../src/database/repositories/sales-order-line.repository';

describe('SalesOrderLineRepository', () => {
  const findOne = jest.fn();
  const find = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const update = jest.fn();
  const upsert = jest.fn();
  const getMany = jest.fn();
  const where = jest.fn();
  const createQueryBuilder = jest.fn();

  const repo = {
    findOne,
    find,
    create,
    save,
    update,
    upsert,
    createQueryBuilder,
  };

  const repository = new SalesOrderLineRepository(repo as never);

  beforeEach(() => {
    findOne.mockReset();
    find.mockReset();
    create.mockReset();
    save.mockReset();
    update.mockReset();
    upsert.mockReset();
    getMany.mockReset();
    where.mockReset().mockReturnValue({ getMany });
    createQueryBuilder.mockReset().mockReturnValue({ where });
  });

  describe('create', () => {
    it('creates and saves a new sales order line', async () => {
      const data = { so: 'SO-001', line: 1, redeemCode: 'ABCD1234' };
      const entity = { ...data };
      create.mockReturnValue(entity);
      save.mockResolvedValue(entity);

      await expect(repository.create(data)).resolves.toBe(entity);
      expect(create).toHaveBeenCalledWith(data);
      expect(save).toHaveBeenCalledWith(entity);
    });
  });

  describe('findById', () => {
    it('looks up by the surrogate salesOrderLineId', async () => {
      const line = { salesOrderLineId: 'uuid-1', so: 'SO-001' };
      findOne.mockResolvedValue(line);

      await expect(repository.findById('uuid-1')).resolves.toBe(line);
      expect(findOne).toHaveBeenCalledWith({ where: { salesOrderLineId: 'uuid-1' } });
    });
  });

  describe('updateById', () => {
    it('updates by salesOrderLineId and returns the refreshed row', async () => {
      const updated = { salesOrderLineId: 'uuid-1', qty: 20 };
      update.mockResolvedValue(undefined);
      findOne.mockResolvedValue(updated);

      await expect(repository.updateById('uuid-1', { qty: 20 })).resolves.toBe(updated);
      expect(update).toHaveBeenCalledWith({ salesOrderLineId: 'uuid-1' }, { qty: 20 });
      expect(findOne).toHaveBeenCalledWith({ where: { salesOrderLineId: 'uuid-1' } });
    });
  });

  describe('findByRedeemCode', () => {
    it('matches case-insensitively and trims the input code', async () => {
      const lines = [{ so: 'SO-001', redeemCode: 'ABCD1234EFGH5678' }];
      getMany.mockResolvedValue(lines);

      await expect(repository.findByRedeemCode('  abcd1234efgh5678  ')).resolves.toBe(lines);
      expect(createQueryBuilder).toHaveBeenCalledWith('salesOrderLine');
      expect(where).toHaveBeenCalledWith('UPPER(TRIM(salesOrderLine.redeem_code)) = :cleanCode', {
        cleanCode: 'ABCD1234EFGH5678',
      });
    });

    it('returns an empty array when nothing matches', async () => {
      getMany.mockResolvedValue([]);

      await expect(repository.findByRedeemCode('UNKNOWN')).resolves.toEqual([]);
    });
  });

  describe('upsertBySalesOrderAndLine', () => {
    it('upserts on the (so, line) natural key, scoped to active rows', async () => {
      const rows = [{ so: 'SO-001', line: 1 }];
      upsert.mockResolvedValue(undefined);

      await repository.upsertBySalesOrderAndLine(rows);

      expect(upsert).toHaveBeenCalledWith(rows, {
        conflictPaths: ['so', 'line'],
        indexPredicate: 'deleted_at IS NULL',
      });
    });

    it('is a no-op for an empty array', async () => {
      await repository.upsertBySalesOrderAndLine([]);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
