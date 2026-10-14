import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { SalesOrderLine } from 'src/database/entities';

@Injectable()
export class SalesOrderLineRepository {
  constructor(
    @InjectRepository(SalesOrderLine)
    private readonly repo: Repository<SalesOrderLine>,
  ) {}

  async create(data: DeepPartial<SalesOrderLine>): Promise<SalesOrderLine> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(data: DeepPartial<SalesOrderLine>): Promise<SalesOrderLine> {
    return this.repo.save(data);
  }

  async find(options: FindManyOptions<SalesOrderLine> = {}): Promise<SalesOrderLine[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SalesOrderLine>): Promise<SalesOrderLine | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(
    options: FindManyOptions<SalesOrderLine> = {},
  ): Promise<[SalesOrderLine[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<SalesOrderLine> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<SalesOrderLine>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(salesOrderLineId: string): Promise<SalesOrderLine | null> {
    return this.repo.findOne({ where: { salesOrderLineId } });
  }

  async updateById(
    salesOrderLineId: string,
    data: DeepPartial<SalesOrderLine>,
  ): Promise<SalesOrderLine | null> {
    await this.repo.update({ salesOrderLineId }, data);
    return this.findById(salesOrderLineId);
  }

  async update(
    where: FindOptionsWhere<SalesOrderLine>,
    data: DeepPartial<SalesOrderLine>,
  ): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(salesOrderLineId: string): Promise<void> {
    await this.repo.delete({ salesOrderLineId });
  }

  /**
   * Lookup by `redeemCode`, matching today's blob-filter semantics in
   * the former blob-based getSalesOrderByRedeemCode — case-insensitive and
   * trimmed, since redeem codes stored in the catalog are not guaranteed to
   * be upper-cased/trimmed consistently.
   */
  async findByRedeemCode(redeemCode: string): Promise<SalesOrderLine[]> {
    const cleanCode = (redeemCode || '').trim().toUpperCase();
    return this.repo
      .createQueryBuilder('salesOrderLine')
      .where('UPPER(TRIM(salesOrderLine.redeem_code)) = :cleanCode', { cleanCode })
      .getMany();
  }

  /**
   * Upsert by the natural key (so, line) — used by the sales-order-lines.json
   * import so re-running it is idempotent.
   */
  async upsertBySalesOrderAndLine(rows: DeepPartial<SalesOrderLine>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.repo.upsert(rows, {
      conflictPaths: ['so', 'line'],
      indexPredicate: 'deleted_at IS NULL',
    });
  }
}
