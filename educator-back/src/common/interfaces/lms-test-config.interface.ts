import { LmsType } from 'src/common/enums/lms.enum';

export interface LmsTestConfigResult {
  success: boolean;
  message: string;
  oauthOk: boolean | null;
  apiOk: boolean | null;
  lmsType: LmsType | string | null;
}
