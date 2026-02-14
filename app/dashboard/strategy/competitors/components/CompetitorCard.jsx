'use client';

import { 
  ExternalLink, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  ChevronRight 
} from 'lucide-react';
import { Skeleton, ScanButton, DeleteButton } from '@/app/dashboard/components';
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

function ScanStatusBadge({ competitor, isScanning, translations }) {
  const t = translations;
  
  if (isScanning) {
    return (
      <span className={`${styles.statusBadge} ${styles.scanning}`}>
        <Loader2 className={styles.spinIcon} size={12} />
        {t.scanning}
      </span>
    );
  }

  switch (competitor.scanStatus) {
    case 'COMPLETED':
      return (
        <span className={`${styles.statusBadge} ${styles.completed}`}>
          <CheckCircle size={12} />
          {t.lastScanned} {formatTimeAgo(competitor.lastScannedAt)}
        </span>
      );
    case 'ERROR':
      return (
        <span className={`${styles.statusBadge} ${styles.error}`}>
          <AlertCircle size={12} />
          {t.scanError}
        </span>
      );
    default:
      return (
        <span className={`${styles.statusBadge} ${styles.pending}`}>
          <Clock size={12} />
          {t.pending}
        </span>
      );
  }
}

export function CompetitorCardSkeleton() {
  return (
    <div className={styles.competitorCard} style={{ pointerEvents: 'none' }}>
      <div className={styles.competitorMain}>
        <div className={styles.competitorInfo}>
          <Skeleton width="24px" height="24px" borderRadius="sm" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width="120px" height="14px" borderRadius="sm" />
            <Skeleton width="160px" height="10px" borderRadius="sm" />
          </div>
        </div>
        <Skeleton width="70px" height="24px" borderRadius="full" />
      </div>
      <div className={styles.metricsRow}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={styles.metric}>
            <Skeleton width="40px" height="14px" borderRadius="sm" />
            <Skeleton width="30px" height="10px" borderRadius="sm" />
          </div>
        ))}
      </div>
      <div className={styles.competitorActions}>
        <Skeleton width="80px" height="30px" borderRadius="md" />
        <Skeleton width="80px" height="30px" borderRadius="md" />
      </div>
    </div>
  );
}

export function CompetitorCard({ competitor, isSelected, isScanning, onSelect, onScan, onRemove, translations }) {
  const t = translations;

  return (
    <div
      className={`${styles.competitorCard} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(competitor)}
    >
      <div className={styles.competitorMain}>
        <div className={styles.competitorInfo}>
          <img
            src={competitor.favicon || `https://www.google.com/s2/favicons?domain=${competitor.domain}&sz=64`}
            alt=""
            className={styles.favicon}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className={styles.competitorDetails}>
            <h4 className={styles.competitorDomain}>
              {competitor.name || competitor.domain}
            </h4>
            {competitor.name && (
              <span className={styles.competitorDomainSmall}>{competitor.domain}</span>
            )}
            <a
              href={competitor.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.competitorUrl}
              onClick={(e) => e.stopPropagation()}
            >
              {competitor.url}
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <ScanStatusBadge competitor={competitor} isScanning={isScanning} translations={t} />
      </div>

      {competitor.scanStatus === 'COMPLETED' && competitor.wordCount && (
        <div className={styles.metricsRow}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{competitor.wordCount?.toLocaleString()}</span>
            <span className={styles.metricLabel}>{t.words}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>
              {competitor.h1Count || 0}/{competitor.h2Count || 0}/{competitor.h3Count || 0}
            </span>
            <span className={styles.metricLabel}>H1/H2/H3</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{competitor.imageCount || 0}</span>
            <span className={styles.metricLabel}>{t.images}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{competitor.ttfb || '-'}</span>
            <span className={styles.metricLabel}>{t.ms}</span>
          </div>
        </div>
      )}

      <div className={styles.competitorActions}>
        <ScanButton
          id={competitor.id}
          isScanning={isScanning}
          onScan={onScan}
          label={t.rescan}
        />
        <DeleteButton
          id={competitor.id}
          onDelete={onRemove}
          label={t.remove}
        />
        <ChevronRight size={16} className={styles.chevron} />
      </div>
    </div>
  );
}
