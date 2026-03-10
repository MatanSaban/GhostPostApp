'use client';

import { useEffect, useRef } from 'react';

/**
 * Background component that polls the content pipeline cron endpoints.
 * 
 * In development: Vercel cron jobs don't run, so this ensures the pipeline works.
 * In production: Acts as a backup to Vercel cron (which runs every 5 minutes).
 * 
 * Polls:
 *  - /api/cron/process-content (generates AI articles for SCHEDULED content)
 *  - /api/cron/publish-content (publishes READY_TO_PUBLISH content to WordPress)
 */
export default function ContentPipelineWorker() {
  const intervalRef = useRef(null);

  useEffect(() => {
    const runPipeline = async () => {
      try {
        // Process content (SCHEDULED → PROCESSING → READY_TO_PUBLISH)
        await fetch('/api/cron/process-content', { method: 'GET' });
      } catch {
        // Silently fail - background operation
      }

      try {
        // Publish content (READY_TO_PUBLISH → PUBLISHED)
        await fetch('/api/cron/publish-content', { method: 'GET' });
      } catch {
        // Silently fail - background operation
      }
    };

    // First run after 10 seconds (give app time to stabilize)
    const initialTimeout = setTimeout(runPipeline, 10_000);

    // Then run every 60 seconds (more frequent than Vercel's 5 minutes)
    intervalRef.current = setInterval(runPipeline, 60_000);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Renders nothing - purely background worker
  return null;
}
