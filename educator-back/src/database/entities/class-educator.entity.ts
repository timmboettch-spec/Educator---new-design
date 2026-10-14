import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Class } from './class.entity';
import { Educator } from './educator.entity';

@Entity('class_educators')
@Index('UQ_class_educators_pair', ['class', 'educator'], { unique: true })
@Index('idx_class_educators_class_id', ['class'])
@Index('idx_class_educators_educator_id', ['educator'])
export class ClassEducator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'educator_id', type: 'uuid' })
  educatorId!: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class!: Class;

  @ManyToOne(() => Educator, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'educator_id' })
  educator!: Educator;
}
