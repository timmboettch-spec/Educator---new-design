import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RatingBreakdown, SimulationReview, WhatsNew } from '../dto/simulation-catalog.types';

@Entity('simulation_catalog')
export class SimulationCatalog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar' })
  unit!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ name: 'target_audience', type: 'varchar' })
  target_audience!: string;

  @Column({ name: 'difficulty_level', type: 'varchar', nullable: true })
  difficulty_level?: string;

  @Column({ name: 'estimated_duration', type: 'varchar', nullable: true })
  estimated_duration?: string;

  @Column({ type: 'varchar', default: 'English' })
  language!: string;

  @Column({ type: 'text', nullable: true })
  purpose?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Stored as || separated string
  @Column({ name: 'learning_objectives', type: 'text', nullable: true })
  learning_objectives?: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating!: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  total_ratings!: number;

  @Column({ type: 'varchar', nullable: true })
  usage?: string;

  // Azure Blob URL for primary image
  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  image_url?: string;

  // jsonb array of Azure Blob URLs
  @Column({ type: 'jsonb', nullable: true, default: [] })
  images!: string[];

  // jsonb array of { stars, count }
  @Column({ name: 'rating_breakdown', type: 'jsonb', nullable: true, default: [] })
  rating_breakdown!: RatingBreakdown[];

  // jsonb array of review objects
  @Column({ type: 'jsonb', nullable: true, default: [] })
  reviews!: SimulationReview[];

  // jsonb object { version, timeAgo, notes }
  @Column({ name: 'whats_new', type: 'jsonb', nullable: true })
  whats_new?: WhatsNew;

  @Column({ name: 'simulation_privacy', type: 'text', nullable: true })
  simulation_privacy?: string;

  @Column({ type: 'varchar', nullable: true })
  developer?: string;

  @Column({ type: 'varchar', nullable: true })
  institution?: string;

  @Column({ name: 'last_update', type: 'varchar', nullable: true })
  last_update?: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;

  @Column({ name: 'status', type: 'varchar', nullable: true })
  status?: string;
}
