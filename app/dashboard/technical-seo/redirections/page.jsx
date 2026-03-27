'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Power,
  PowerOff,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { RedirectForm } from './components';
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
    try {
      await fetch(`/api/sites/${selectedSite.id}/redirections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      
      await fetchRedirections();
    } catch (err) {
      setError(err.message);
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
        setSyncMessage(t('redirections.syncImported').replace('{imported}', result.imported).replace('{skipped}', result.skipped));
      } else if (direction === 'to-wp') {
        setSyncMessage(t('redirections.syncPushed').replace('{count}', result.count));
      } else if (direction === 'import-external') {
        setSyncMessage(t('redirections.syncImportedExternal').replace('{imported}', result.platformImported).replace('{source}', result.source));
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
            <button 
              className={styles.syncButton}
              onClick={() => handleSync('from-wp')}
              disabled={isSyncing}
            >
              <Download size={16} />
              {isSyncing ? '...' : t('redirections.syncFromWp')}
            </button>
            <button 
              className={styles.syncButton}
              onClick={() => handleSync('to-wp')}
              disabled={isSyncing}
            >
              <ArrowUpDown size={16} />
              {isSyncing ? '...' : t('redirections.pushToWp')}
            </button>
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
            <button 
              className={styles.importButton}
              onClick={() => handleSync('import-external')}
              disabled={isSyncing}
            >
              <Download size={16} />
              {isSyncing ? t('redirections.importing') : t('redirections.importRedirects')}
            </button>
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
          <>
            <div className={styles.tableHeader}>
              <span>{t('redirections.from')}</span>
              <span>{t('redirections.to')}</span>
              <span>{t('redirections.type')}</span>
              <span>{t('redirections.hits')}</span>
              <span>{t('common.actions')}</span>
            </div>
            <div className={styles.tableBody}>
              {redirections.map((redirect) => (
                <div 
                  key={redirect.id} 
                  className={`${styles.tableRow} ${!redirect.isActive ? styles.inactiveRow : ''}`}
                >
                  <div className={`${styles.urlCell} ${styles.fromUrl}`}>
                    <span className={styles.urlPath}>{redirect.sourceUrl}</span>
                  </div>
                  <div className={`${styles.urlCell} ${styles.toUrl}`}>
                    <span className={styles.urlPath}>{redirect.targetUrl}</span>
                  </div>
                  <div className={`${styles.cell} ${styles.typeCell}`}>
                    <span className={`${styles.typeBadge} ${styles[`type${getTypeCode(redirect.type)}`]}`}>
                      {getTypeCode(redirect.type)}
                    </span>
                  </div>
                  <div className={`${styles.cell} ${styles.hitsCell}`}>
                    {redirect.hitCount.toLocaleString()}
                  </div>
                  <div className={styles.actions}>
                    <button 
                      className={styles.actionButton}
                      onClick={() => handleToggle(redirect.id, redirect.isActive)}
                      title={redirect.isActive ? t('redirections.disable') : t('redirections.enable')}
                    >
                      {redirect.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    <button 
                      className={styles.actionButton}
                      onClick={() => setEditingRedirect(redirect)}
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      className={`${styles.actionButton} ${styles.delete}`}
                      onClick={() => handleDelete(redirect.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
