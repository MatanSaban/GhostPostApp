'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Map, 
  RefreshCw, 
  ExternalLink, 
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
  FolderTree
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { PageHeaderSkeleton, ContentGridSkeleton, StatsGridSkeleton } from '@/app/dashboard/components';
import styles from '../entities.module.css';
import sitemapStyles from './sitemaps.module.css';

// Sitemap type icons and labels
const SITEMAP_TYPE_CONFIG = {
  STANDARD: { icon: FileText, label: 'Standard' },
  INDEX: { icon: FolderTree, label: 'Index' },
  NEWS: { icon: FileText, label: 'News' },
  IMAGE: { icon: FileText, label: 'Image' },
  VIDEO: { icon: FileText, label: 'Video' },
};

// Scan status colors
const SCAN_STATUS_CONFIG = {
  PENDING: { color: 'warning', icon: Clock },
  SCANNING: { color: 'info', icon: Loader2, spinning: true },
  COMPLETED: { color: 'success', icon: CheckCircle },
  ERROR: { color: 'error', icon: AlertCircle },
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

export default function SitemapsPage() {
  const { t } = useLocale();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const [sitemaps, setSitemaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resyncingIds, setResyncingIds] = useState(new Set());
  const [isResyncingAll, setIsResyncingAll] = useState(false);

  const fetchSitemaps = useCallback(async () => {
    if (!selectedSite?.id) {
      setSitemaps([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sitemaps?siteId=${selectedSite.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sitemaps');
      }
      const data = await response.json();
      setSitemaps(data.sitemaps || []);
    } catch (err) {
      console.error('Error fetching sitemaps:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite?.id]);

  useEffect(() => {
    fetchSitemaps();
  }, [fetchSitemaps]);

  // Resync a single sitemap
  const handleResyncSitemap = async (sitemapId, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (resyncingIds.has(sitemapId) || isResyncingAll) return;

    setResyncingIds(prev => new Set([...prev, sitemapId]));
    setError(null);

    try {
      const response = await fetch(`/api/sitemaps/${sitemapId}/resync`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resync sitemap');
      }

      // Refresh sitemaps list
      await fetchSitemaps();
    } catch (err) {
      console.error('Error resyncing sitemap:', err);
      setError(err.message);
    } finally {
      setResyncingIds(prev => {
        const next = new Set(prev);
        next.delete(sitemapId);
        return next;
      });
    }
  };

  // Resync all sitemaps
  const handleResyncAll = async () => {
    if (isResyncingAll || sitemaps.length === 0) return;

    setIsResyncingAll(true);
    setError(null);

    try {
      // Resync sitemaps sequentially to avoid overloading
      for (const sitemap of sitemaps) {
        await fetch(`/api/sitemaps/${sitemap.id}/resync`, {
          method: 'POST',
        });
      }

      // Refresh sitemaps list
      await fetchSitemaps();
    } catch (err) {
      console.error('Error resyncing all sitemaps:', err);
      setError(err.message);
    } finally {
      setIsResyncingAll(false);
    }
  };

  // Calculate stats
  const stats = {
    total: sitemaps.length,
    indexes: sitemaps.filter(s => s.isIndex).length,
    totalUrls: sitemaps.reduce((sum, s) => sum + (s.urlCount || 0), 0),
    lastScanned: sitemaps.reduce((latest, s) => {
      if (!s.lastScannedAt) return latest;
      const date = new Date(s.lastScannedAt);
      return !latest || date > latest ? date : latest;
    }, null),
  };

  // Group sitemaps by parent (for hierarchical display)
  const indexSitemaps = sitemaps.filter(s => s.isIndex);
  const childSitemaps = sitemaps.filter(s => !s.isIndex && s.parentId);
  const standaloneSitemaps = sitemaps.filter(s => !s.isIndex && !s.parentId);

  if (!selectedSite) {
    if (isSiteLoading) {
      return (
        <div className={styles.container}>
          <PageHeaderSkeleton hasActions />
          <StatsGridSkeleton count={4} />
          <ContentGridSkeleton count={4} columns={2} />
        </div>
      );
    }
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Map size={48} />
          <h3>{t('entities.sitemaps.noSite')}</h3>
          <p>{t('entities.sitemaps.selectSiteFirst')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('entities.sitemaps.title')}</h1>
          <p className={styles.pageSubtitle}>{t('entities.sitemaps.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.secondaryButton}
            onClick={fetchSitemaps}
            disabled={isLoading || isResyncingAll}
          >
            <RefreshCw size={16} className={isLoading ? sitemapStyles.spinning : ''} />
            {t('common.refresh')}
          </button>
          {sitemaps.length > 0 && (
            <button 
              className={sitemapStyles.resyncButton}
              onClick={handleResyncAll}
              disabled={isLoading || isResyncingAll || resyncingIds.size > 0}
            >
              <RefreshCw size={16} className={isResyncingAll ? sitemapStyles.spinning : ''} />
              {isResyncingAll ? t('entities.sitemaps.resyncAllProgress') : t('entities.sitemaps.resyncAll')}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={sitemapStyles.statsGrid}>
        <div className={sitemapStyles.statCard}>
          <div className={sitemapStyles.statValue}>{stats.total}</div>
          <div className={sitemapStyles.statLabel}>{t('entities.sitemaps.stats.total')}</div>
        </div>
        <div className={sitemapStyles.statCard}>
          <div className={sitemapStyles.statValue}>{stats.indexes}</div>
          <div className={sitemapStyles.statLabel}>{t('entities.sitemaps.stats.indexes')}</div>
        </div>
        <div className={sitemapStyles.statCard}>
          <div className={sitemapStyles.statValue}>{stats.totalUrls.toLocaleString()}</div>
          <div className={sitemapStyles.statLabel}>{t('entities.sitemaps.stats.totalUrls')}</div>
        </div>
        <div className={sitemapStyles.statCard}>
          <div className={sitemapStyles.statValue}>
            {stats.lastScanned ? formatDate(stats.lastScanned, 'short') : '-'}
          </div>
          <div className={sitemapStyles.statLabel}>{t('entities.sitemaps.stats.lastScanned')}</div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className={sitemapStyles.errorBanner}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <ContentGridSkeleton count={6} columns={2} />
      )}

      {/* Empty State */}
      {!isLoading && sitemaps.length === 0 && (
        <div className={styles.emptyState}>
          <Map size={48} />
          <h3>{t('entities.sitemaps.empty.title')}</h3>
          <p>{t('entities.sitemaps.empty.description')}</p>
          <Link href="/dashboard/entities" className={styles.primaryButton}>
            {t('entities.sitemaps.empty.scanNow')}
          </Link>
        </div>
      )}

      {/* Sitemaps List */}
      {!isLoading && sitemaps.length > 0 && (
        <div className={sitemapStyles.sitemapsList}>
          {/* Index Sitemaps with their children */}
          {indexSitemaps.map(sitemap => {
            const children = childSitemaps.filter(s => s.parentId === sitemap.id);
            const StatusIcon = SCAN_STATUS_CONFIG[sitemap.scanStatus]?.icon || Clock;
            const statusConfig = SCAN_STATUS_CONFIG[sitemap.scanStatus] || SCAN_STATUS_CONFIG.PENDING;

            return (
              <div key={sitemap.id} className={sitemapStyles.sitemapGroup}>
                <Link 
                  href={`/dashboard/entities/sitemaps/${sitemap.id}`}
                  className={sitemapStyles.sitemapCard}
                >
                  <div className={sitemapStyles.sitemapIcon}>
                    <FolderTree size={24} />
                  </div>
                  <div className={sitemapStyles.sitemapInfo}>
                    <div className={sitemapStyles.sitemapUrl}>{sitemap.url}</div>
                    <div className={sitemapStyles.sitemapMeta}>
                      <span className={`${sitemapStyles.badge} ${sitemapStyles.badgeIndex}`}>
                        {t('entities.sitemaps.type.index')}
                      </span>
                      <span className={sitemapStyles.metaItem}>
                        {children.length} {t('entities.sitemaps.childSitemaps')}
                      </span>
                      <span className={`${sitemapStyles.statusBadge} ${sitemapStyles[`status${statusConfig.color}`]}`}>
                        <StatusIcon size={14} className={statusConfig.spinning ? sitemapStyles.spinning : ''} />
                        {t(`entities.sitemaps.status.${sitemap.scanStatus.toLowerCase()}`)}
                      </span>
                    </div>
                  </div>
                  <div className={sitemapStyles.sitemapActions}>
                    <button 
                      type="button"
                      className={sitemapStyles.resyncIconButton}
                      onClick={(e) => handleResyncSitemap(sitemap.id, e)}
                      disabled={resyncingIds.has(sitemap.id) || isResyncingAll}
                      title={t('entities.sitemaps.resync')}
                    >
                      <RefreshCw size={16} className={resyncingIds.has(sitemap.id) ? sitemapStyles.spinning : ''} />
                    </button>
                    <button 
                      type="button"
                      className={sitemapStyles.externalLink}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(sitemap.url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink size={16} />
                    </button>
                    <ChevronRight size={20} className={sitemapStyles.chevron} />
                  </div>
                </Link>

                {/* Child sitemaps */}
                {children.length > 0 && (
                  <div className={sitemapStyles.childSitemaps}>
                    {children.map(child => {
                      const ChildStatusIcon = SCAN_STATUS_CONFIG[child.scanStatus]?.icon || Clock;
                      const childStatusConfig = SCAN_STATUS_CONFIG[child.scanStatus] || SCAN_STATUS_CONFIG.PENDING;

                      return (
                        <Link 
                          key={child.id}
                          href={`/dashboard/entities/sitemaps/${child.id}`}
                          className={`${sitemapStyles.sitemapCard} ${sitemapStyles.childCard}`}
                        >
                          <div className={sitemapStyles.sitemapIcon}>
                            <FileText size={20} />
                          </div>
                          <div className={sitemapStyles.sitemapInfo}>
                            <div className={sitemapStyles.sitemapUrl}>{child.url}</div>
                            <div className={sitemapStyles.sitemapMeta}>
                              <span className={sitemapStyles.metaItem}>
                                {child.urlCount.toLocaleString()} URLs
                              </span>
                              {child.entityTypes?.length > 0 && (
                                <span className={sitemapStyles.metaItem}>
                                  {child.entityTypes.join(', ')}
                                </span>
                              )}
                              <span className={`${sitemapStyles.statusBadge} ${sitemapStyles[`status${childStatusConfig.color}`]}`}>
                                <ChildStatusIcon size={14} className={childStatusConfig.spinning ? sitemapStyles.spinning : ''} />
                                {t(`entities.sitemaps.status.${child.scanStatus.toLowerCase()}`)}
                              </span>
                            </div>
                          </div>
                          <div className={sitemapStyles.sitemapActions}>
                            <button 
                              type="button"
                              className={sitemapStyles.resyncIconButton}
                              onClick={(e) => handleResyncSitemap(child.id, e)}
                              disabled={resyncingIds.has(child.id) || isResyncingAll}
                              title={t('entities.sitemaps.resync')}
                            >
                              <RefreshCw size={16} className={resyncingIds.has(child.id) ? sitemapStyles.spinning : ''} />
                            </button>
                            <button 
                              type="button"
                              className={sitemapStyles.externalLink}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(child.url, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              <ExternalLink size={16} />
                            </button>
                            <ChevronRight size={20} className={sitemapStyles.chevron} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone Sitemaps (no parent) */}
          {standaloneSitemaps.map(sitemap => {
            const StatusIcon = SCAN_STATUS_CONFIG[sitemap.scanStatus]?.icon || Clock;
            const statusConfig = SCAN_STATUS_CONFIG[sitemap.scanStatus] || SCAN_STATUS_CONFIG.PENDING;

            return (
              <Link 
                key={sitemap.id}
                href={`/dashboard/entities/sitemaps/${sitemap.id}`}
                className={sitemapStyles.sitemapCard}
              >
                <div className={sitemapStyles.sitemapIcon}>
                  <FileText size={24} />
                </div>
                <div className={sitemapStyles.sitemapInfo}>
                  <div className={sitemapStyles.sitemapUrl}>{sitemap.url}</div>
                  <div className={sitemapStyles.sitemapMeta}>
                    <span className={sitemapStyles.metaItem}>
                      {sitemap.urlCount.toLocaleString()} URLs
                    </span>
                    {sitemap.entityTypes?.length > 0 && (
                      <span className={sitemapStyles.metaItem}>
                        {sitemap.entityTypes.join(', ')}
                      </span>
                    )}
                    <span className={`${sitemapStyles.statusBadge} ${sitemapStyles[`status${statusConfig.color}`]}`}>
                      <StatusIcon size={14} className={statusConfig.spinning ? sitemapStyles.spinning : ''} />
                      {t(`entities.sitemaps.status.${sitemap.scanStatus.toLowerCase()}`)}
                    </span>
                  </div>
                </div>
                <div className={sitemapStyles.sitemapActions}>
                  <button 
                    type="button"
                    className={sitemapStyles.resyncIconButton}
                    onClick={(e) => handleResyncSitemap(sitemap.id, e)}
                    disabled={resyncingIds.has(sitemap.id) || isResyncingAll}
                    title={t('entities.sitemaps.resync')}
                  >
                    <RefreshCw size={16} className={resyncingIds.has(sitemap.id) ? sitemapStyles.spinning : ''} />
                  </button>
                  <button 
                    type="button"
                    className={sitemapStyles.externalLink}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(sitemap.url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <ExternalLink size={16} />
                  </button>
                  <ChevronRight size={20} className={sitemapStyles.chevron} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
