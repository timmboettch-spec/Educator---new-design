import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateToken, verifyToken } from 'src/common/utils';
import { IEducatornviteTokenPayload } from 'src/common/interfaces';
import { Invite } from 'src/database/entities';
import { INVITE_REPOSITORY } from 'src/database/tokens';
import { InviteRepository } from 'src/database/repositories';
import { InvitesConstants } from './invites.constants';
import { AUTH_MSG } from '../common/messages/auth.message';

/**
 * Invite-specific layer over the generic `crypto.utils` token codec: owns the invite payload
 * shape (`{ inviteId }`), the shared invite-link URL builder, and the one validity check both
 * the verify-token endpoint and accept-invite call — so the two can never drift out of sync
 * with each other's rules.
 *
 * Deliberately stateless — no `user_tokens` row is written. The token's own signature + `exp`
 * (via `generateToken`/`verifyToken`) plus the `invites` row's `status`/`expires_at` are the
 * only sources of truth; single-use is enforced by `markInviteAccepted` flipping `status` to
 * `ACCEPTED`.
 */
@Injectable()
export class InviteTokenService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
  ) { }

  private get ttlMs(): number {
    return InvitesConstants.INVITE_EXPIRY_MINUTES * 60 * 1000;
  }

  private get secret(): string | undefined {
    return this.configService.get<string>('app.cryptoSecret');
  }

  /** Encodes `inviteId` into a fresh, time-bound token. */
  issue(inviteId: string): string {
    return generateToken<IEducatornviteTokenPayload>({ inviteId }, this.ttlMs, this.secret);
  }

  /** Builds the frontend link an invitee follows to set their password. */
  buildInviteUrl(token: string): string {
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';
    return `${frontendUrl}/signup/${token}`;
  }

  /**
   * Decrypts `token` and re-validates the underlying invite: not found, already accepted, or
   * past its own `expires_at` all fail the same way a forged/expired token does — callers
   * outside this service never see the difference.
   */
  async resolve(token: string): Promise<Invite> {
    const { inviteId } = verifyToken<IEducatornviteTokenPayload>(token, this.secret);

    const invite = await this.inviteRepo.findOne({
      where: { id: inviteId },
      relations: ['school', 'createdBy'],
    });
    if (!invite) {
      throw new BadRequestException(AUTH_MSG.INVITE_INVALID_OR_EXPIRED);
    }
    if (!invite.expires_at || new Date() > new Date(invite.expires_at)) {
      throw new BadRequestException(AUTH_MSG.INVITE_INVALID_OR_EXPIRED);
    }

    return invite;
  }
}
