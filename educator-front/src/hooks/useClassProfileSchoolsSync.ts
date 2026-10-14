import { useEffect } from 'react';
import api from '../redux/api';
import config from '../redux/config';
import { updateStoredUser } from '../utils/storage';

/**
 * Refreshes the educator's `schools` list from the profile endpoint into
 * local storage on mount, so ClassFormModal picks up any schools added since
 * login without requiring a full re-login.
 */
export function useClassProfileSchoolsSync() {
  useEffect(() => {
    const controller = new AbortController();
    api
      .get(`${config.GetEducatorAPI}/profile`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
      })
      .then((res) => {
        const schools = (res.data?.data?.schools ?? res.data?.schools) as
          { id: string; school_name: string }[] | undefined;
        if (Array.isArray(schools)) {
          updateStoredUser({ schools });
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
    };
  }, []);
}
