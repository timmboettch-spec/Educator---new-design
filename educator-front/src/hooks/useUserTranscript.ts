import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUserTranscript } from '../api/userTranscriptApi';
import type { UserTranscriptResponse } from '../types/userTranscript';

export interface UseUserTranscriptResult {
  data: UserTranscriptResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserTranscript(
  attemptId: string | undefined,
): UseUserTranscriptResult {
  const [data, setData] = useState<UserTranscriptResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!attemptId) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    fetchUserTranscript(attemptId)
      .then((res) => {
        if (!mountedRef.current) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        const axiosErr = err as {
          name?: string;
          response?: { data?: { message?: string } };
          message?: string;
        };
        if (axiosErr?.name === 'CanceledError' || axiosErr?.name === 'AbortError') return;
        const msg =
          axiosErr?.response?.data?.message ??
          axiosErr?.message ??
          'Failed to load transcript';
        setError(msg);
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });
  }, [attemptId]);

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  return {
    data,
    isLoading,
    isError: !!error,
    error,
    refetch: load,
  };
}
