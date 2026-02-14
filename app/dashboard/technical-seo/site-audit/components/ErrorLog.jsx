'use client';

import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import styles from './ErrorLog.module.css';

/**
 * ErrorLog — Formatted display for JS errors, broken resources, and other
 * technical log data. Shows each entry on a separate line with line numbers
 * and optional expand/collapse for long entries.
 *
 * Props:
 * - errors: Array<string | { text: string, stackTrace?: string, resource?: string }>
 * - title: optional heading text
 * - maxVisible: initial number of visible items (default 5)
 */
export default function ErrorLog({ errors = [], title, maxVisible = 5 }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  if (!errors.length) return null;

  const visibleErrors = expanded ? errors : errors.slice(0, maxVisible);
  const hasMore = errors.length > maxVisible;

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const formatEntry = (entry) => {
    if (typeof entry === 'string') return entry;
    if (entry.text) {
      let out = entry.text;
      if (entry.stackTrace) out += entry.stackTrace;
      return out;
    }
    if (entry.resource) return entry.resource;
    return JSON.stringify(entry);
  };

  return (
    <div className={styles.container}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.logBody}>
        {visibleErrors.map((entry, idx) => {
          const text = formatEntry(entry);
          return (
            <div key={idx} className={styles.logEntry}>
              <span className={styles.lineNumber}>{idx + 1}</span>
              <pre className={styles.logText}>{text}</pre>
              <button
                className={styles.copyBtn}
                onClick={() => handleCopy(text, idx)}
                title="Copy"
              >
                {copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          className={styles.expandBtn}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Show all {errors.length} entries
            </>
          )}
        </button>
      )}
    </div>
  );
}
