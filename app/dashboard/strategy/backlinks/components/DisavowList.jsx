'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Check, Loader2, Globe, Link as LinkIcon, ShieldOff } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { Button, LoadingState } from '@/app/dashboard/components';
import styles from '../page.module.css';

function fillTemplate(str, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    str || ''
  );
}

export function DisavowList({ siteId, onChanged }) {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/strategy/backlinks/disavow?siteId=${siteId}`);
      if (!res.ok) {
        setData(null);
        return;
      }
      setData(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    setData(null);
    setFeedback(null);
    if (siteId) load();
  }, [siteId, load]);

  const handleDelete = async (id) => {
    if (busyId) return;
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/strategy/backlinks/disavow/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.disavow.errorDelete') });
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleAcknowledge = async (id) => {
    if (busyId) return;
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/strategy/backlinks/disavow/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACKNOWLEDGED' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.disavow.errorAck') });
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = async () => {
    if (!siteId || isExporting) return;
    setIsExporting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/strategy/backlinks/disavow/export?siteId=${siteId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.disavow.errorExport') });
        return;
      }
      // Download as blob so we can trigger the file save without losing the
      // ability to refresh state afterward (window.location would unload).
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match ? match[1] : 'disavow.txt';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedback({ kind: 'success', text: t('backlinkAudit.disavow.exportSuccess') });
      await load();
    } catch {
      setFeedback({ kind: 'error', text: t('backlinkAudit.disavow.errorExport') });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && !data) {
    return <div className={styles.loadingWrap}><LoadingState message={t('backlinkAudit.loading')} /></div>;
  }

  const entries = data?.entries || [];
  const counts = data?.counts || { total: 0, pending: 0, exported: 0, acknowledged: 0 };
  const hasExportable = entries.some(e => e.status !== 'ACKNOWLEDGED');

  return (
    <>
      <div className={styles.disavowHeader}>
        <div className={styles.disavowSummary}>
          <span>{fillTemplate(t('backlinkAudit.disavow.summary'), {
            total: counts.total,
            pending: counts.pending,
            exported: counts.exported,
            acknowledged: counts.acknowledged,
          })}</span>
        </div>
        <Button onClick={handleExport} disabled={!hasExportable || isExporting}>
          {isExporting ? <Loader2 size={16} className={styles.spinning} /> : <Download size={16} />}
          {t('backlinkAudit.disavow.exportTxt')}
        </Button>
      </div>

      {feedback && (
        <div className={`${styles.feedback} ${feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess}`}>
          {feedback.text}
        </div>
      )}

      {entries.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><ShieldOff size={32} /></div>
          <h3 className={styles.emptyTitle}>{t('backlinkAudit.disavow.emptyTitle')}</h3>
          <p className={styles.emptyDescription}>{t('backlinkAudit.disavow.emptyDescription')}</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colNarrow}>{t('backlinkAudit.disavow.scope')}</th>
                <th>{t('backlinkAudit.disavow.value')}</th>
                <th>{t('backlinkAudit.disavow.reason')}</th>
                <th className={styles.colNarrow}>{t('backlinkAudit.disavow.coverage')}</th>
                <th className={styles.colNarrow}>{t('backlinkAudit.disavow.statusLabel')}</th>
                <th className={styles.colNarrow} />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className={styles.colNarrow}>
                    <span className={styles.scopeChip}>
                      {e.scope === 'DOMAIN' ? <Globe size={12} /> : <LinkIcon size={12} />}
                      {t(`backlinkAudit.disavow.scope${e.scope === 'DOMAIN' ? 'Domain' : 'Url'}`)}
                    </span>
                  </td>
                  <td className={styles.disavowValue}>{e.value}</td>
                  <td className={styles.anchorCell}>
                    {e.reason || <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.colNarrow}>{e.coverageCount ?? 0}</td>
                  <td className={styles.colNarrow}>
                    <DisavowStatusBadge status={e.status} t={t} />
                  </td>
                  <td className={styles.colNarrow}>
                    <div className={styles.rowActions}>
                      {e.status === 'EXPORTED' && (
                        <button
                          type="button"
                          className={styles.rowActionBtn}
                          onClick={() => handleAcknowledge(e.id)}
                          disabled={busyId === e.id}
                          title={t('backlinkAudit.disavow.markAck')}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.rowActionBtn} ${styles.rowActionDanger}`}
                        onClick={() => handleDelete(e.id)}
                        disabled={busyId === e.id}
                        title={t('backlinkAudit.disavow.delete')}
                      >
                        {busyId === e.id ? <Loader2 size={14} className={styles.spinning} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DisavowStatusBadge({ status, t }) {
  const cls =
    status === 'EXPORTED' ? styles.disavowStatusExported
    : status === 'ACKNOWLEDGED' ? styles.disavowStatusAck
    : styles.disavowStatusPending;
  return (
    <span className={`${styles.statusBadge} ${cls}`}>
      {t(`backlinkAudit.disavow.status${capitalize(status.toLowerCase())}`)}
    </span>
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
