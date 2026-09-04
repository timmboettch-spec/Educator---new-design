import { useCallback, useEffect, useRef, useState } from 'react';
import { getLiveness, getReadiness } from '../services/health.api';
import type { HealthResponse, HealthStatus, ReadyResponse } from '../services/health.api';

export interface HealthCheckState {
  liveness: HealthResponse | null;
  readiness: ReadyResponse | null;
  overallStatus: HealthStatus | 'unknown';
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function worstStatus(
  a: HealthStatus | 'unknown',
  b: HealthStatus | 'unknown',
): HealthStatus | 'unknown' {
  const rank: Record<HealthStatus | 'unknown', number> = {
    ok: 0,
    unknown: 1,
    degraded: 2,
    error: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

export function useHealthCheck(pollIntervalMs?: number): HealthCheckState {
  const [liveness, setLiveness] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [liveResult, readyResult] = await Promise.allSettled([
        getLiveness(),
        getReadiness(),
      ]);

      setLiveness(liveResult.status === 'fulfilled' ? liveResult.value : null);
      setReadiness(readyResult.status === 'fulfilled' ? readyResult.value : null);

      if (liveResult.status === 'rejected' && readyResult.status === 'rejected') {
        setError('Backend is unreachable');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runChecks();

    if (pollIntervalMs && pollIntervalMs > 0) {
      intervalRef.current = setInterval(() => void runChecks(), pollIntervalMs);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [runChecks, pollIntervalMs]);

  const livenessStatus: HealthStatus | 'unknown' = liveness?.status ?? 'unknown';
  const readinessStatus: HealthStatus | 'unknown' = readiness?.status ?? 'unknown';
  const overallStatus = worstStatus(livenessStatus, readinessStatus);

  return {
    liveness,
    readiness,
    overallStatus,
    isLoading,
    error,
    refetch: runChecks,
  };
}
