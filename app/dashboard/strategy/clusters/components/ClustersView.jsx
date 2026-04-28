'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Pencil,
  Star,
  FileText,
  Save,
  Sparkles,
  Activity,
  AlertTriangle,
  Link2,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Trash2,
  LayoutList,
  Share2,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { OrphanTray } from './OrphanTray';
import { ClustersGraph } from './ClustersGraph';
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
  const [viewMode, setViewMode] = useState('list'); // list | graph
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

  const deleteCluster = async (id) => {
    setError('');
    const previous = clusters.find((c) => c.id === id);
    try {
      const res = await fetch(`/api/clusters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete_failed');
      setClusters((prev) => prev.filter((c) => c.id !== id));
      if (previous?.status) {
        setStatusCounts((prev) => {
          const next = { ...prev };
          next[previous.status] = Math.max(0, (next[previous.status] || 0) - 1);
          return next;
        });
      }
      return true;
    } catch {
      setError(t.errors.deleteFailed || t.errors.updateFailed);
      return false;
    }
  };

  const updateCluster = async (id, patch) => {
    setError('');
    // Capture the previous status before the request so we can adjust filter counts locally
    // on success - avoids a refetch (and the loading-flicker that came with it).
    const previous = clusters.find((c) => c.id === id);
    const previousStatus = previous?.status;
    try {
      const res = await fetch(`/api/clusters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patch,
          // Optimistic-concurrency: tell the server the version we last saw.
          // Server returns 409 if the row has moved on since we loaded it.
          ...(previous?.updatedAt ? { expectedUpdatedAt: previous.updatedAt } : {}),
        }),
      });
      if (res.status === 409) {
        setError(t.errors.staleConflict || t.errors.updateFailed);
        await loadClusters();
        return false;
      }
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
        <div className={styles.toolbarRight}>
          <div className={styles.viewToggle} role="group" aria-label="view-mode">
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
              onClick={() => setViewMode('list')}
            >
              <LayoutList size={14} />
              <span>{t.viewMode?.list || 'List'}</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === 'graph' ? styles.viewToggleActive : ''}`}
              onClick={() => setViewMode('graph')}
            >
              <Share2 size={14} />
              <span>{t.viewMode?.graph || 'Graph'}</span>
            </button>
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
      ) : viewMode === 'graph' ? (
        <ClustersGraph
          clusters={visible}
          translations={t}
          onClusterClick={(cluster) => setEditing(cluster)}
        />
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
              onMutate={loadClusters}
            />
          ))}
        </div>
      )}

      {/* Uncategorized content tray — only renders when the site has orphans */}
      <OrphanTray
        siteId={siteId}
        clusters={clusters}
        translations={t}
        onMutate={loadClusters}
      />

      {editing && (
        <EditClusterModal
          cluster={editing}
          translations={t}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await updateCluster(editing.id, patch);
            if (ok) setEditing(null);
          }}
          onDelete={async (id) => {
            const ok = await deleteCluster(id);
            if (ok) setEditing(null);
            return ok;
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

function ClusterCard({ cluster, translations, onConfirm, onReject, onEdit, onMutate }) {
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
        {cluster.status === 'CONFIRMED' && (
          <Link
            href={`/dashboard/strategy/ai-content-wizard?clusterId=${cluster.id}`}
            className={styles.actionExpand}
          >
            <Sparkles size={14} />
            <span>{t.actions.expand}</span>
          </Link>
        )}
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

      {cluster.status === 'CONFIRMED' && (
        <ClusterHealth cluster={cluster} translations={t} onMutate={onMutate} />
      )}
    </div>
  );
}

function ClusterHealth({ cluster, translations: t, onMutate }) {
  const ht = t.health || {};
  const [expanded, setExpanded] = useState(false);

  // Health is now baked into the GET /api/clusters list response (capped at top 5
  // per category). Per-cluster /health endpoint still returns the full list and
  // can be wired up here later for "show all" if useful.
  const data = cluster.health;
  if (!data) return null;

  const total = data.totals?.all || 0;
  const summaryLabel = total === 0
    ? (ht.healthy || 'Healthy')
    : (ht.issues || '{n} issues').replace('{n}', String(total));

  return (
    <div className={`${styles.health} ${total > 0 ? styles.healthHasIssues : styles.healthOk}`}>
      <button
        type="button"
        className={styles.healthToggle}
        onClick={() => setExpanded((v) => !v)}
        disabled={total === 0}
        aria-expanded={expanded}
      >
        {total === 0 ? (
          <CheckCircle2 size={14} className={styles.healthOkIcon} />
        ) : (
          <Activity size={14} className={styles.healthWarnIcon} />
        )}
        <span className={styles.healthSummary}>{summaryLabel}</span>
        {total > 0 && (
          <>
            <span className={styles.healthMini}>
              {data.totals.linkGaps > 0 && (
                <span title={ht.linkGaps?.title || 'Link gaps'}>
                  <Link2 size={12} /> {data.totals.linkGaps}
                </span>
              )}
              {data.totals.cannibalizations > 0 && (
                <span title={ht.cannibalizations?.title || 'Cannibalization'}>
                  <AlertTriangle size={12} /> {data.totals.cannibalizations}
                </span>
              )}
              {data.totals.staleness > 0 && (
                <span title={ht.staleness?.title || 'Stale content'}>
                  <Clock size={12} /> {data.totals.staleness}
                </span>
              )}
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </>
        )}
      </button>

      {expanded && total > 0 && (
        <div className={styles.healthDetail}>
          {data.totals.cannibalizations > 0 && (
            <HealthSection
              icon={<AlertTriangle size={13} />}
              title={ht.cannibalizations?.title || 'Cannibalization'}
              items={data.cannibalizations.slice(0, 5).map((c) => ({
                key: c.insightId,
                primary: c.memberUrlsInvolved?.[0] || c.urlsInvolved?.[0] || '—',
                secondary: c.recommendedAction
                  ? `${c.recommendedAction}${c.confidence != null ? ` · ${Math.round(c.confidence)}%` : ''}`
                  : '',
              }))}
              moreLabel={
                data.totals.cannibalizations > 5
                  ? (ht.more || '+{n} more').replace(
                      '{n}',
                      String(data.totals.cannibalizations - 5),
                    )
                  : null
              }
            />
          )}

          {data.totals.linkGaps > 0 && (
            <HealthSection
              icon={<Link2 size={13} />}
              title={ht.linkGaps?.title || 'Internal link gaps'}
              items={data.linkGaps.slice(0, 5).map((g) => ({
                key: `${g.fromEntityId}-${g.toEntityId}`,
                primary: `${g.fromTitle} → ${g.toTitle}`,
                secondary: g.severity === 'HIGH'
                  ? (ht.linkGaps?.severity?.HIGH || 'Pillar gap')
                  : (ht.linkGaps?.severity?.MEDIUM || 'Member gap'),
                action: (
                  <FixLinkGapButton
                    clusterId={cluster.id}
                    fromEntityId={g.fromEntityId}
                    toEntityId={g.toEntityId}
                    translations={ht.linkGaps || {}}
                    onSuccess={onMutate}
                  />
                ),
              }))}
              moreLabel={
                data.totals.linkGaps > 5
                  ? (ht.more || '+{n} more').replace(
                      '{n}',
                      String(data.totals.linkGaps - 5),
                    )
                  : null
              }
            />
          )}

          {data.totals.staleness > 0 && (
            <HealthSection
              icon={<Clock size={13} />}
              title={ht.staleness?.title || 'Stale content'}
              items={data.staleness.slice(0, 5).map((s) => ({
                key: s.entityId,
                primary: s.title,
                secondary: (ht.staleness?.daysAgo || '{n}d ago').replace('{n}', String(s.daysStale)),
              }))}
              moreLabel={
                data.totals.staleness > 5
                  ? (ht.more || '+{n} more').replace(
                      '{n}',
                      String(data.totals.staleness - 5),
                    )
                  : null
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function HealthSection({ icon, title, items, moreLabel }) {
  return (
    <div className={styles.healthSection}>
      <div className={styles.healthSectionHeader}>
        {icon}
        <span>{title}</span>
        <span className={styles.healthSectionCount}>{items.length}</span>
      </div>
      <ul className={styles.healthSectionList}>
        {items.map((item) => (
          <li key={item.key}>
            <span className={styles.healthSectionPrimary}>{item.primary}</span>
            {item.secondary && (
              <span className={styles.healthSectionSecondary}>{item.secondary}</span>
            )}
            {item.action}
          </li>
        ))}
      </ul>
      {moreLabel && <div className={styles.healthSectionMore}>{moreLabel}</div>}
    </div>
  );
}

function FixLinkGapButton({ clusterId, fromEntityId, toEntityId, translations: ht, onSuccess }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [errorMessage, setErrorMessage] = useState('');

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'loading' || state === 'done') return;
    setState('loading');
    setErrorMessage('');
    try {
      const res = await fetch(`/api/clusters/${clusterId}/health/fix-link-gap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEntityId, toEntityId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.code;
        // Translate known error codes; fall back to generic message.
        const msg =
          code === 'PLUGIN_DISCONNECTED'
            ? ht.fix?.errors?.pluginDisconnected || 'Plugin disconnected'
            : code === 'NO_VERBATIM_MATCH'
              ? ht.fix?.errors?.noMatch || 'AI suggested a passage that does not match'
              : code === 'NO_LINK_INSERTED' || code === 'BAD_DELTA' || code === 'NO_FIX'
                ? ht.fix?.errors?.aiFailed || 'AI did not produce a usable fix'
                : ht.fix?.errors?.generic || 'Fix failed';
        setErrorMessage(msg);
        setState('error');
        return;
      }
      setState('done');
      // Brief success state, then refresh the cluster list so the gap disappears.
      setTimeout(() => onSuccess?.(), 700);
    } catch {
      setErrorMessage(ht.fix?.errors?.generic || 'Fix failed');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span className={`${styles.fixBtn} ${styles.fixBtnDone}`} title={ht.fix?.fixed || 'Done'}>
        <Check size={12} />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.fixBtn} ${state === 'error' ? styles.fixBtnError : ''}`}
      onClick={handleClick}
      disabled={state === 'loading'}
      title={state === 'error' ? errorMessage : ht.fix?.tooltip || 'Insert link via plugin'}
    >
      {state === 'loading' ? (
        <Loader2 size={12} className={styles.spin} />
      ) : (
        <Sparkles size={12} />
      )}
      <span>
        {state === 'loading'
          ? ht.fix?.loading || 'Fixing...'
          : state === 'error'
            ? ht.fix?.retry || 'Retry'
            : ht.fix?.button || 'Fix with AI'}
      </span>
    </button>
  );
}

function EditClusterModal({ cluster, translations, onClose, onSave, onDelete }) {
  const t = translations;
  const [name, setName] = useState(cluster.name);
  const [mainKeyword, setMainKeyword] = useState(cluster.mainKeyword);
  const [pillarEntityId, setPillarEntityId] = useState(cluster.pillarEntityId || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const ok = await onDelete?.(cluster.id);
    if (!ok) setDeleting(false);
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
            {onDelete && !confirmDelete && (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} />
                <span>{t.actions.delete || 'Delete'}</span>
              </button>
            )}
            {onDelete && confirmDelete && (
              <button
                type="button"
                className={styles.btnDangerConfirm}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 size={14} className={styles.spin} />}
                <span>{t.actions.confirmDelete || 'Confirm delete'}</span>
              </button>
            )}
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              {t.actions.cancel}
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving || deleting}>
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
