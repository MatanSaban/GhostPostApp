'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useSite } from './site-context';

const AgentContext = createContext({
  runningAnalysis: false,
  lastAnalysisTs: 0,
  entitiesRequired: false,
  setEntitiesRequired: () => {},
  runAnalysis: async () => {},
});

const POLL_INTERVAL = 2000;

export function AgentProvider({ children }) {
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [checkingEntities, setCheckingEntities] = useState(false);
  const [lastAnalysisTs, setLastAnalysisTs] = useState(0);
  const [entitiesRequired, setEntitiesRequired] = useState(false);
  const pollRef = useRef(null);
  const runIdRef = useRef(null);
  const siteIdRef = useRef(null);
  const { selectedSite } = useSite();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    runIdRef.current = null;
    siteIdRef.current = null;
  }, []);

  const startPolling = useCallback((siteId, runId) => {
    stopPolling();
    runIdRef.current = runId;
    siteIdRef.current = siteId;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agent/runs?siteId=${siteId}&limit=1`);
        if (!res.ok) return;
        const data = await res.json();
        const latestRun = data.runs?.[0];
        if (!latestRun) return;

        // Check if our run (or any run) finished
        if (latestRun.id === runIdRef.current && latestRun.status !== 'RUNNING') {
          stopPolling();
          setRunningAnalysis(false);
          setLastAnalysisTs(Date.now());
        }
      } catch {
        // Silently ignore polling errors
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  // Check for already-running analysis on site change / page load
  useEffect(() => {
    if (!selectedSite?.id) return;
    
    let cancelled = false;
    const checkRunning = async () => {
      try {
        const res = await fetch(`/api/agent/runs?siteId=${selectedSite.id}&limit=1`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const latestRun = data.runs?.[0];
        if (latestRun?.status === 'RUNNING') {
          setRunningAnalysis(true);
          startPolling(selectedSite.id, latestRun.id);
        } else {
          setRunningAnalysis(false);
          stopPolling();
        }
      } catch {
        // Ignore
      }
    };
    checkRunning();

    return () => { cancelled = true; };
  }, [selectedSite?.id, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const runAnalysis = useCallback(async (siteId) => {
    if (!siteId || runningAnalysis || checkingEntities) return;
    try {
      // Immediately show loading on button
      setCheckingEntities(true);

      // Check if site has entities before starting
      const entitiesRes = await fetch(`/api/entities?siteId=${siteId}`);
      if (entitiesRes.ok) {
        const entitiesData = await entitiesRes.json();
        if (!entitiesData.entities?.length) {
          setCheckingEntities(false);
          setEntitiesRequired(true);
          return;
        }
      }

      setRunningAnalysis(true);
      setCheckingEntities(false);
      const res = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[AgentContext] Run analysis error:', data.error);
        setRunningAnalysis(false);
        return;
      }
      const { runId } = await res.json();
      startPolling(siteId, runId);
    } catch (err) {
      console.error('[AgentContext] Run error:', err);
      setRunningAnalysis(false);
      setCheckingEntities(false);
    }
  }, [runningAnalysis, checkingEntities, startPolling]);

  return (
    <AgentContext.Provider value={{ runningAnalysis: runningAnalysis || checkingEntities, lastAnalysisTs, entitiesRequired, setEntitiesRequired, runAnalysis }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  return useContext(AgentContext);
}
