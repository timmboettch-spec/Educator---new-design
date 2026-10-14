import { User } from 'src/database/entities';

/** A `User` paired with the profile fields that live on its linked `DistrictAdmin` row. */
export interface UserWithDistrictAdminProfile {
  user: User;
  isLicenseActive: boolean;
  subscriptions: object[];
}
