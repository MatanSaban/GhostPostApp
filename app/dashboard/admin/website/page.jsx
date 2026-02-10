'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Edit2,
  Download,
  Upload,
  Globe,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, FormInput, FormTextarea, PrimaryButton, SecondaryButton, FormActions } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton } from '@/app/dashboard/components';
import styles from './website.module.css';
import adminStyles from '../admin.module.css';

// Available website locales
const WEBSITE_LOCALES = [
  { locale: 'en', name: 'English' },
  { locale: 'fr', name: 'French' },
  { locale: 'he', name: 'Hebrew' },
];

export default function WebsiteContentPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  // State
  const [loading, setLoading] = useState(true);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNs, setSelectedNs] = useState('__ALL__');
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedLocale, setSelectedLocale] = useState('en');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [rowsLimit, setRowsLimit] = useState(100);
  const [totalCount, setTotalCount] = useState(0);

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Fetch data
  const fetchAll = useCallback(async (ns, limit) => {
    setLoading(true);
    const targetNs = ns ?? selectedNs;
    const limitParam = limit || rowsLimit;
    
    try {
      const params = new URLSearchParams({
        application: 'WEBSITE',
        limit: limitParam.toString(),
      });
      if (targetNs && targetNs !== '__ALL__') {
        params.set('namespace', targetNs);
      }

      const res = await fetch(`/api/admin/translations/keys?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch');

      setRows(data.rows || []);
      setTotalCount(data.total || (data.rows || []).length);
      
      // Extract unique namespaces
      const nsSet = new Set();
      (data.rows || []).forEach(r => nsSet.add(r.namespace));
      setNamespaces(Array.from(nsSet).sort());
    } catch (e) {
      console.error('Failed to fetch website translations:', e);
      flash('error', 'Failed to load translations');
    } finally {
      setLoading(false);
    }
  }, [selectedNs, rowsLimit]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAll();
    }
  }, [isSuperAdmin, fetchAll]);

  // Toast helper
  const flash = useCallback((type, msg) => setToast({ type, msg }), []);

  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r => {
      if (r.key.toLowerCase().includes(q)) return true;
      const val = r.values?.[selectedLocale];
      if (val && val.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [rows, filter, selectedLocale]);

  // Open edit modal
  const openEditModal = (row) => {
    setEditingRow(row);
    setEditValue(row.values?.[selectedLocale] || '');
    setEditModalOpen(true);
  };

  // Save translation
  const saveTranslation = async () => {
    if (!editingRow) return;
    setSaving(true);
    
    try {
      const res = await fetch('/api/admin/translations/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: editingRow.id,
          locale: selectedLocale,
          value: editValue,
          application: 'WEBSITE',
        }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      
      flash('success', 'Translation saved');
      setEditModalOpen(false);
      setEditingRow(null);
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Export translations
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        application: 'WEBSITE',
        locale: selectedLocale,
      });
      const res = await fetch(`/api/admin/translations/export?${params}`);
      
      if (!res.ok) throw new Error('Export failed');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `website-${selectedLocale}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      flash('success', 'Export complete');
    } catch (e) {
      console.error(e);
      flash('error', 'Export failed');
    }
  };

  // Group rows by namespace
  const groupedRows = useMemo(() => {
    const groups = {};
    filteredRows.forEach(row => {
      const ns = row.namespace || 'common';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(row);
    });
    return groups;
  }, [filteredRows]);

  // Load more
  const loadMore = () => {
    const newLimit = rowsLimit + 100;
    setRowsLimit(newLimit);
    fetchAll(selectedNs, newLimit);
  };

  if (isUserLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={3} />;
  }

  return (
    <div className={adminStyles.pageContainer}>
      {/* Toast */}
      {toast && (
        <div className={`${adminStyles.toast} ${adminStyles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={adminStyles.pageHeader}>
        <div className={adminStyles.headerTop}>
          <h1 className={adminStyles.pageTitle}>
            <Globe className={adminStyles.titleIcon} />
            {t('nav.admin.website') || 'Website Content'}
          </h1>
          <p className={adminStyles.pageSubtitle}>
            Manage marketing website (gp-ws) translations and content
          </p>
        </div>

        {/* Actions */}
        <div className={styles.headerActions}>
          <a 
            href="http://localhost:3001" 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.previewLink}
          >
            <ExternalLink size={16} />
            Preview Website
          </a>
          <button onClick={handleExport} className={styles.exportButton}>
            <Download size={16} />
            Export {selectedLocale.toUpperCase()}
          </button>
          <button onClick={() => fetchAll()} className={styles.refreshButton} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        {/* Locale selector */}
        <div className={styles.localeSelector}>
          <label className={styles.filterLabel}>Language:</label>
          <div className={styles.localeTabs}>
            {WEBSITE_LOCALES.map(loc => (
              <button
                key={loc.locale}
                className={`${styles.localeTab} ${selectedLocale === loc.locale ? styles.activeTab : ''}`}
                onClick={() => setSelectedLocale(loc.locale)}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Namespace filter */}
        <div className={styles.nsFilter}>
          <label className={styles.filterLabel}>Section:</label>
          <select
            value={selectedNs}
            onChange={(e) => {
              setSelectedNs(e.target.value);
              fetchAll(e.target.value);
            }}
            className={styles.nsSelect}
          >
            <option value="__ALL__">All Sections</option>
            {namespaces.map(ns => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search keys or values..."
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsBar}>
        <span className={styles.statItem}>
          {filteredRows.length} of {totalCount} translations
        </span>
        {selectedNs !== '__ALL__' && (
          <span className={styles.statItem}>
            Section: <strong>{selectedNs}</strong>
          </span>
        )}
      </div>

      {/* Content Table */}
      {loading ? (
        <TableSkeleton rows={8} columns={3} hasActions />
      ) : (
        <div className={styles.tableContainer}>
          {Object.entries(groupedRows).map(([ns, nsRows]) => (
            <div key={ns} className={styles.namespaceGroup}>
              <h3 className={styles.namespaceTitle}>
                {ns}
                <span className={styles.nsCount}>{nsRows.length} keys</span>
              </h3>
              <table className={styles.translationsTable}>
                <thead>
                  <tr>
                    <th className={styles.keyColumn}>Key</th>
                    <th className={styles.valueColumn}>Value ({selectedLocale.toUpperCase()})</th>
                    <th className={styles.actionsColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nsRows.map((row) => {
                    const value = row.values?.[selectedLocale] || '';
                    const displayKey = row.key.replace(`${ns}.`, '');
                    
                    return (
                      <tr key={row.id} className={styles.tableRow}>
                        <td className={styles.keyCell}>
                          <code className={styles.keyCode}>{displayKey}</code>
                        </td>
                        <td className={styles.valueCell}>
                          <span className={value ? styles.valueText : styles.emptyValue}>
                            {value || '(empty)'}
                          </span>
                        </td>
                        <td className={styles.actionsCell}>
                          <button
                            onClick={() => openEditModal(row)}
                            className={styles.editButton}
                            title="Edit translation"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          
          {/* Load more */}
          {rows.length < totalCount && (
            <div className={styles.loadMoreContainer}>
              <button onClick={loadMore} className={styles.loadMoreButton}>
                Load More ({rows.length} / {totalCount})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit: ${editingRow?.key || ''}`}
        size="medium"
      >
        {editingRow && (
          <div className={styles.editForm}>
            <div className={styles.editLocaleInfo}>
              Editing {WEBSITE_LOCALES.find(l => l.locale === selectedLocale)?.name} translation
            </div>
            <FormTextarea
              label="Translation"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={6}
              placeholder="Enter translation..."
            />
            <FormActions>
              <SecondaryButton onClick={() => setEditModalOpen(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onClick={saveTranslation} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </PrimaryButton>
            </FormActions>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
