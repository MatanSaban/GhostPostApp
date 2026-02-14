'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  ExternalLink,
  Globe,
  ArrowRight,
  X,
  Loader2,
  Plug,
  PlugZap,
  AlertCircle,
  Clock,
  Plus,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import { EmptyState, MyWebsitesCardsSkeleton } from '@/app/dashboard/components';
import { Skeleton } from '@/app/dashboard/components/Skeleton';
import { AddSiteModal } from '@/app/components/ui/AddSiteModal';
import styles from './MyWebsitesContent.module.css';

// Platform display labels
const PLATFORM_LABELS = {
  wordpress: 'WordPress',
  shopify: 'Shopify',
  wix: 'Wix',
  squarespace: 'Squarespace',
  webflow: 'Webflow',
  drupal: 'Drupal',
  joomla: 'Joomla',
  custom: 'Custom',
};

function getStatusIcon(status) {
  switch (status) {
    case 'CONNECTED': return <PlugZap size={14} />;
    case 'DISCONNECTED': return <Plug size={14} />;
    case 'ERROR': return <AlertCircle size={14} />;
    case 'PENDING':
    case 'CONNECTING': return <Clock size={14} />;
    default: return <Globe size={14} />;
  }
}

function getStatusKey(status) {
  switch (status) {
    case 'CONNECTED': return 'connected';
    case 'DISCONNECTED': return 'disconnected';
    case 'ERROR': return 'error';
    case 'CONNECTING': return 'connecting';
    case 'PENDING':
    default: return 'pending';
  }
}

export function MyWebsitesContent() {
  const { t, isRtl } = useLocale();
  const { sites, setSites, setSelectedSite, refreshSites, isLoading: isSitesLoading } = useSite();
  const { checkPermission, isOwner, isLoading: isPermissionsLoading } = usePermissions();
  const router = useRouter();

  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gp_my_websites_view') || 'table';
    }
    return 'table';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [renameModal, setRenameModal] = useState(null); // site object or null
  const [removeModal, setRemoveModal] = useState(null); // site object or null
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [toast, setToast] = useState(null);
  const editInputRef = useRef(null);

  // Add Website modal
  const [showAddModal, setShowAddModal] = useState(false);

  const isLoading = isSitesLoading || isPermissionsLoading;
  const canCreate = isOwner || checkPermission('SITES', 'CREATE');
  const canEdit = isOwner || checkPermission('SITES', 'EDIT');
  const canDelete = isOwner || checkPermission('SITES', 'DELETE');

  const filteredSites = sites.filter(site =>
    site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('gp_my_websites_view', mode);
  };

  // Focus rename input when modal opens
  useEffect(() => {
    if (renameModal && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [renameModal]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleManageSite = (site) => {
    setSelectedSite(site);
    // Persist selection
    fetch('/api/sites/select', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: site.id }),
    }).catch(console.error);
    router.push('/dashboard');
  };

  const openRenameModal = (site) => {
    setEditName(site.name);
    setRenameModal(site);
  };

  const handleRename = async () => {
    if (!renameModal || !editName.trim() || editName.trim() === renameModal.name) {
      setRenameModal(null);
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: renameModal.id, name: editName.trim() }),
      });

      if (!res.ok) throw new Error('Failed to rename');

      const data = await res.json();
      // Update sites list locally
      setSites(prev => prev.map(s => s.id === renameModal.id ? { ...s, name: editName.trim() } : s));
      showToast(t('myWebsites.toast.renamed'));
      setRenameModal(null);
    } catch (err) {
      console.error('Rename error:', err);
      showToast(t('myWebsites.toast.renameFailed'), 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!removeModal) return;

    setIsRemoving(true);
    try {
      const res = await fetch(`/api/sites/${removeModal.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to remove');

      // Update sites list locally
      setSites(prev => prev.filter(s => s.id !== removeModal.id));
      showToast(t('myWebsites.toast.removed'));
      setRemoveModal(null);
    } catch (err) {
      console.error('Remove error:', err);
      showToast(t('myWebsites.toast.removeFailed'), 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  // Add Website modal handlers
  const openAddModal = () => setShowAddModal(true);
  const closeAddModal = () => setShowAddModal(false);

  const handleSiteAdded = (site) => {
    showToast(t('myWebsites.toast.added'));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('myWebsites.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {canCreate && (
            <button className={styles.addButton} onClick={openAddModal}>
              <Plus size={16} />
              <span>{t('sites.addSite')}</span>
            </button>
          )}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewButton} ${viewMode === 'table' ? styles.viewButtonActive : ''}`}
              onClick={() => handleViewModeChange('table')}
            title={t('myWebsites.tableView')}
          >
            <List size={18} />
          </button>
            <button
              className={`${styles.viewButton} ${viewMode === 'cards' ? styles.viewButtonActive : ''}`}
              onClick={() => handleViewModeChange('cards')}
              title={t('myWebsites.cardView')}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        /* Loading skeletons */
        viewMode === 'table' ? (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <th key={i}><Skeleton width={`${40 + Math.random() * 40}%`} height="0.75rem" /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div className={styles.siteName}>
                        <Skeleton width="1rem" height="1rem" borderRadius="full" />
                        <Skeleton width="60%" height="0.875rem" />
                      </div>
                    </td>
                    <td><Skeleton width="70%" height="0.8125rem" /></td>
                    <td><Skeleton width="50%" height="0.8125rem" /></td>
                    <td><Skeleton width="5rem" height="1.5rem" borderRadius="full" /></td>
                    <td><Skeleton width="55%" height="0.8125rem" /></td>
                    <td>
                      <div className={styles.actions}>
                        <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
                        <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
                        <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <MyWebsitesCardsSkeleton count={6} />
        )
      ) : filteredSites.length === 0 ? (
        <EmptyState
          iconName="Globe"
          title={searchQuery ? t('common.noResults') : t('myWebsites.empty.title')}
          description={searchQuery ? undefined : t('myWebsites.empty.description')}
        />
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('myWebsites.columns.name')}</th>
                <th>{t('myWebsites.columns.url')}</th>
                <th>{t('myWebsites.columns.platform')}</th>
                <th>{t('myWebsites.columns.status')}</th>
                <th>{t('myWebsites.columns.createdAt')}</th>
                <th>{t('myWebsites.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.map((site) => (
                <tr key={site.id}>
                  <td>
                    <div className={styles.siteName}>
                      <Globe size={16} className={styles.siteIcon} />
                      <span>{site.name}</span>
                    </div>
                  </td>
                  <td>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.siteUrl}
                    >
                      {site.url.replace(/^https?:\/\//, '')}
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  <td>
                    <span className={styles.platform}>
                      {PLATFORM_LABELS[site.platform] || site.platform || '-'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${getStatusKey(site.connectionStatus)}`]}`}>
                      {getStatusIcon(site.connectionStatus)}
                      {t(`myWebsites.status.${getStatusKey(site.connectionStatus)}`)}
                    </span>
                  </td>
                  <td className={styles.dateCell}>{formatDate(site.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleManageSite(site)}
                        title={t('myWebsites.actions.manage')}
                      >
                        <ArrowRight size={16} />
                      </button>
                      {canEdit && (
                        <button
                          className={styles.actionButton}
                          onClick={() => openRenameModal(site)}
                          title={t('myWebsites.actions.rename')}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                          onClick={() => setRemoveModal(site)}
                          title={t('myWebsites.actions.remove')}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Cards View */
        <div className={styles.cardsGrid}>
          {filteredSites.map((site) => (
            <div key={site.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <Globe size={20} className={styles.cardIcon} />
                  <h3>{site.name}</h3>
                </div>
                <span className={`${styles.statusBadge} ${styles[`status_${getStatusKey(site.connectionStatus)}`]}`}>
                  {getStatusIcon(site.connectionStatus)}
                  {t(`myWebsites.status.${getStatusKey(site.connectionStatus)}`)}
                </span>
              </div>

              <div className={styles.cardBody}>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cardUrl}
                >
                  {site.url.replace(/^https?:\/\//, '')}
                  <ExternalLink size={12} />
                </a>

                <div className={styles.cardMeta}>
                  {site.platform && (
                    <span className={styles.cardMetaItem}>
                      {PLATFORM_LABELS[site.platform] || site.platform}
                    </span>
                  )}
                  <span className={styles.cardMetaItem}>
                    {formatDate(site.createdAt)}
                  </span>
                </div>
              </div>

              <div className={styles.cardActions}>
                <button
                  className={styles.cardActionPrimary}
                  onClick={() => handleManageSite(site)}
                >
                  {t('myWebsites.actions.manage')}
                  <ArrowRight size={14} />
                </button>
                <div className={styles.cardActionSecondary}>
                  {canEdit && (
                    <button
                      className={styles.actionButton}
                      onClick={() => openRenameModal(site)}
                      title={t('myWebsites.actions.rename')}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                      onClick={() => setRemoveModal(site)}
                      title={t('myWebsites.actions.remove')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && createPortal(
        <div className={styles.modalOverlay} onClick={() => !isUpdating && setRenameModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{t('myWebsites.renameModal.title')}</h2>
              <button className={styles.modalClose} onClick={() => !isUpdating && setRenameModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.modalLabel}>{t('myWebsites.renameModal.label')}</label>
              <input
                ref={editInputRef}
                type="text"
                className={styles.modalInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('myWebsites.renameModal.placeholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                disabled={isUpdating}
              />
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.modalCancel}
                onClick={() => setRenameModal(null)}
                disabled={isUpdating}
              >
                {t('myWebsites.renameModal.cancel')}
              </button>
              <button
                className={styles.modalConfirm}
                onClick={handleRename}
                disabled={isUpdating || !editName.trim()}
              >
                {isUpdating ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    {t('myWebsites.renameModal.saving')}
                  </>
                ) : (
                  t('myWebsites.renameModal.save')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove Modal */}
      {removeModal && createPortal(
        <div className={styles.modalOverlay} onClick={() => !isRemoving && setRemoveModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{t('myWebsites.removeModal.title')}</h2>
              <button className={styles.modalClose} onClick={() => !isRemoving && setRemoveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.removeWarning}>
                <AlertCircle size={24} />
                <p>{t('myWebsites.removeModal.message').replace('{name}', removeModal.name)}</p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.modalCancel}
                onClick={() => setRemoveModal(null)}
                disabled={isRemoving}
              >
                {t('myWebsites.removeModal.cancel')}
              </button>
              <button
                className={styles.modalDanger}
                onClick={handleRemove}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    {t('myWebsites.removeModal.removing')}
                  </>
                ) : (
                  t('myWebsites.removeModal.confirm')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Website Modal */}
      <AddSiteModal
        isOpen={showAddModal}
        onClose={closeAddModal}
        onSiteAdded={handleSiteAdded}
        showInterviewOnCreate
      />

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
