'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL_MS = 3000; // 3 seconds

/**
 * Custom hook that polls a background job's status every 3 seconds
 * while the job is PENDING or PROCESSING.
 * 
 * @param {string|null} jobId - The BackgroundJob ID to poll
 * @returns {{ job: Object|null, isLoading: boolean, error: string|null, refetch: Function }}
 */
export function useBackgroundJobPolling(jobId) {
  const [job, setJob] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const fetchJob = useCallback(async (isPolling = false) => {
    if (!jobId) return;

    try {
      if (!isPolling) setIsLoading(true);

      const res = await fetch(`/api/background-jobs/${jobId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch job');
      }

      const data = await res.json();
      if (!isMountedRef.current) return;

      setJob(data.job);
      setError(null);

      // Stop polling if job is terminal
      if (data.job?.status === 'COMPLETED' || data.job?.status === 'FAILED') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message);
    } finally {
      if (!isPolling && isMountedRef.current) setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }

    // Initial fetch
    fetchJob(false);

    // Start polling
    intervalRef.current = setInterval(() => {
      fetchJob(true);
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, fetchJob]);

  return { job, isLoading, error, refetch: () => fetchJob(false) };
}
