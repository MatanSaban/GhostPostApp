'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Edit,
  Trash2,
  RefreshCw,
  BarChart2,
  AlertTriangle,
  CheckCircle,
  Download,
  ArrowUpDown,
  Loader2,
  Info,
  X,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { RedirectForm } from './components';
import { Button } from '@/app/dashboard/components';
import styles from './page.module.css';

export default function RedirectionsPage() {
  const { t } = useLocale();
  const { selectedSite, isLoading: isSiteLoading } = useSite();

  const [redirections, setRedirections] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, totalHits: 0 });
  const [detectedPlugins, setDetectedPlugins] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isWordPress, setIsWordPress] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [editingRedirect, setEditingRedirect] = useState(null);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [columnInfoPopup, setColumnInfoPopup] = useState(null);
  const [toast, setToast] = useState(null);

  // Fetch redirections from API
  const fetchRedirections = useCallback(async () => {
    if (!selectedSite?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/sites/${selectedSite.id}/redirections`);
      if (!res.ok) throw new Error('Failed to fetch redirections');
      
      const data = await res.json();
      setRedirections(data.redirections || []);
      setStats(data.stats || { total: 0, active: 0, totalHits: 0 });
      setDetectedPlugins(data.detectedPlugins || []);
      setIsConnected(data.isConnected || false);
      setIsWordPress(data.isWordPress || false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite?.id]);

  useEffect(() => {
    fetchRedirections();
  }, [fetchRedirections]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Create redirect
  const handleCreate = async (data) => {
    try {
      const res = await fetch(`/api/sites/${selectedSite.id}/redirections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create redirect');
      }
      
      await fetchRedirections();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Update redirect
  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/sites/${selectedSite.id}/redirections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update redirect');
      }
      
      setEditingRedirect(null);
      await fetchRedirections();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Delete redirect
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/sites/${selectedSite.id}/redirections/${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to delete redirect');
      
      await fetchRedirections();
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle active/inactive
  const handleToggle = async (id, isActive) => {
    setTogglingId(id);
    // Optimistic update
    setRedirections(prev => prev.map(r => r.id === id ? { ...r, isActive: !isActive } : r));
    setStats(prev => ({
      ...prev,
      active: isActive ? prev.active - 1 : prev.active + 1,
    }));
    try {
      await fetch(`/api/sites/${selectedSite.id}/redirections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
    } catch (err) {
      // Revert on error
      setRedirections(prev => prev.map(r => r.id === id ? { ...r, isActive } : r));
      setStats(prev => ({
        ...prev,
        active: isActive ? prev.active : prev.active - 1,
      }));
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  // Sync with WordPress
  const handleSync = async (direction) => {
    if (!selectedSite?.id) return;
    
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    
    try {
      const res = await fetch(`/api/sites/${selectedSite.id}/redirections/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Sync failed');
      }
      
      const result = await res.json();
      
      if (direction === 'from-wp') {
        const msg = t('redirections.syncImported').replace('{imported}', result.imported).replace('{skipped}', result.skipped);
        setSyncMessage(msg);
        setToast({ type: 'success', message: msg });
      } else if (direction === 'to-wp') {
        const msg = t('redirections.syncPushed').replace('{count}', result.count);
        setSyncMessage(msg);
        setToast({ type: 'success', message: msg });
      } else if (direction === 'import-external') {
        const msg = t('redirections.syncImportedExternal').replace('{imported}', result.platformImported).replace('{source}', result.source);
        setSyncMessage(msg);
        setToast({ type: 'success', message: msg });
      }
      
      await fetchRedirections();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Form submit handler
  const handleFormSubmit = async (data) => {
    if (editingRedirect) {
      return handleUpdate(editingRedirect.id, data);
    }
    return handleCreate(data);
  };

  // Get type display
  const getTypeCode = (type) => {
    const typeMap = { PERMANENT: '301', TEMPORARY: '302', FOUND: '307' };
    return typeMap[type] || type;
  };

  const successRate = stats.total > 0 
    ? Math.round((stats.active / stats.total) * 100) + '%' 
    : '100%';

  // Loading skeleton
  if (isSiteLoading || isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <div className={styles.headerContent}>
            <h1 className={styles.pageTitle}>{t('redirections.title')}</h1>
            <p className={styles.pageSubtitle}>{t('redirections.subtitle')}</p>
          </div>
        </div>
        <div className={styles.loadingState}>
          <Loader2 className={styles.spinner} size={32} />
        </div>
      </div>
    );
  }

  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ArrowUpDown size={48} />
          <p>{t('common.selectSite') || 'Please select a site'}</p>
        </div>
      </div>
    );
  }

  const formTranslations = {
    createNew: t('redirections.createNew'),
    fromUrl: t('redirections.fromUrl'),
    fromUrlPlaceholder: t('redirections.fromUrlPlaceholder'),
    toUrl: t('redirections.toUrl'),
    toUrlPlaceholder: t('redirections.toUrlPlaceholder'),
    type: t('redirections.type'),
    permanent: t('redirections.permanent'),
    temporary: t('redirections.temporary'),
    add: t('common.add'),
    update: t('common.save') || 'Save',
    cancel: t('common.cancel') || 'Cancel',
    editRedirect: t('redirections.editRedirect'),
    temporaryRedirect: t('redirections.temporaryRedirect'),
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('redirections.title')}</h1>
          <p className={styles.pageSubtitle}>{t('redirections.subtitle')}</p>
        </div>
        {isConnected && isWordPress && (
          <div className={styles.syncActions}>
            <Button 
              onClick={() => handleSync('from-wp')}
              disabled={isSyncing}
            >
              <Download size={16} />
              {isSyncing ? '...' : t('redirections.syncFromWp')}
            </Button>
            <Button 
              onClick={() => handleSync('to-wp')}
              disabled={isSyncing}
            >
              <ArrowUpDown size={16} />
              {isSyncing ? '...' : t('redirections.pushToWp')}
            </Button>
          </div>
        )}
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div className={styles.syncMessage}>
          <CheckCircle size={16} />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorMessage}>
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button className={styles.dismissButton} onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Detected external redirect plugins banner */}
      {detectedPlugins.length > 0 && (
        <div className={styles.detectedBanner}>
          <div className={styles.bannerIcon}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.bannerContent}>
            <h3>{t('redirections.externalPluginDetected')}</h3>
            <p>
              {t('redirections.externalPluginDescription').replace('{plugins}', detectedPlugins.map(p => p.name).join(', '))}
            </p>
            <Button 
              variant="warning"
              onClick={() => handleSync('import-external')}
              disabled={isSyncing}
            >
              <Download size={16} />
              {isSyncing ? t('redirections.importing') : t('redirections.importRedirects')}
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statPurple}`}>
            <RefreshCw size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats.active}</span>
            <span className={styles.statLabel}>{t('redirections.activeRedirects')}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statBlue}`}>
            <BarChart2 size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats.totalHits.toLocaleString()}</span>
            <span className={styles.statLabel}>{t('redirections.totalHits')}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statOrange}`}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats.total - stats.active}</span>
            <span className={styles.statLabel}>{t('redirections.disabled')}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statGreen}`}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{successRate}</span>
            <span className={styles.statLabel}>{t('redirections.successRate')}</span>
          </div>
        </div>
      </div>

      {/* Create/Edit Redirect Form */}
      <RedirectForm 
        translations={formTranslations}
        onSubmit={handleFormSubmit}
        editingRedirect={editingRedirect}
        onCancel={() => setEditingRedirect(null)}
      />

      {/* Redirects Table */}
      <div className={styles.tableCard}>
        <h3 className={styles.cardTitle}>
          {t('redirections.activeRedirects')}
          <span className={styles.countBadge}>{redirections.length}</span>
        </h3>
        
        {redirections.length === 0 ? (
          <div className={styles.emptyState}>
            <ArrowUpDown size={48} />
            <p>{t('redirections.noRedirects')}</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  {[
                    { key: 'status', label: t('redirections.status'), width: '6.5rem' },
                    { key: 'from', label: t('redirections.from') },
                    { key: 'to', label: t('redirections.to') },
                    { key: 'type', label: t('redirections.type'), width: '5rem' },
                    { key: 'hits', label: t('redirections.hits'), width: '5rem' },
                  ].map(col => (
                    <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                      <span
                        className={styles.thLabel}
                        data-tooltip={t(`redirections.tooltips.${col.key}`)}
                        onClick={() => setColumnInfoPopup(col.key)}
                      >
                        {col.label}
                        <Info size={11} className={styles.thInfoIcon} />
                      </span>
                    </th>
                  ))}
                  <th style={{ width: '5rem' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {redirections.map((redirect) => (
                  <tr key={redirect.id} className={!redirect.isActive ? styles.inactiveRow : ''}>
                    <td>
                      <button
                        className={`${styles.statusToggle} ${redirect.isActive ? styles.statusActive : styles.statusInactive}`}
                        onClick={() => handleToggle(redirect.id, redirect.isActive)}
                        disabled={togglingId === redirect.id}
                      >
                        {togglingId === redirect.id ? (
                          <Loader2 size={12} className={styles.spinner} />
                        ) : (
                          <span className={styles.statusDot} />
                        )}
                        <span className={styles.statusLabel}>
                          {redirect.isActive ? t('redirections.active') : t('redirections.inactive')}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={styles.urlPath} dir="ltr">{redirect.sourceUrl}</span>
                    </td>
                    <td>
                      <span className={styles.urlPath} dir="ltr">{redirect.targetUrl}</span>
                    </td>
                    <td>
                      <span className={`${styles.typeBadge} ${styles[`type${getTypeCode(redirect.type)}`]}`}>
                        {getTypeCode(redirect.type)}
                      </span>
                    </td>
                    <td>
                      {redirect.hitCount.toLocaleString()}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Button 
                          variant="icon"
                          onClick={() => setEditingRedirect(redirect)}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button 
                          variant="icon"
                          iconDanger
                          onClick={() => handleDelete(redirect.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Column Info Popup */}
      {columnInfoPopup && typeof document !== 'undefined' && createPortal(
        <div className={styles.columnPopupOverlay} onClick={() => setColumnInfoPopup(null)}>
          <div className={styles.columnPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.columnPopupClose} onClick={() => setColumnInfoPopup(null)}>
              <X size={18} />
            </button>
            <div className={styles.columnPopupHeader}>
              <div className={styles.columnPopupIconBadge}>
                <Info size={22} />
              </div>
              <h3 className={styles.columnPopupTitle}>
                {t(`redirections.info.${columnInfoPopup}.title`)}
              </h3>
            </div>
            <div className={styles.columnPopupSection}>
              <p className={styles.columnPopupDescription}>
                {t(`redirections.info.${columnInfoPopup}.description`)}
              </p>
            </div>
            <div className={styles.columnPopupSection}>
              <p className={styles.columnPopupDetails}>
                {t(`redirections.info.${columnInfoPopup}.details`)}
              </p>
            </div>
            <button className={styles.columnPopupDismiss} onClick={() => setColumnInfoPopup(null)}>
              {t('redirections.info.gotIt')}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
          <CheckCircle size={16} />
          {toast.message}
        </div>
      )}
    </div>
  );
}
