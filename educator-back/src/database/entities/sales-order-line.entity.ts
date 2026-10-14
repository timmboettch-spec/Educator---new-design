import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * A single line item from the redeem-code sales-order catalog, migrated from
 * the Azure Blob `sales-order-lines.json` (see
 * src/database/seeders/sales-order-lines.seeder.ts). Each row corresponds to
 * one line of a NetSuite sales order and is looked up by `redeemCode` during
 * license redemption (src/sales-order-lines/sales-order-lines.service.ts).
 *
 * `aiSeats` is deliberately NOT a column here — it's derived at read time
 * from `sku`/`qty` via `parseSeatTokensFromSku` (src/common/utils) and never
 * persisted, matching the pre-migration blob-read behavior.
 */
@Entity('sales_order_lines')
@Index('UQ_sales_order_lines_so_line_active', ['so', 'line'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class SalesOrderLine {
  @PrimaryGeneratedColumn('uuid', { name: 'sales_order_line_id' })
  salesOrderLineId!: string;

  @Column({ type: 'varchar', length: 255 })
  so!: string;

  @Column({ type: 'integer' })
  line!: number;

  @Column({ type: 'varchar', length: 255 })
  customer!: string;

  @Index('IDX_sales_order_lines_redeem_code')
  @Column({ name: 'redeem_code', type: 'varchar', length: 255 })
  redeemCode!: string;

  @Column({ type: 'varchar', length: 255 })
  sku!: string;

  @Column({ type: 'integer' })
  qty!: number;

  @Column({ name: 'product_name', type: 'varchar', length: 255, nullable: true })
  productName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  type?: string;

  @Column({ name: 'sim_group', type: 'varchar', length: 255, nullable: true })
  simGroup?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  platform?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ai?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hw?: string;

  @Column({ type: 'date', nullable: true })
  start?: Date | null;

  @Column({ type: 'date', nullable: true })
  end?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Index('IDX_sales_order_lines_deleted_at', { where: 'deleted_at IS NOT NULL' })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
