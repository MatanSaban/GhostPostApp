'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, Check, X, Pencil, Star, FileText, Save } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import styles from './ClustersView.module.css';

const STATUSES = ['DISCOVERED', 'CONFIRMED', 'REJECTED'];

function formatCount(template, count) {
  return template.replace('{count}', String(count));
}

function formatPercent(template, value) {
  const pct = Math.round((value || 0) * 100);
  return template.replace('{value}', String(pct));
}

export function ClustersView({ translations }) {
  const t = translations;
  const { selectedSite } = useSite();
  const siteId = selectedSite?.id;

  const [clusters, setClusters] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [filter, setFilter] = useState('ALL'); // ALL | DISCOVERED | CONFIRMED | REJECTED
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const loadClusters = async () => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clusters?siteId=${siteId}`);
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      setClusters(data.clusters || []);
      setStatusCounts(data.statusCounts || {});
    } catch {
      setError(t.errors.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const handleDiscover = async () => {
    if (!siteId || discovering) return;
    setDiscovering(true);
    setError('');
    try {
      const res = await fetch('/api/clusters/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) throw new Error('discover_failed');
      await loadClusters();
    } catch {
      setError(t.errors.discoverFailed);
    } finally {
      setDiscovering(false);
    }
  };

  const updateCluster = async (id, patch) => {
    setError('');
    // Capture the previous status before the request so we can adjust filter counts locally
    // on success - avoids a refetch (and the loading-flicker that came with it).
    const previousStatus = clusters.find((c) => c.id === id)?.status;
    try {
      const res = await fetch(`/api/clusters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('update_failed');
      const { cluster: updated } = await res.json();
      setClusters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updated, members: c.members } : c)),
      );
      if (updated?.status && updated.status !== previousStatus) {
        setStatusCounts((prev) => {
          const next = { ...prev };
          if (previousStatus) {
            next[previousStatus] = Math.max(0, (next[previousStatus] || 0) - 1);
          }
          next[updated.status] = (next[updated.status] || 0) + 1;
          return next;
        });
      }
      return true;
    } catch {
      setError(t.errors.updateFailed);
      return false;
    }
  };

  const visible = useMemo(() => {
    if (filter === 'ALL') return clusters;
    return clusters.filter((c) => c.status === filter);
  }, [clusters, filter]);

  const totalCount = clusters.length;

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <FilterChip
            label={t.filters.all}
            count={totalCount}
            active={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
          />
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={t.filters[s.toLowerCase()] || t.status[s]}
              count={statusCounts[s] || 0}
              active={filter === s}
              onClick={() => setFilter(s)}
            />
          ))}
        </div>
        <button
          type="button"
          className={styles.rediscoverBtn}
          onClick={handleDiscover}
          disabled={discovering || !siteId}
        >
          {discovering ? (
            <>
              <Loader2 size={16} className={styles.spin} />
              <span>{t.rediscovering}</span>
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              <span>{t.rediscover}</span>
            </>
          )}
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={20} className={styles.spin} />
        </div>
      ) : totalCount === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>{t.noClusters}</h3>
          <p className={styles.emptyHint}>{t.noClustersHint}</p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleDiscover}
            disabled={discovering || !siteId}
          >
            {discovering ? (
              <>
                <Loader2 size={16} className={styles.spin} />
                <span>{t.rediscovering}</span>
              </>
            ) : (
              <span>{t.discoverNow}</span>
            )}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyHint}>{t.noResults}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              translations={t}
              onConfirm={() => updateCluster(cluster.id, { status: 'CONFIRMED' })}
              onReject={() => updateCluster(cluster.id, { status: 'REJECTED' })}
              onEdit={() => setEditing(cluster)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditClusterModal
          cluster={editing}
          translations={t}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await updateCluster(editing.id, patch);
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={styles.chipCount}>{count}</span>
    </button>
  );
}

function ClusterCard({ cluster, translations, onConfirm, onReject, onEdit }) {
  const t = translations;
  const memberCount = cluster.members?.length || cluster.memberEntityIds?.length || 0;
  const pillar = cluster.members?.find((m) => m.id === cluster.pillarEntityId);
  const memberLabel = memberCount === 1 ? t.memberOne : formatCount(t.members, memberCount);

  return (
    <div className={`${styles.card} ${styles[`card_${cluster.status}`] || ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <h3 className={styles.cardName}>{cluster.name}</h3>
          <span className={`${styles.statusBadge} ${styles[`badge_${cluster.status}`] || ''}`}>
            {t.status[cluster.status]}
          </span>
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.metaKeyword}>{cluster.mainKeyword}</span>
          <span className={styles.metaDot}>·</span>
          <span>{memberLabel}</span>
          {typeof cluster.confidenceScore === 'number' && (
            <>
              <span className={styles.metaDot}>·</span>
              <span>{formatPercent(t.confidence, cluster.confidenceScore)}</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.cardPillar}>
        <Star size={14} className={pillar ? styles.pillarIconActive : styles.pillarIconMuted} />
        {pillar ? (
          pillar.url ? (
            <a
              href={pillar.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pillarLink}
            >
              {pillar.title}
            </a>
          ) : (
            <span className={styles.pillarLink}>{pillar.title}</span>
          )
        ) : (
          <span className={styles.pillarMuted}>{t.noPillar}</span>
        )}
      </div>

      <div className={styles.cardMembers}>
        {(cluster.members || []).slice(0, 6).map((m) => (
          <div key={m.id} className={styles.memberRow}>
            <FileText size={14} className={styles.memberIcon} />
            {m.url ? (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.memberTitle}
              >
                {m.title}
              </a>
            ) : (
              <span className={styles.memberTitle}>{m.title}</span>
            )}
          </div>
        ))}
        {memberCount > 6 && (
          <div className={styles.memberMore}>+{memberCount - 6}</div>
        )}
      </div>

      <div className={styles.cardActions}>
        {cluster.status !== 'CONFIRMED' && (
          <button type="button" className={styles.actionConfirm} onClick={onConfirm}>
            <Check size={14} />
            <span>{t.actions.confirm}</span>
          </button>
        )}
        {cluster.status !== 'REJECTED' && (
          <button type="button" className={styles.actionReject} onClick={onReject}>
            <X size={14} />
            <span>{t.actions.reject}</span>
          </button>
        )}
        <button type="button" className={styles.actionEdit} onClick={onEdit}>
          <Pencil size={14} />
          <span>{t.actions.edit}</span>
        </button>
      </div>
    </div>
  );
}

function EditClusterModal({ cluster, translations, onClose, onSave }) {
  const t = translations;
  const [name, setName] = useState(cluster.name);
  const [mainKeyword, setMainKeyword] = useState(cluster.mainKeyword);
  const [pillarEntityId, setPillarEntityId] = useState(cluster.pillarEntityId || '');
  const [saving, setSaving] = useState(false);

  const members = cluster.members || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !mainKeyword.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      mainKeyword: mainKeyword.trim(),
      pillarEntityId: pillarEntityId || null,
    });
    setSaving(false);
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t.edit.title}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            <span>{t.edit.nameLabel}</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.edit.namePlaceholder}
              required
            />
          </label>

          <label className={styles.label}>
            <span>{t.edit.keywordLabel}</span>
            <input
              type="text"
              className={styles.input}
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              placeholder={t.edit.keywordPlaceholder}
              required
            />
          </label>

          <label className={styles.label}>
            <span>{t.edit.pillarLabel}</span>
            <select
              className={styles.input}
              value={pillarEntityId}
              onChange={(e) => setPillarEntityId(e.target.value)}
            >
              <option value="">{t.edit.noPillarOption}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <span className={styles.hint}>{t.edit.pillarHint}</span>
          </label>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              {t.actions.cancel}
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? <Loader2 size={14} className={styles.spin} /> : <Save size={14} />}
              <span>{t.actions.save}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
