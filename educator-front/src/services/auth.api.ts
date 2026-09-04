import api from '../redux/api';

import { URL_CONSTANTS } from '../utils/constants/urlConstants';

export const loginApi = (data: { email: string; password: string }) => {
  return api.post(URL_CONSTANTS.AUTH.LOGIN, data);
};

export const signupApi = (data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}) => {
  return api.post(URL_CONSTANTS.AUTH.REGISTER, data);
};
