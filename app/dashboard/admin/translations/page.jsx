'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  Languages,
  Globe,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import SearchableSelect from '@/app/components/ui/searchable-select';
import styles from './translations.module.css';
import adminStyles from '../admin.module.css';

export default function TranslationsPage() {
  const router = useRouter();
  const { t, locale, refreshTranslations } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  // State
  const [loading, setLoading] = useState(true);
  const [langs, setLangs] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNs, setSelectedNs] = useState('__ALL__');
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newNs, setNewNs] = useState('common');
  const [nsManuallyEdited, setNsManuallyEdited] = useState(false);
  const [newLocale, setNewLocale] = useState('');
  const [newLocaleName, setNewLocaleName] = useState('');
  const [newLocaleRTL, setNewLocaleRTL] = useState(false);
  const [fallbackCsv, setFallbackCsv] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [visibleLocales, setVisibleLocales] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [rowsLimit, setRowsLimit] = useState(100);
  const [totalCount, setTotalCount] = useState(0);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editFormData, setEditFormData] = useState({ key: '', namespace: '', description: '' });

  // Import state
  const [importLocale, setImportLocale] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importParsedKeys, setImportParsedKeys] = useState([]);
  const [importCreateMissing, setImportCreateMissing] = useState(true);
  const [importDefaultNs, setImportDefaultNs] = useState('common');
  const [importError, setImportError] = useState('');
  const [importJsonText, setImportJsonText] = useState('');

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
      const keysUrl = targetNs && targetNs !== '__ALL__'
        ? `/api/admin/translations/keys?namespace=${encodeURIComponent(targetNs)}&limit=${limitParam}`
        : `/api/admin/translations/keys?limit=${limitParam}`;

      const [langsRes, keysRes] = await Promise.all([
        fetch('/api/admin/translations/languages').then(r => r.json()),
        fetch(keysUrl).then(r => r.json())
      ]);

      const fetchedLangs = langsRes.languages || [];
      setLangs(fetchedLangs);
      setNamespaces(langsRes.namespaces || []);
      setRows(keysRes.rows || []);
      setTotalCount(keysRes.total || (keysRes.rows || []).length);

      setVisibleLocales(prev => {
        if (prev.length === 0) return fetchedLangs.map(l => l.locale);
        const present = new Set(fetchedLangs.map(l => l.locale));
        const filtered = prev.filter(loc => present.has(loc));
        return filtered.length ? filtered : fetchedLangs.map(l => l.locale);
      });
    } catch (e) {
      console.error('Failed to fetch translations:', e);
      flash('error', t('admin.common.error'));
    } finally {
      setLoading(false);
    }
  }, [selectedNs, rowsLimit, t]);

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
      for (const val of Object.values(r.values)) {
        if (val && val.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [rows, filter]);

  const visibleLangs = useMemo(() => 
    langs.filter(l => visibleLocales.includes(l.locale)), 
    [langs, visibleLocales]
  );

  const allLocalesSelected = visibleLocales.length === langs.length && langs.length > 0;
  const toggleLocale = (loc) => setVisibleLocales(v => 
    v.includes(loc) ? v.filter(x => x !== loc) : [...v, loc]
  );
  const toggleAllLocales = () => setVisibleLocales(allLocalesSelected ? [] : langs.map(l => l.locale));

  const allRowsSelected = filteredRows.length > 0 && filteredRows.every(r => selectedRowIds.includes(r.id));
  const toggleRow = (id) => setSelectedRowIds(prev => 
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );
  const toggleAllRows = () => setSelectedRowIds(
    allRowsSelected 
      ? selectedRowIds.filter(id => !filteredRows.find(r => r.id === id))
      : Array.from(new Set([...selectedRowIds, ...filteredRows.map(r => r.id)]))
  );

  // Add key
  const addKey = async () => {
    if (!newKey || saving) return;
    setSaving(true);
    
    try {
      let nsVal = (newNs || '').trim() || 'common';
      let finalKey = newKey.trim();

      if (!finalKey.includes('.')) {
        finalKey = `${nsVal}.${finalKey}`;
      } else {
        const firstSeg = finalKey.split('.')[0];
        if (!newNs.trim()) {
          nsVal = firstSeg;
        } else if (firstSeg !== nsVal) {
          finalKey = `${nsVal}.${finalKey}`;
        }
      }

      const res = await fetch('/api/admin/translations/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: finalKey, namespace: nsVal, description: newDesc })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.failed'));
      
      flash('success', t('admin.translations.keyAdded'));
      setNewKey('');
      setNewDesc('');
      setNewNs(nsVal);
      setNsManuallyEdited(false);
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', e.message || t('admin.common.error'));
    } finally {
      setSaving(false);
    }
  };

  // Add language
  const addLanguage = async () => {
    if (!newLocale || !newLocaleName || saving) return;
    setSaving(true);
    
    try {
      const res = await fetch('/api/admin/translations/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: newLocale,
          name: newLocaleName,
          isRTL: newLocaleRTL,
          fallback: fallbackCsv.split(',').map(s => s.trim()).filter(Boolean)
        })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.failed'));
      
      flash('success', t('admin.translations.languageAdded'));
      setNewLocale('');
      setNewLocaleName('');
      setNewLocaleRTL(false);
      setFallbackCsv('');
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', e.message || t('admin.common.error'));
    } finally {
      setSaving(false);
    }
  };

  // Delete keys
  const deleteKeys = async (ids) => {
    if (!ids.length) return;
    
    try {
      const res = await fetch('/api/admin/translations/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.failed'));
      
      flash('success', `${t('admin.common.deleted')} ${data.deleted}`);
      setSelectedRowIds([]);
      setDeleteDialogOpen(false);
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', t('admin.common.error'));
    }
  };

  // Edit key
  const openEditModal = (row) => {
    setEditingRow(row);
    setEditFormData({
      key: row.key,
      namespace: row.namespace,
      description: row.description || ''
    });
    setEditModalOpen(true);
  };

  const saveKeyEdit = async () => {
    if (!editingRow) return;
    setSaving(true);
    
    try {
      const res = await fetch('/api/admin/translations/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRow.id,
          key: editFormData.key,
          namespace: editFormData.namespace,
          description: editFormData.description
        })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.failed'));
      
      flash('success', t('admin.common.saved'));
      setEditModalOpen(false);
      setEditingRow(null);
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', e.message || t('admin.common.error'));
    } finally {
      setSaving(false);
    }
  };

  // Update translation
  const updateTranslation = async (keyId, langLocale, value) => {
    setSaving(true);
    
    try {
      const res = await fetch('/api/admin/translations/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId, locale: langLocale, value })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.failed'));
      
      flash('success', t('admin.common.saved'));
      await fetchAll();
    } catch (e) {
      console.error(e);
      flash('error', t('admin.common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Import handling
  const flattenJson = (obj, prefix = '') => {
    const out = {};
    const walk = (o, p) => {
      if (typeof o !== 'object' || !o || Array.isArray(o)) return;
      Object.entries(o).forEach(([k, v]) => {
        const path = p ? `${p}.${k}` : k;
        if (typeof v === 'string') out[path] = v;
        else walk(v, path);
      });
    };
    walk(obj, prefix);
    return out;
  };

  const parseImportFile = (file) => {
    setImportError('');
    file.text().then(txt => {
      try {
        const obj = JSON.parse(txt);
        const flat = flattenJson(obj);
        setImportJsonText(txt);
        setImportParsedKeys(Object.keys(flat));
        setImportFile(file);
      } catch (err) {
        setImportError(err.message || t('admin.translations.parseError'));
        setImportParsedKeys([]);
      }
    });
  };

  const submitImport = async () => {
    if (!importLocale) {
      setImportError(t('admin.translations.selectLanguage'));
      return;
    }
    
    setSaving(true);
    setImportError('');
    
    try {
      const obj = JSON.parse(importJsonText || '{}');
      const flat = flattenJson(obj);

      const res = await fetch('/api/admin/translations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: importLocale,
          defaultNamespace: importDefaultNs,
          createMissing: importCreateMissing,
          entries: flat
        })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || t('admin.translations.importFailed'));
      
      flash('success', t('admin.translations.importSuccess', { keys: data.summary.createdKeys, translations: data.summary.updatedTranslations }));
      setImportModalOpen(false);
      resetImportState();
      await fetchAll();
    } catch (e) {
      console.error(e);
      setImportError(e.message || t('admin.translations.importFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetImportState = () => {
    setImportLocale('');
    setImportFile(null);
    setImportParsedKeys([]);
    setImportJsonText('');
    setImportError('');
    setImportCreateMissing(true);
    setImportDefaultNs('common');
  };

  // Export
  const exportTranslations = async (langLocale) => {
    try {
      const ns = selectedNs !== '__ALL__' ? `&namespace=${encodeURIComponent(selectedNs)}` : '';
      const res = await fetch(`/api/admin/translations/export?locale=${langLocale}${ns}`);
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translations-${langLocale}${selectedNs !== '__ALL__' ? `-${selectedNs}` : ''}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      flash('success', t('admin.translations.exported'));
    } catch (e) {
      console.error(e);
      flash('error', t('admin.common.error'));
    }
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={0} columns={4} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.translationsPage}>
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={adminStyles.adminHeader}>
        <h1 className={adminStyles.adminTitle}>
          <Languages size={24} style={{ display: 'inline', marginInlineEnd: '0.5rem', verticalAlign: 'middle' }} />
          {t('admin.translations.title')}
        </h1>
        <p className={adminStyles.adminSubtitle}>
          {t('admin.translations.subtitle')}
        </p>
      </div>

      {/* Stats */}
      <div className={adminStyles.statsGrid}>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statLabel}>{t('admin.translations.totalKeys')}</div>
          <div className={adminStyles.statValue}>{totalCount}</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statLabel}>{t('admin.translations.languages')}</div>
          <div className={adminStyles.statValue}>{langs.length}</div>
        </div>
        <div className={adminStyles.statCard}>
          <div className={adminStyles.statLabel}>{t('admin.translations.namespaces')}</div>
          <div className={adminStyles.statValue}>{namespaces.length}</div>
        </div>
      </div>

      {/* Controls */}
      <div className={styles.controlsCard}>
        {/* Filter row */}
        <div className={styles.controlsRow}>
          <span className={styles.nsLabel}>{t('admin.translations.namespace')}</span>
          <SearchableSelect
            value={selectedNs}
            onChange={val => { setSelectedNs(val); fetchAll(val); }}
            options={[
              { value: '__ALL__', label: t('admin.translations.allNamespaces') },
              ...namespaces.map(ns => ({ value: ns, label: ns }))
            ]}
            placeholder={t('admin.translations.selectNamespace')}
            searchPlaceholder={t('admin.common.search')}
            className={styles.nsSelect}
          />
          <input
            className={`${styles.input} ${styles.flexGrow}`}
            placeholder={t('admin.translations.filterKeys')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button 
            className={`${styles.btn} ${styles.btnOutline}`} 
            onClick={async () => {
              await fetchAll();
              await refreshTranslations();
            }}
            disabled={loading}
          >
            <RefreshCw size={14} /> {t('admin.common.refresh')}
          </button>
          <button 
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { resetImportState(); setImportModalOpen(true); }}
          >
            <Upload size={14} /> {t('admin.translations.import')}
          </button>
        </div>

        {/* Add key row */}
        <div className={styles.controlsRow}>
          <input
            className={`${styles.input} ${styles.keyInput}`}
            placeholder={t('admin.translations.newKey')}
            value={newKey}
            onChange={e => {
              const val = e.target.value;
              setNewKey(val);
              // Auto-update namespace if not manually edited
              if (!nsManuallyEdited) {
                const trimmed = val.trim();
                if (trimmed.includes('.')) {
                  // Extract namespace from key (first segment before .)
                  const firstSegment = trimmed.split('.')[0];
                  if (firstSegment) {
                    setNewNs(firstSegment);
                  } else {
                    // Key starts with . like ".key"
                    setNewNs('common');
                  }
                } else {
                  // No dot in key, use common
                  setNewNs('common');
                }
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter' && newKey.trim()) { e.preventDefault(); addKey(); } }}
          />
          <input
            className={`${styles.input} ${styles.descInput}`}
            placeholder={t('admin.translations.description')}
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <input
            className={`${styles.input} ${styles.nsInput}`}
            placeholder={t('admin.translations.namespace')}
            value={newNs}
            onChange={e => {
              setNewNs(e.target.value);
              setNsManuallyEdited(true);
            }}
          />
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={saving || !newKey}
            onClick={addKey}
          >
            <Plus size={14} /> {t('admin.translations.addKey')}
          </button>
        </div>

        {/* Add language row */}
        <div className={styles.controlsRow}>
          <input
            className={`${styles.input} ${styles.localeInput}`}
            placeholder={t('admin.translations.newLocale')}
            value={newLocale}
            onChange={e => setNewLocale(e.target.value)}
          />
          <input
            className={`${styles.input} ${styles.localeNameInput}`}
            placeholder={t('admin.translations.languageName')}
            value={newLocaleName}
            onChange={e => setNewLocaleName(e.target.value)}
          />
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={newLocaleRTL} onChange={e => setNewLocaleRTL(e.target.checked)} />
            {t('admin.translations.rtl')}
          </label>
          <input
            className={`${styles.input} ${styles.fallbackInput}`}
            placeholder={t('admin.translations.fallback')}
            value={fallbackCsv}
            onChange={e => setFallbackCsv(e.target.value)}
          />
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            disabled={saving || !newLocale || !newLocaleName}
            onClick={addLanguage}
          >
            <Globe size={14} /> {t('admin.translations.addLanguage')}
          </button>
        </div>
      </div>

      {/* Languages toggle */}
      <div className={styles.languagesBar}>
        <span className={styles.languagesTitle}>{t('admin.translations.showLanguages')}:</span>
        <label className={styles.langCheck}>
          <input type="checkbox" checked={allLocalesSelected} onChange={toggleAllLocales} />
          {t('admin.common.all')}
        </label>
        {langs.map(l => (
          <label key={l.locale} className={styles.langCheck}>
            <input type="checkbox" checked={visibleLocales.includes(l.locale)} onChange={() => toggleLocale(l.locale)} />
            {l.locale} ({l.name})
            <button
              className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
              onClick={() => exportTranslations(l.locale)}
              title={t('admin.translations.export')}
              style={{ marginInlineStart: '0.25rem', padding: '0.25rem 0.5rem' }}
            >
              <Download size={12} />
            </button>
          </label>
        ))}
      </div>

      {/* Delete bar */}
      {selectedRowIds.length > 0 && (
        <div className={styles.deleteBar}>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 size={14} /> {t('admin.translations.deleteSelected')} ({selectedRowIds.length})
          </button>
        </div>
      )}

      {/* Limit */}
      <div className={styles.limitWrap}>
        <label className={styles.limitLabel}>
          {t('admin.common.rows')}
          <select
            className={`${styles.select} ${styles.limitSelect}`}
            value={rowsLimit}
            onChange={e => { const v = Number(e.target.value); setRowsLimit(v); fetchAll(undefined, v); }}
          >
            {[20, 50, 100, 200, 500, 1000, 2000, 5000].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <span className={styles.resultsInfo}>{filteredRows.length}/{totalCount} {t('admin.common.results')}</span>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input type="checkbox" checked={allRowsSelected} onChange={toggleAllRows} />
              </th>
              <th className={styles.thIndex}>#</th>
              <th className={styles.thKey}>{t('admin.translations.key')}</th>
              {visibleLangs.map(l => <th key={l.locale}>{l.locale}</th>)}
              <th className={styles.thActions}>{t('admin.common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={row.id}>
                <td className={styles.cellCenter}>
                  <input type="checkbox" checked={selectedRowIds.includes(row.id)} onChange={() => toggleRow(row.id)} />
                </td>
                <td className={styles.inlineRowNum}>{i + 1}</td>
                <td className={styles.keyCell}>
                  <div className={styles.keyTitle}>{row.key}</div>
                  <div className={styles.keyMeta}>
                    {row.namespace}{row.description ? ` – ${row.description}` : ''}
                  </div>
                </td>
                {visibleLangs.map(l => {
                  const current = row.values[l.locale] || '';
                  return (
                    <td key={l.locale}>
                      <textarea
                        defaultValue={current}
                        placeholder={l.locale}
                        className={styles.transTextarea}
                        onBlur={async (e) => {
                          const newVal = e.currentTarget.value;
                          if (newVal !== current) {
                            await updateTranslation(row.id, l.locale, newVal);
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className={styles.actionCell}>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => openEditModal(row)}
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                    onClick={() => { setSelectedRowIds([row.id]); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={4 + visibleLangs.length} className={styles.noKeys}>
                  {t('admin.translations.noKeys')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <div className={styles.loading}>{t('admin.common.loading')}</div>}

      {/* Edit Key Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={t('admin.translations.editKey')}
      >
        <FormInput
          label={t('admin.translations.key')}
          value={editFormData.key}
          onChange={e => setEditFormData({ ...editFormData, key: e.target.value })}
        />
        <FormInput
          label={t('admin.translations.namespace')}
          value={editFormData.namespace}
          onChange={e => setEditFormData({ ...editFormData, namespace: e.target.value })}
        />
        <FormTextarea
          label={t('admin.translations.description')}
          value={editFormData.description}
          onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
        />
        <FormActions>
          <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
            {t('admin.common.cancel')}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={saveKeyEdit} disabled={saving}>
            {saving ? t('admin.common.saving') : t('admin.common.save')}
          </PrimaryButton>
        </FormActions>
      </AdminModal>

      {/* Import Modal */}
      <AdminModal
        isOpen={importModalOpen}
        onClose={() => { setImportModalOpen(false); resetImportState(); }}
        title={t('admin.translations.importTitle')}
      >
        <div className={styles.popupSection}>
          <FormSelect
            label={t('admin.translations.language')}
            value={importLocale}
            onChange={e => setImportLocale(e.target.value)}
            options={[
              { value: '', label: t('admin.common.select') },
              ...langs.map(l => ({ value: l.locale, label: `${l.locale} – ${l.name}` }))
            ]}
          />
          
          <label className={styles.formLabel}>
            {t('admin.translations.jsonFile')}
            <input
              type="file"
              accept="application/json,.json"
              onChange={e => { const f = e.target.files?.[0]; if (f) parseImportFile(f); }}
              style={{ marginTop: '0.25rem' }}
            />
          </label>
          
          {importFile && <div className={styles.fileInfo}>{t('admin.translations.file')}: {importFile.name}</div>}
          
          <label className={styles.checkboxInline}>
            <input type="checkbox" checked={importCreateMissing} onChange={e => setImportCreateMissing(e.target.checked)} />
            {t('admin.translations.createMissing')}
          </label>
          
          {importCreateMissing && (
            <input
              className={styles.input}
              placeholder={t('admin.translations.defaultNamespace')}
              value={importDefaultNs}
              onChange={e => setImportDefaultNs(e.target.value)}
            />
          )}
          
          {importParsedKeys.length > 0 && (
            <div className={styles.parsedKeysBox}>
              {importParsedKeys.slice(0, 30).map(k => <div key={k}>{k}</div>)}
              {importParsedKeys.length > 30 && <div className={styles.more}>… +{importParsedKeys.length - 30} {t('admin.translations.more')}</div>}
            </div>
          )}
          
          {importError && <div className={styles.error}>{importError}</div>}
        </div>
        
        <FormActions>
          <SecondaryButton type="button" onClick={() => { setImportModalOpen(false); resetImportState(); }}>
            {t('admin.common.cancel')}
          </SecondaryButton>
          <PrimaryButton
            type="button"
            onClick={submitImport}
            disabled={!importLocale || importParsedKeys.length === 0 || saving}
          >
            {saving ? t('admin.common.saving') : t('admin.translations.import')}
          </PrimaryButton>
        </FormActions>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setSelectedRowIds([]); }}
        onConfirm={() => deleteKeys(selectedRowIds)}
        title={t('admin.translations.deleteKeys')}
        message={t('admin.translations.deleteKeysConfirm')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
        variant="danger"
      />
    </div>
  );
}
