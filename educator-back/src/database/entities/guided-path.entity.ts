import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RoleSlug } from 'src/common/constants';

/**
 * One row per `(userId, roleType)` pair — a person holding two roles (e.g.
 * Educator + District Admin) gets two independent guided paths. Deliberately
 * decoupled from `user_roles` (no FK) — `userId`/`roleType` are read straight
 * off `ICurrentUser` on every request, so no lookup against `user_roles` is
 * needed to resolve this row.
 *
 * Deliberately has NO `deletedAt`/soft-delete column, a documented deviation
 * from this repo's usual base-column convention (`database-entities-rules.md`):
 * a guided path row is only ever replaced (upsert) or marked completed, never
 * removed — a dormant soft-delete column with no code path that ever sets it
 * would misrepresent this entity's lifecycle rather than follow convention.
 */
@Entity('guided_paths')
@Index('UQ_guided_paths_user_id_role_type', ['userId', 'roleType'], { unique: true })
export class GuidedPath {
  @PrimaryGeneratedColumn('uuid', { name: 'guided_path_id' })
  guidedPathId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_type', type: 'varchar', length: 50 })
  roleType!: RoleSlug;

  /**
   * Illustrative only — the Educator role's guided path currently tracks five
   * boolean step flags on the frontend, e.g.
   * `{ step1: true, step2: true, step3: false, step4: false, step5: false }`.
   * This is a snapshot of current frontend intent, not a backend contract:
   * the backend never reads, validates, or reasons about this shape.
   */
  @Column({
    type: 'jsonb',
    default: {},
    comment:
      'Opaque, frontend-owned guided-path progress. The backend stores and returns this verbatim and never reads/validates/interprets its contents.',
  })
  state!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
