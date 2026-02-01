'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../auth.module.css';

/**
 * AnalysisProgress component
 * Shows a progress bar with dynamic logs while analyzing the website
 * Creates the "Illusion of Labor" UX pattern
 */
export function AnalysisProgress({ url, onComplete, onError }) {
  const { t, locale } = useLocale();
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const analysisStarted = useRef(false);
  const logsEndRef = useRef(null);
  const logIdCounter = useRef(0);

  // Analysis log messages - mix of real and impressive phrasing
  const logMessages = [
    { key: 'handshake', duration: 800 },
    { key: 'architecture', duration: 1200 },
    { key: 'platform', duration: 1000 },
    { key: 'entities', duration: 1500 },
    { key: 'seo', duration: 1200 },
    { key: 'keywords', duration: 1000 },
    { key: 'competitors', duration: 2000 },
    { key: 'synthesis', duration: 1500 },
    { key: 'complete', duration: 500 },
  ];

  // Scroll to bottom when new logs appear
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Run analysis
  useEffect(() => {
    if (analysisStarted.current) return;
    analysisStarted.current = true;

    const runAnalysis = async () => {
      // Start showing logs with delays
      let logIndex = 0;
      const totalSteps = logMessages.length;

      const showNextLog = () => {
        if (logIndex >= totalSteps - 1) return;
        
        const step = logMessages[logIndex];
        const logText = t(`interviewWizard.analysis.logs.${step.key}`, { url });
        const uniqueId = logIdCounter.current++;
        
        setLogs(prev => [...prev, { 
          id: uniqueId, 
          text: logText,
          status: 'loading'
        }]);
        setCurrentStep(logIndex);
        setProgress(Math.round((logIndex / (totalSteps - 1)) * 100));
        
        logIndex++;
      };

      // Show first log immediately
      showNextLog();

      // Schedule remaining logs
      let totalDelay = 0;
      for (let i = 1; i < totalSteps - 1; i++) {
        totalDelay += logMessages[i - 1].duration;
        setTimeout(() => {
          // Mark previous as complete
          setLogs(prev => prev.map((log, idx) => 
            idx === i - 1 ? { ...log, status: 'complete' } : log
          ));
          showNextLog();
        }, totalDelay);
      }

      // Actually run the API call
      try {
        const response = await fetch('/api/interview/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Analysis failed');
        }

        // Wait for log animation to complete, then show final log
        const minDuration = logMessages.reduce((sum, l) => sum + l.duration, 0);
        const elapsed = Date.now() - analysisStarted.current;
        const remaining = Math.max(0, minDuration - elapsed);

        setTimeout(() => {
          // Mark all as complete
          setLogs(prev => prev.map(log => ({ ...log, status: 'complete' })));
          
          // Add final log
          const finalLog = t('interviewWizard.analysis.logs.complete');
          const finalId = logIdCounter.current++;
          setLogs(prev => [...prev, { 
            id: finalId, 
            text: finalLog,
            status: 'complete'
          }]);
          
          setProgress(100);
          setIsComplete(true);

          // Call onComplete with analysis data
          setTimeout(() => {
            onComplete(data.analysis);
          }, 1000);
        }, remaining + 500);

      } catch (err) {
        console.error('Analysis error:', err);
        setError(err.message);
        setLogs(prev => prev.map(log => ({ ...log, status: 'error' })));
        onError?.(err.message);
      }
    };

    // Small delay before starting
    setTimeout(runAnalysis, 500);
  }, [url, t, onComplete, onError]);

  return (
    <div className={styles.analysisProgressContainer}>
      <div className={styles.analysisHeader}>
        <div className={styles.analysisIcon}>
          {isComplete ? (
            <CheckCircle2 size={32} className={styles.analysisIconComplete} />
          ) : error ? (
            <AlertCircle size={32} className={styles.analysisIconError} />
          ) : (
            <Loader2 size={32} className={styles.analysisIconSpinner} />
          )}
        </div>
        <div className={styles.analysisHeaderText}>
          <h3 className={styles.analysisTitle}>
            {error 
              ? t('interviewWizard.analysis.error') 
              : isComplete 
                ? t('interviewWizard.analysis.complete')
                : t('interviewWizard.analysis.analyzing')
            }
          </h3>
          <p className={styles.analysisUrl}>{url}</p>
        </div>
      </div>

      <div className={styles.analysisProgressBar}>
        <div 
          className={styles.analysisProgressFill} 
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={styles.analysisLogs}>
        {logs.map((log) => (
          <div 
            key={log.id} 
            className={`${styles.analysisLogItem} ${styles[`log${log.status}`]}`}
          >
            <span className={styles.analysisLogIcon}>
              {log.status === 'loading' && <Loader2 size={14} className={styles.logSpinner} />}
              {log.status === 'complete' && <CheckCircle2 size={14} />}
              {log.status === 'error' && <AlertCircle size={14} />}
            </span>
            <span className={styles.analysisLogText}>{log.text}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {error && (
        <div className={styles.analysisError}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default AnalysisProgress;
