import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, FindOptionsWhere, Raw, Repository } from 'typeorm';
import { Educator, Invite, InviteStatus, User, UserRole } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AcceptInviteInput } from 'src/common/interfaces';
import { AUTH_MSG } from 'src/common/messages/auth.message';

@Injectable()
export class InviteRepository {
  constructor(
    @InjectRepository(Invite)
    private readonly repo: Repository<Invite>,
  ) { }

  async create(data: DeepPartial<Invite>): Promise<Invite> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findOne(options: FindOneOptions<Invite>): Promise<Invite | null> {
    return this.repo.findOne(options);
  }

  /** Deletes every invite for `email`, matched case-insensitively so legacy mixed-case rows go too. */
  async deleteByEmail(email: string): Promise<number> {
    const result = await this.repo.delete({
      email: Raw((alias) => `LOWER(${alias}) = LOWER(:email)`, { email }),
    });
    return result.affected ?? 0;
  }

  /** Deletes the PENDING invites for `email`, matched case-insensitively like `deleteByEmail`. */
  async deletePendingByEmail(email: string): Promise<number> {
    const result = await this.repo.delete({
      email: Raw((alias) => `LOWER(${alias}) = LOWER(:email)`, { email }),
      status: InviteStatus.PENDING,
    });
    return result.affected ?? 0;
  }

  async delete(where: FindOptionsWhere<Invite> | FindOptionsWhere<Invite>[]): Promise<number> {
    const result = await this.repo.delete(where ?? {});
    return result.affected ?? 0;
  }

  /**
   * Accepts an invite atomically. The invite is flipped first, only while still PENDING, so a
   * repeated/concurrent accept loses before it writes anything else: it throws a 409 and the
   * transaction rolls back with nothing changed. Returns the activated educator (with admin
   * relations for notifications), or null when none is linked.
   */
  async acceptInvite(input: AcceptInviteInput): Promise<Educator | null> {
    return this.repo.manager.transaction(async (manager) => {
      const accepted = await manager.getRepository(Invite).update(
        { id: input.inviteId, status: InviteStatus.PENDING },
        { status: InviteStatus.ACCEPTED, is_active: false, deleted_at: new Date() },
      );
      if (!accepted.affected) {
        throw new ConflictException(AUTH_MSG.INVITE_ALREADY_USED)
      }

      await manager.getRepository(User).update({ id: input.userId }, { password: input.hashedPassword });
      await manager
        .getRepository(UserRole)
        .update({ userId: input.userId, roleId: input.roleId }, { status: CommonStatus.ACTIVE });

      const educatorRepo = manager.getRepository(Educator);
      const educator = await educatorRepo.findOne({
        where: { userRoleId: input.userRoleId },
        relations: ['admin', 'admin.userRole'],
      });
      if (educator) {
        await educatorRepo.update({ id: educator.id }, { is_active: true });
        educator.is_active = true;
      }

      return educator;
    });
  }
}
