import axios from 'axios';
import config from '@/redux/config';

export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface CheckResult {
  status: HealthStatus;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: HealthStatus;
  uptimeMs: number;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

export interface ReadyResponse {
  status: HealthStatus;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

export const getLiveness = async (): Promise<HealthResponse> => {
  const { data } = await axios.get<HealthResponse>(config.LIVENESS);
  return data;
};

export const getReadiness = async (): Promise<ReadyResponse> => {
  const { data } = await axios.get<ReadyResponse>(config.READINESS);
  return data;
};
