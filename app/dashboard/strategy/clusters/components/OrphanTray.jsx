'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  Plus,
  FolderPlus,
  X,
  CheckSquare,
  Square,
  ExternalLink,
} from 'lucide-react';
import styles from './ClustersView.module.css';

/**
 * OrphanTray
 *
 * Renders the list of PUBLISHED SiteEntity rows that aren't members of any
 * non-REJECTED cluster. Multi-select + two bulk actions:
 *   1. Assign to existing CONFIRMED cluster (POST /api/clusters/[id]/members)
 *   2. Create new cluster from selection (POST /api/clusters)
 *
 * Re-fetches itself after every mutation, and notifies the parent via
 * `onMutate` so the cluster list above can refresh too.
 */
export function OrphanTray({ siteId, clusters, translations: t, onMutate }) {
  const tt = t?.orphans || {};
  const [orphans, setOrphans] = useState([]);
  const [totalOrphans, setTotalOrphans] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [assignModal, setAssignModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clusters/orphans?siteId=${siteId}`);
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      setOrphans(data.orphans || []);
      setTotalOrphans(data.totalOrphans || 0);
      setCapped(Boolean(data.capped));
    } catch {
      setError(tt.errors?.loadFailed || t?.errors?.loadFailed || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === orphans.length ? new Set() : new Set(orphans.map((o) => o.id)),
    );
  };

  const handleAssign = async (clusterId) => {
    if (selected.size === 0 || !clusterId) return false;
    setError('');
    try {
      const res = await fetch(`/api/clusters/${clusterId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error('assign_failed');
      setSelected(new Set());
      setAssignModal(false);
      await load();
      onMutate?.();
      return true;
    } catch {
      setError(tt.errors?.assignFailed || 'Failed to assign.');
      return false;
    }
  };

  const handleCreate = async ({ name, mainKeyword, pillarEntityId }) => {
    if (selected.size === 0 || !name.trim() || !mainKeyword.trim()) return false;
    setError('');
    try {
      const res = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          name: name.trim(),
          mainKeyword: mainKeyword.trim(),
          memberEntityIds: Array.from(selected),
          pillarEntityId: pillarEntityId || null,
        }),
      });
      if (!res.ok) throw new Error('create_failed');
      setSelected(new Set());
      setCreateModal(false);
      await load();
      onMutate?.();
      return true;
    } catch {
      setError(tt.errors?.createFailed || 'Failed to create cluster.');
      return false;
    }
  };

  if (!siteId) return null;
  if (loading) {
    return (
      <section className={styles.orphanTray}>
        <div className={styles.loading}>
          <Loader2 size={18} className={styles.spin} />
        </div>
      </section>
    );
  }
  // Don't render the section at all if there are no orphans — avoids visual noise.
  if (totalOrphans === 0) return null;

  const allSelected = selected.size > 0 && selected.size === orphans.length;

  return (
    <section className={styles.orphanTray}>
      <header className={styles.orphanHeader}>
        <h3 className={styles.orphanTitle}>{tt.title || 'Uncategorized content'}</h3>
        <p className={styles.orphanSubtitle}>
          {capped
            ? (tt.capped || 'Showing {shown} of {total}')
                .replace('{shown}', String(orphans.length))
                .replace('{total}', String(totalOrphans))
            : (tt.count || '{n} entries').replace('{n}', String(totalOrphans))}
        </p>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {selected.size > 0 && (
        <div className={styles.orphanActionBar}>
          <span className={styles.orphanSelectedLabel}>
            {(tt.selectedCount || '{n} selected').replace('{n}', String(selected.size))}
          </span>
          <button
            type="button"
            className={styles.orphanActionAssign}
            onClick={() => setAssignModal(true)}
          >
            <FolderPlus size={14} />
            <span>{tt.actions?.assign || 'Assign to cluster'}</span>
          </button>
          <button
            type="button"
            className={styles.orphanActionCreate}
            onClick={() => setCreateModal(true)}
          >
            <Plus size={14} />
            <span>{tt.actions?.create || 'Create new cluster'}</span>
          </button>
          <button
            type="button"
            className={styles.orphanActionClear}
            onClick={() => setSelected(new Set())}
          >
            {tt.actions?.clear || 'Clear'}
          </button>
        </div>
      )}

      <div className={styles.orphanList}>
        <button type="button" className={styles.orphanSelectAll} onClick={toggleAll}>
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          <span>{tt.selectAll || 'Select all visible'}</span>
        </button>
        {orphans.map((o) => {
          const checked = selected.has(o.id);
          return (
            <div
              key={o.id}
              className={`${styles.orphanRow} ${checked ? styles.orphanRowChecked : ''}`}
            >
              <button
                type="button"
                className={styles.orphanCheck}
                onClick={() => toggleOne(o.id)}
                aria-pressed={checked}
              >
                {checked ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <div className={styles.orphanRowInfo}>
                <div className={styles.orphanRowTitle}>{o.title}</div>
                {o.excerpt && (
                  <div className={styles.orphanRowExcerpt}>{o.excerpt}</div>
                )}
              </div>
              {o.url && (
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.orphanRowLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {assignModal && (
        <AssignModal
          clusters={clusters}
          translations={t}
          onClose={() => setAssignModal(false)}
          onConfirm={handleAssign}
        />
      )}
      {createModal && (
        <CreateClusterModal
          selectedOrphans={orphans.filter((o) => selected.has(o.id))}
          translations={t}
          onClose={() => setCreateModal(false)}
          onConfirm={handleCreate}
        />
      )}
    </section>
  );
}

function AssignModal({ clusters, translations: t, onClose, onConfirm }) {
  const tt = t?.orphans?.assignModal || {};
  const [clusterId, setClusterId] = useState('');
  const [saving, setSaving] = useState(false);
  const confirmedClusters = (clusters || []).filter((c) => c.status === 'CONFIRMED');

  if (typeof window === 'undefined') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clusterId || saving) return;
    setSaving(true);
    const ok = await onConfirm(clusterId);
    if (!ok) setSaving(false);
  };

  return createPortal(
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{tt.title || 'Assign to cluster'}</h3>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            <span>{tt.label || 'Cluster'}</span>
            <select
              className={styles.input}
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              required
            >
              <option value="">{tt.placeholder || 'Choose a cluster...'}</option>
              {confirmedClusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.mainKeyword ? `${c.name} (${c.mainKeyword})` : c.name}
                </option>
              ))}
            </select>
            {confirmedClusters.length === 0 && (
              <span className={styles.hint}>
                {tt.noConfirmed || 'No confirmed clusters yet.'}
              </span>
            )}
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              {t?.actions?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || !clusterId || confirmedClusters.length === 0}
            >
              {saving && <Loader2 size={14} className={styles.spin} />}
              <span>{tt.confirm || 'Add'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function CreateClusterModal({ selectedOrphans, translations: t, onClose, onConfirm }) {
  const tt = t?.orphans?.createModal || {};
  const [name, setName] = useState('');
  const [mainKeyword, setMainKeyword] = useState('');
  const [pillarEntityId, setPillarEntityId] = useState('');
  const [saving, setSaving] = useState(false);

  if (typeof window === 'undefined') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !name.trim() || !mainKeyword.trim()) return;
    setSaving(true);
    const ok = await onConfirm({ name, mainKeyword, pillarEntityId: pillarEntityId || null });
    if (!ok) setSaving(false);
  };

  return createPortal(
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{tt.title || 'Create cluster'}</h3>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            <span>{tt.nameLabel || 'Cluster name'}</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tt.namePlaceholder || ''}
              required
            />
          </label>
          <label className={styles.label}>
            <span>{tt.keywordLabel || 'Main keyword'}</span>
            <input
              type="text"
              className={styles.input}
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              placeholder={tt.keywordPlaceholder || ''}
              required
            />
          </label>
          <label className={styles.label}>
            <span>{tt.pillarLabel || 'Pillar (optional)'}</span>
            <select
              className={styles.input}
              value={pillarEntityId}
              onChange={(e) => setPillarEntityId(e.target.value)}
            >
              <option value="">{tt.noPillarOption || 'No pillar'}</option>
              {selectedOrphans.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              {(tt.memberCount || 'Selected: {n}').replace('{n}', String(selectedOrphans.length))}
            </span>
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              {t?.actions?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || !name.trim() || !mainKeyword.trim()}
            >
              {saving && <Loader2 size={14} className={styles.spin} />}
              <span>{tt.confirm || 'Create'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
