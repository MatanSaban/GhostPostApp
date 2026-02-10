'use client';

import {
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { Skeleton } from '@/app/dashboard/components';
import styles from '../competitors.module.css';

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function ScanStatusBadge({ competitor, isScanning, t }) {
  if (isScanning) {
    return (
      <span className={`${styles.statusBadge} ${styles.scanning}`}>
        <Loader2 className={styles.spinIcon} size={12} />
        {t('competitorAnalysis.scanning')}
      </span>
    );
  }
  switch (competitor.scanStatus) {
    case 'COMPLETED':
      return (
        <span className={`${styles.statusBadge} ${styles.completed}`}>
          <CheckCircle size={12} />
          {t('competitorAnalysis.lastScanned')} {formatTimeAgo(competitor.lastScannedAt)}
        </span>
      );
    case 'ERROR':
      return (
        <span className={`${styles.statusBadge} ${styles.error}`}>
          <AlertCircle size={12} />
          {t('competitorAnalysis.scanError')}
        </span>
      );
    default:
      return (
        <span className={`${styles.statusBadge} ${styles.pending}`}>
          <Clock size={12} />
          {t('competitorAnalysis.pending')}
        </span>
      );
  }
}

export function CompetitorTableSkeleton({ t }) {
  return (
    <div className={styles.competitorTableWrapper}>
      <table className={styles.competitorTable}>
        <thead>
          <tr>
            <th>{t('competitorAnalysis.competitor')}</th>
            <th>{t('competitorAnalysis.status')}</th>
            <th>{t('competitorAnalysis.wordCount')}</th>
            <th>H1/H2/H3</th>
            <th>{t('competitorAnalysis.images')}</th>
            <th>{t('competitorAnalysis.speed')}</th>
            <th>{t('competitorAnalysis.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((i) => (
            <tr key={i} style={{ pointerEvents: 'none' }}>
              <td>
                <div className={styles.tableCompetitorInfo}>
                  <Skeleton width="24px" height="24px" borderRadius="sm" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Skeleton width="120px" height="14px" borderRadius="sm" />
                    <Skeleton width="160px" height="10px" borderRadius="sm" />
                  </div>
                </div>
              </td>
              <td><Skeleton width="70px" height="24px" borderRadius="full" /></td>
              <td><Skeleton width="50px" height="14px" borderRadius="sm" /></td>
              <td><Skeleton width="60px" height="14px" borderRadius="sm" /></td>
              <td><Skeleton width="30px" height="14px" borderRadius="sm" /></td>
              <td><Skeleton width="45px" height="14px" borderRadius="sm" /></td>
              <td>
                <div className={styles.tableActions}>
                  <Skeleton width="30px" height="30px" borderRadius="md" />
                  <Skeleton width="30px" height="30px" borderRadius="md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompetitorTable({ competitors, selectedCompetitor, scanningIds, onSelect, onScan, onRemove }) {
  const { t } = useLocale();

  return (
    <div className={styles.competitorTableWrapper}>
      <table className={styles.competitorTable}>
        <thead>
          <tr>
            <th>{t('competitorAnalysis.competitor')}</th>
            <th>{t('competitorAnalysis.status')}</th>
            <th>{t('competitorAnalysis.wordCount')}</th>
            <th>H1/H2/H3</th>
            <th>{t('competitorAnalysis.images')}</th>
            <th>{t('competitorAnalysis.speed')}</th>
            <th>{t('competitorAnalysis.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((competitor) => (
            <tr
              key={competitor.id}
              className={selectedCompetitor?.id === competitor.id ? styles.selectedRow : ''}
              onClick={() => onSelect(competitor)}
            >
              <td>
                <div className={styles.tableCompetitorInfo}>
                  <img
                    src={competitor.favicon || `https://www.google.com/s2/favicons?domain=${competitor.domain}&sz=64`}
                    alt=""
                    className={styles.tableFavicon}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div>
                    <div className={styles.tableCompetitorName}>
                      {competitor.name || competitor.domain}
                    </div>
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.tableCompetitorUrl}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {competitor.domain}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </td>
              <td><ScanStatusBadge competitor={competitor} isScanning={scanningIds.has(competitor.id)} t={t} /></td>
              <td>{competitor.wordCount?.toLocaleString() || '-'}</td>
              <td>
                {competitor.scanStatus === 'COMPLETED'
                  ? `${competitor.h1Count || 0}/${competitor.h2Count || 0}/${competitor.h3Count || 0}`
                  : '-'}
              </td>
              <td>{competitor.imageCount ?? '-'}</td>
              <td>{competitor.ttfb ? `${competitor.ttfb}ms` : '-'}</td>
              <td>
                <div className={styles.tableActions}>
                  <button
                    className={styles.tableActionButton}
                    onClick={(e) => { e.stopPropagation(); onScan(competitor.id); }}
                    disabled={scanningIds.has(competitor.id)}
                    title={t('competitorAnalysis.rescan')}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className={`${styles.tableActionButton} ${styles.danger}`}
                    onClick={(e) => { e.stopPropagation(); onRemove(competitor.id); }}
                    title={t('competitorAnalysis.remove')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
