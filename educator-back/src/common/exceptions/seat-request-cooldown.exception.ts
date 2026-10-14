/**
 * Thrown inside `EducatorSeatRequestRepository.createWithinCooldown`'s transaction when the
 * educator already sent a Seat request inside the cooldown window. Throwing rolls the transaction
 * back; `requestedAt` is the stored `requested_at` of that earlier request. Deliberately not an
 * `HttpException`: the service turns it into the endpoint's existing cooldown response.
 */
export class SeatRequestCooldownException extends Error {
  constructor(readonly requestedAt: Date) {
    super(`A seat request was already sent at ${requestedAt.toISOString()}`);
    this.name = 'SeatRequestCooldownException';
  }
}
