import { UserTokenPurpose } from 'src/common/constants';

/** Params for UserTokenRepository.upsertActive — creates or refreshes the one live token/OTP for a purpose+user. */
export interface UpsertActiveUserTokenData {
  purpose: UserTokenPurpose;
  userId: string;
  token: string;
  expiresAt: Date;
}

/** Payload encoded into an invite token by `generateToken` (`InviteTokenService`). */
export interface IEducatornviteTokenPayload {
  inviteId: string;
}
