import { ICurrentUser } from 'src/common/interfaces';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes, Messages } from 'src/common/utils/messages';

export function assertEducator(
  currentUser: ICurrentUser,
): asserts currentUser is ICurrentUser & { educatorId: string } {
  if (!currentUser.educatorId) {
    throwAppError(Messages.FORBIDDEN, ErrorTypes.FORBIDDEN);
  }
}
