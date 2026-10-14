import { createAsyncThunk } from '@reduxjs/toolkit';

import config from '../config';
import api from '../api';
import type { ResponseLogin } from './LoginRedux';

export interface SelectRolePayload {
  /** A `userRoles[].id` value — the user_roles row id, not the role slug. */
  roleId: string;
  /**
   * The short-lived token pair from the login response. Passed explicitly
   * because role selection happens before any session is committed to storage,
   * so the request interceptor has nothing to attach.
   */
  accessToken?: string;
  csrfToken?: string;
}

/** `select-role` replies with the same envelope as `login`. */
export type ResponseSelectRole = ResponseLogin;

export const SelectRoleRequest = createAsyncThunk<
  ResponseSelectRole,
  SelectRolePayload,
  { rejectValue: { message: string; status?: number } }
>('auth/SelectRole', async ({ roleId, accessToken, csrfToken }, thunkAPI) => {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const res = await api.post(config.SelectRoleAPI, { roleId }, { headers });
    return res.data;
  } catch (err) {
    const error = err as {
      response?: { status?: number; data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Role selection failed',
      status: error.response?.status,
    });
  }
});
