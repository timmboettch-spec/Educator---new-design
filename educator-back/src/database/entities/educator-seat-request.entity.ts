import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DistrictAdmin } from './district-admin.entity';
import { Educator } from './educator.entity';

/**
 * One Seat request an educator sent to their admin; `requestedAt` starts the cooldown window.
 * `districtAdminId` is the admin notified at request time and does not follow later reassignment.
 * Never soft-deleted by the feature; a failed notification hard-deletes the row.
 */
@Entity('educator_seat_requests')
// The migration creates this with `requested_at DESC`; `@Index` can't express the direction, which
// TypeORM doesn't diff, so the columns and `where` here must just match the migration.
@Index('IDX_seat_requests_educator_requested_at', ['educatorId', 'requestedAt'], {
  where: '"deleted_at" IS NULL',
})
@Check('CHK_educator_seat_requests_requested_seats_positive', '"requested_seats" > 0')
export class EducatorSeatRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'seat_request_id' })
  seatRequestId!: string;

  @Column({ name: 'educator_id', type: 'uuid' })
  educatorId!: string;

  @ManyToOne(() => Educator, (educator) => educator.seatRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'educator_id' })
  educator?: Educator;

  @Column({ name: 'district_admin_id', type: 'uuid' })
  districtAdminId!: string;

  @ManyToOne(() => DistrictAdmin, (admin) => admin.seatRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'district_admin_id' })
  districtAdmin?: DistrictAdmin;

  @Column({ name: 'requested_seats', type: 'int', nullable: true })
  requestedSeats?: number | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
