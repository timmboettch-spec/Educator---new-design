import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CreateEducatorSeatRequestInput } from 'src/common/interfaces';
import { SeatRequestCooldownException } from 'src/common/exceptions/seat-request-cooldown.exception';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { Educator, EducatorSeatRequest } from 'src/database/entities';

@Injectable()
export class EducatorSeatRequestRepository {
  constructor(
    @InjectRepository(EducatorSeatRequest)
    private readonly repo: Repository<EducatorSeatRequest>,
  ) {}

  /**
   * Creates a Seat request unless the educator already sent one inside the cooldown window, all
   * in one transaction: lock the active educator row (`FOR NO KEY UPDATE`, which serializes
   * concurrent requests for the same educator without blocking foreign-key inserts that
   * reference it), look for a request inside the window, then insert. Returns the created row
   * with the database-stamped `requestedAt`.
   *
   * @throws NotFoundException when the educator is no longer active (Postgres locks nothing then)
   * @throws SeatRequestCooldownException when a request already exists inside the window
   */
  async createWithinCooldown(
    input: CreateEducatorSeatRequestInput,
    cooldownMinutes: number,
  ): Promise<EducatorSeatRequest> {
    return this.repo.manager.transaction(async (manager) => {
      const locked = await manager.getRepository(Educator).findOne({
        where: { id: input.educatorId, is_active: true },
        lock: { mode: 'for_no_key_update' },
      });
      if (!locked) throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));

      const latest = await this.findLatestWithinWindow(input.educatorId, cooldownMinutes, manager);
      if (latest) throw new SeatRequestCooldownException(latest);

      return this.insert(input, manager);
    });
  }

  /** Permanently removes the row (not a soft delete). Returns the number of rows removed. */
  async hardDeleteById(seatRequestId: string): Promise<number> {
    const result = await this.repo.delete({ seatRequestId });
    return result.affected ?? 0;
  }

  /**
   * `requested_at` of the educator's latest Seat request inside the cooldown window, or `null`.
   * The window is compared against the database clock (`now()`), never the app clock.
   */
  private async findLatestWithinWindow(
    educatorId: string,
    cooldownMinutes: number,
    manager: EntityManager,
  ): Promise<Date | null> {
    const row = await manager
      .getRepository(EducatorSeatRequest)
      .createQueryBuilder('sr')
      .select('sr.requested_at', 'requestedAt')
      .where('sr.educator_id = :educatorId', { educatorId })
      .andWhere("sr.requested_at > now() - :cooldownMinutes * interval '1 minute'", {
        cooldownMinutes,
      })
      .orderBy('sr.requested_at', 'DESC')
      .limit(1)
      .getRawOne<{ requestedAt: Date }>();
    return row ? new Date(row.requestedAt) : null;
  }

  private async insert(
    input: CreateEducatorSeatRequestInput,
    manager: EntityManager,
  ): Promise<EducatorSeatRequest> {
    const repo = manager.getRepository(EducatorSeatRequest);
    const saved = await repo.save(
      repo.create({
        educatorId: input.educatorId,
        districtAdminId: input.districtAdminId,
        requestedSeats: input.requestedSeats ?? null,
        note: input.note ?? null,
      }),
    );
    // `requested_at` is stamped by the database default, so read it back instead of trusting
    // the in-memory entity.
    return repo.findOneOrFail({ where: { seatRequestId: saved.seatRequestId } });
  }
}
