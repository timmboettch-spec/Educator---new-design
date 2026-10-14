import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosError, AxiosRequestConfig, Method } from 'axios';

import api from '../api';

export type AxiosBaseQueryArgs = {
  url: string;
  method?: Method;
  params?: AxiosRequestConfig['params'];
  data?: AxiosRequestConfig['data'];
  headers?: AxiosRequestConfig['headers'];
  timeout?: AxiosRequestConfig['timeout'];
};

export type AxiosBaseQueryError = {
  status?: number;
  data: unknown;
};

/**
 * Wraps the app's shared axios instance (auth header, CSRF, 401/403/429
 * handling all live there) so RTK Query endpoints inherit that behavior
 * instead of reimplementing it via fetchBaseQuery.
 */
export const axiosBaseQuery =
  (): BaseQueryFn<AxiosBaseQueryArgs, unknown, AxiosBaseQueryError> =>
  async ({ url, method = 'GET', params, data, headers, timeout }) => {
    try {
      // BE expects repeated keys for arrays (status=A&status=B), not axios's default status[]=A.
      const result = await api.request({
        url,
        method,
        params,
        data,
        headers,
        timeout,
        paramsSerializer: { indexes: null },
      });
      return { data: result.data };
    } catch (err) {
      const error = err as AxiosError;
      return {
        error: {
          status: error.response?.status,
          data: error.response?.data ?? error.message,
        },
      };
    }
  };
