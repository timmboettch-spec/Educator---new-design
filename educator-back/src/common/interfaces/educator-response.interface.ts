import { Educator } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';

/**
 * The shape of an `Educator` sent to the frontend: never exposes the raw `userRole` relation
 * (which would leak the linked `users` row, password hash included), and surfaces the
 * `email`/`status` fields the frontend still expects at the educator root — resolved via
 * `toEducatorResponse` from the `userRole.user`/`userRole.status` chain now that
 * `Educator.email`/`.password`/`.status` no longer exist as columns.
 */
export type EducatorResponse = Omit<Educator, 'userRole'> & {
  email: string | null;
  status: CommonStatus | null;
};
