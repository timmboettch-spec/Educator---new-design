import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ClassTransferStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('class_transfer_audits')
export class ClassTransferAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'class_id', type: 'varchar' })
  classId!: string;

  @Column({ name: 'class_name', type: 'varchar' })
  className!: string;

  @Index()
  @Column({ name: 'source_educator_id', type: 'varchar' })
  sourceEducatorId!: string;

  @Column({ name: 'source_educator_name', type: 'varchar', nullable: true })
  sourceEducatorName!: string | null;

  @Index()
  @Column({ name: 'target_educator_id', type: 'varchar' })
  targetEducatorId!: string;

  @Column({ name: 'target_educator_name', type: 'varchar', nullable: true })
  targetEducatorName!: string | null;

  @Index()
  @Column({ name: 'admin_id', type: 'varchar' })
  adminId!: string;

  @Column({ name: 'admin_email', type: 'varchar', nullable: true })
  adminEmail!: string | null;

  @Column({
    type: 'enum',
    enum: ClassTransferStatus,
    default: ClassTransferStatus.SUCCESS,
  })
  status!: ClassTransferStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'transferred_at', type: 'timestamptz' })
  transferredAt!: Date;
}
