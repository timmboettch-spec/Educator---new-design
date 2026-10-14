import { ClassTransferFailureReason } from '../constants/class.constants';

/**
 * Thrown inside `ClassRepository.transferClassInBatch`'s transaction when the guarded class
 * UPDATE matches no row: since the bulk transfer's up-front checks the class was deleted,
 * deactivated or moved to another owner (e.g. by a concurrent transfer). Throwing rolls the
 * class's transaction back; `reason` is what the service reports for that class. Deliberately not
 * an `HttpException`: it never reaches the client as an HTTP error.
 */
export class ClassTransferConflictException extends Error {
  constructor(
    readonly classId: string,
    readonly reason: ClassTransferFailureReason,
  ) {
    super(`Class ${classId} can no longer be transferred: ${reason}`);
    this.name = 'ClassTransferConflictException';
  }
}
