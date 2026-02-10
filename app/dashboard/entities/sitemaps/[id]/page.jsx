'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft,
  RefreshCw, 
  ExternalLink, 
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
  FolderTree,
  User,
  Calendar,
  Link as LinkIcon,
  Bot
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { DetailPageSkeleton } from '@/app/dashboard/components';
import styles from '../../entities.module.css';
import sitemapStyles from '../sitemaps.module.css';

// Scan status config
const SCAN_STATUS_CONFIG = {
  PENDING: { color: 'warning', icon: Clock, label: 'Pending' },
  SCANNING: { color: 'info', icon: Loader2, spinning: true, label: 'Scanning' },
  COMPLETED: { color: 'success', icon: CheckCircle, label: 'Completed' },
  ERROR: { color: 'error', icon: AlertCircle, label: 'Error' },
};

// Format date helper
function formatDate(date, format = 'short') {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  if (format === 'short') {
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Format date and time helper
function formatDateTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function SingleSitemapPage() {
  const { t } = useLocale();
  const { selectedSite } = useSite();
  const params = useParams();
  const router = useRouter();
  const sitemapId = params.id;
  
  const [sitemap, setSitemap] = useState(null);
  const [urls, setUrls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResyncing, setIsResyncing] = useState(false);
  const [error, setError] = useState(null);
  const [resyncResult, setResyncResult] = useState(null);

  const fetchSitemap = useCallback(async () => {
    if (!sitemapId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sitemaps/${sitemapId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Sitemap not found');
        }
        throw new Error('Failed to fetch sitemap');
      }
      const data = await response.json();
      setSitemap(data.sitemap);
      setUrls(data.urls || []);
    } catch (err) {
      console.error('Error fetching sitemap:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [sitemapId]);

  useEffect(() => {
    fetchSitemap();
  }, [fetchSitemap]);

  const handleResync = async () => {
    if (!sitemap || isResyncing) return;

    setIsResyncing(true);
    setResyncResult(null);
    setError(null);

    try {
      const response = await fetch(`/api/sitemaps/${sitemapId}/resync`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resync sitemap');
      }

      const data = await response.json();
      setResyncResult(data);
      
      // Refresh sitemap data
      await fetchSitemap();
    } catch (err) {
      console.error('Error resyncing sitemap:', err);
      setError(err.message);
    } finally {
      setIsResyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className={sitemapStyles.singleContainer}>
        <Link href="/dashboard/entities/sitemaps" className={sitemapStyles.backLink}>
          <ArrowLeft size={16} />
          {t('entities.sitemaps.backToList')}
        </Link>
        <DetailPageSkeleton />
      </div>
    );
  }

  if (error && !sitemap) {
    return (
      <div className={sitemapStyles.singleContainer}>
        <Link href="/dashboard/entities/sitemaps" className={sitemapStyles.backLink}>
          <ArrowLeft size={16} />
          {t('entities.sitemaps.backToList')}
        </Link>
        <div className={styles.emptyState}>
          <AlertCircle size={48} />
          <h3>{t('entities.sitemaps.notFound')}</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const statusConfig = SCAN_STATUS_CONFIG[sitemap?.scanStatus] || SCAN_STATUS_CONFIG.PENDING;
  const StatusIcon = statusConfig.icon;

  return (
    <div className={sitemapStyles.singleContainer}>
      {/* Back Link */}
      <Link href="/dashboard/entities/sitemaps" className={sitemapStyles.backLink}>
        <ArrowLeft size={16} />
        {t('entities.sitemaps.backToList')}
      </Link>

      {/* Sitemap Header */}
      <div className={sitemapStyles.sitemapHeader}>
        <div className={sitemapStyles.sitemapHeaderTop}>
          <div className={sitemapStyles.sitemapHeaderInfo}>
            <h1 className={sitemapStyles.sitemapTitle}>
              {sitemap.isIndex ? (
                <FolderTree size={28} style={{ marginInlineEnd: '0.5rem', verticalAlign: 'middle' }} />
              ) : (
                <FileText size={28} style={{ marginInlineEnd: '0.5rem', verticalAlign: 'middle' }} />
              )}
              {sitemap.url}
            </h1>
            <div className={sitemapStyles.sitemapHeaderMeta}>
              <span className={`${sitemapStyles.statusBadge} ${sitemapStyles[`status${statusConfig.color}`]}`}>
                <StatusIcon size={14} className={statusConfig.spinning ? sitemapStyles.spinning : ''} />
                {t(`entities.sitemaps.status.${sitemap.scanStatus.toLowerCase()}`)}
              </span>
              {sitemap.isIndex && (
                <span className={`${sitemapStyles.badge} ${sitemapStyles.badgeIndex}`}>
                  {t('entities.sitemaps.type.index')}
                </span>
              )}
              <span className={sitemapStyles.metaGroup}>
                <LinkIcon size={14} />
                {sitemap.urlCount.toLocaleString()} URLs
              </span>
              {sitemap.entityTypes?.length > 0 && (
                <span className={sitemapStyles.metaGroup}>
                  {sitemap.entityTypes.join(', ')}
                </span>
              )}
            </div>
          </div>
          <div className={sitemapStyles.sitemapHeaderActions}>
            <a 
              href={sitemap.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.secondaryButton}
            >
              <ExternalLink size={16} />
              {t('common.openInNewTab')}
            </a>
            <button
              className={sitemapStyles.resyncButton}
              onClick={handleResync}
              disabled={isResyncing}
            >
              <RefreshCw size={16} className={isResyncing ? sitemapStyles.spinning : ''} />
              {isResyncing ? t('entities.sitemaps.resyncing') : t('entities.sitemaps.resync')}
            </button>
          </div>
        </div>

        {/* Scan Info */}
        <div className={sitemapStyles.scanInfoCard}>
          <h3 className={sitemapStyles.scanInfoTitle}>{t('entities.sitemaps.lastScanInfo')}</h3>
          <div className={sitemapStyles.scanInfoGrid}>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.scanDate')}</span>
              <span className={sitemapStyles.scanInfoValue}>
                <Calendar size={14} style={{ marginInlineEnd: '0.375rem', verticalAlign: 'middle' }} />
                {sitemap.lastScannedAt 
                  ? formatDateTime(new Date(sitemap.lastScannedAt)) 
                  : t('entities.sitemaps.neverScanned')
                }
              </span>
            </div>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.scannedBy')}</span>
              <span className={sitemapStyles.scanInfoValue}>
                {sitemap.scannedByUser ? (
                  <>
                    <User size={14} style={{ marginInlineEnd: '0.375rem', verticalAlign: 'middle' }} />
                    {sitemap.scannedByUser.firstName} {sitemap.scannedByUser.lastName}
                  </>
                ) : sitemap.lastScannedAt ? (
                  <>
                    <Bot size={14} style={{ marginInlineEnd: '0.375rem', verticalAlign: 'middle' }} />
                    {t('entities.sitemaps.system')}
                  </>
                ) : (
                  '-'
                )}
              </span>
            </div>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.urlsFound')}</span>
              <span className={sitemapStyles.scanInfoValue}>
                {sitemap.urlCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {sitemap.scanError && (
          <div className={sitemapStyles.errorBanner}>
            <AlertCircle size={18} />
            <span>{sitemap.scanError}</span>
          </div>
        )}
      </div>

      {/* Resync Result */}
      {resyncResult && (
        <div className={`${sitemapStyles.scanInfoCard} ${resyncResult.newEntities > 0 ? sitemapStyles.statussuccess : ''}`}>
          <h3 className={sitemapStyles.scanInfoTitle}>
            <CheckCircle size={18} style={{ marginInlineEnd: '0.5rem', color: 'var(--color-success)' }} />
            {t('entities.sitemaps.resyncComplete')}
          </h3>
          <div className={sitemapStyles.scanInfoGrid}>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.urlsScanned')}</span>
              <span className={sitemapStyles.scanInfoValue}>{resyncResult.urlsScanned || 0}</span>
            </div>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.newEntities')}</span>
              <span className={sitemapStyles.scanInfoValue}>{resyncResult.newEntities || 0}</span>
            </div>
            <div className={sitemapStyles.scanInfoItem}>
              <span className={sitemapStyles.scanInfoLabel}>{t('entities.sitemaps.updatedEntities')}</span>
              <span className={sitemapStyles.scanInfoValue}>{resyncResult.updatedEntities || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* URLs Preview */}
      {urls.length > 0 && (
        <div className={sitemapStyles.urlPreview}>
          <div className={sitemapStyles.urlPreviewHeader}>
            <h3 className={sitemapStyles.urlPreviewTitle}>{t('entities.sitemaps.urlsInSitemap')}</h3>
            <span className={sitemapStyles.urlPreviewCount}>
              {t('entities.sitemaps.showingUrls', { count: Math.min(urls.length, 100), total: sitemap.urlCount })}
            </span>
          </div>
          <div className={sitemapStyles.urlList}>
            {urls.slice(0, 100).map((url, index) => (
              <div key={index} className={sitemapStyles.urlItem}>
                <a 
                  href={url.loc || url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={sitemapStyles.urlItemUrl}
                >
                  {url.loc || url}
                </a>
                {url.lastmod && (
                  <span className={sitemapStyles.urlItemDate}>
                    {formatDate(new Date(url.lastmod), 'short')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Content Preview (optional - for debugging) */}
      {sitemap.content && process.env.NODE_ENV === 'development' && (
        <details>
          <summary style={{ cursor: 'pointer', padding: '0.5rem', color: 'var(--muted-foreground)' }}>
            {t('entities.sitemaps.rawContent')}
          </summary>
          <pre className={sitemapStyles.contentPreview}>
            {sitemap.content.substring(0, 5000)}
            {sitemap.content.length > 5000 && '...\n\n(truncated)'}
          </pre>
        </details>
      )}
    </div>
  );
}
