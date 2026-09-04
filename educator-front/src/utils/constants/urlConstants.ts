const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const URL_CONSTANTS = {
  AUTH: {
    LOGIN: `${BASE_URL}/api/auth/login`,
    REGISTER: `${BASE_URL}/api/auth/register`,
  },
};
