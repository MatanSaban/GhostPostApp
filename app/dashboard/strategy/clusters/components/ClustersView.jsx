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
  ChevronRight,
  CheckCircle2,
  Trash2,
  LayoutList,
  Share2,
  CornerDownRight,
  CheckSquare,
  Square,
  GitBranch,
} from 'lucide-react';

// Soft cap from lib/cluster-tree.js — keep these in sync (UI only uses for
// gating the "Discover sub-clusters" button; server enforces the real limit).
const MAX_TREE_DEPTH = 4;
import { useSite } from '@/app/context/site-context';
import { OrphanTray } from './OrphanTray';
import { ClustersGraph } from './ClustersGraph';
import styles from './ClustersView.module.css';

const STATUSES = ['DISCOVERED', 'CONFIRMED', 'REJECTED'];

// Map server-side ClusterTreeError codes to translated user-facing messages.
// Falls back to the generic update/promote/demote message when unknown.
function mapTreeError(code, translations, fallback) {
  const e = translations?.errors || {};
  switch (code) {
    case 'CYCLE':
      return e.cycleDetected || fallback;
    case 'DEPTH_EXCEEDED':
      return (e.depthExceeded || fallback).replace('{max}', '4');
    case 'PILLAR_CONFLICT':
      return e.pillarConflict || fallback;
    case 'PILLAR_NOT_MEMBER':
    case 'PILLAR_REQUIRED':
      return e.pillarNotMember || fallback;
    case 'ORPHAN_CHILDREN':
      return e.orphanChildren || fallback;
    default:
      return fallback;
  }
}

// Build a tree out of the flat cluster list. Each cluster gets a `children`
// array; the function returns the roots (clusters with no parent in the set).
// Stable sorting: server already orders by depth/status/confidence, and we
// preserve that order within each child list.
function buildClusterTree(clusters) {
  const byId = new Map(clusters.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parentClusterId && byId.has(c.parentClusterId)) {
      byId.get(c.parentClusterId).children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

// Walk the parent chain for breadcrumb rendering. Returns ancestors only
// (immediate parent last); empty for root clusters. Operates over the flat
// list so we don't need server-side ancestor data.
function getAncestorBreadcrumb(cluster, byId) {
  const out = [];
  let cur = cluster.parentClusterId ? byId.get(cluster.parentClusterId) : null;
  while (cur) {
    out.unshift(cur);
    cur = cur.parentClusterId ? byId.get(cur.parentClusterId) : null;
  }
  return out;
}

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
  const [filter, setFilter] = useState('ALL'); // ALL | DISCOVERED | CONFIRMED | REJECTED | ROOTS
  const [viewMode, setViewMode] = useState('list'); // list | graph
  const [editing, setEditing] = useState(null);
  const [promoting, setPromoting] = useState(null); // { cluster, member } | null
  const [subDiscoveringId, setSubDiscoveringId] = useState(null); // clusterId currently running
  const [error, setError] = useState('');
  // Track which tree nodes are expanded. Roots default-expanded so users
  // immediately see the depth they have. Toggling persists per session.
  const [expandedIds, setExpandedIds] = useState(new Set());

  const loadClusters = async () => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clusters?siteId=${siteId}`);
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      const list = data.clusters || [];
      setClusters(list);
      setStatusCounts(data.statusCounts || {});
      // Default-expand every cluster that has children. The user can collapse
      // afterwards; this keeps "out of sight, out of mind" from happening on
      // first load when the tree is small. Once expandedIds is non-empty for a
      // given session we let the user manage it manually.
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        const expanded = new Set();
        for (const c of list) {
          if (c.hasChildren) expanded.add(c.id);
        }
        return expanded;
      });
    } catch {
      setError(t.errors.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const deleteCluster = async (id, cascade = 'reparent') => {
    setError('');
    const previous = clusters.find((c) => c.id === id);
    try {
      const res = await fetch(`/api/clusters/${id}?cascade=${cascade}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete_failed');
      // Children of the deleted cluster were either re-parented or detached
      // server-side. Reload to refresh parent links + depths in one shot.
      await loadClusters();
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

  const promoteMember = async ({ cluster, entityId, name, mainKeyword, memberEntityIds }) => {
    setError('');
    try {
      const res = await fetch(`/api/clusters/${cluster.id}/promote-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          name: name.trim(),
          mainKeyword: mainKeyword.trim(),
          memberEntityIds,
          ...(cluster.updatedAt ? { expectedUpdatedAt: cluster.updatedAt } : {}),
        }),
      });
      if (res.status === 409) {
        setError(t.errors.staleConflict || t.errors.updateFailed);
        await loadClusters();
        return false;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(mapTreeError(data?.code, t, t.errors.promoteFailed || t.errors.updateFailed));
        return false;
      }
      await loadClusters();
      return true;
    } catch {
      setError(t.errors.promoteFailed || t.errors.updateFailed);
      return false;
    }
  };

  const discoverSubclusters = async (cluster) => {
    if (subDiscoveringId) return false;
    setError('');
    setSubDiscoveringId(cluster.id);
    try {
      const res = await fetch(`/api/clusters/${cluster.id}/discover-subclusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Reuse cycle/depth/tree-error mapping where it applies; otherwise fall
        // back to a sub-discovery-specific message.
        setError(mapTreeError(data?.code, t, t.errors.subDiscoverFailed || t.errors.discoverFailed));
        return false;
      }
      const data = await res.json();
      await loadClusters();
      // Auto-expand the parent so newly discovered children are visible.
      setExpandedIds((prev) => new Set(prev).add(cluster.id));
      // Surface a soft note when AI didn't find anything to discover, so the
      // user doesn't think the action silently failed.
      if (data.subClustersCreated === 0) {
        setError(t.errors.subDiscoverNoneFound || '');
      }
      return true;
    } catch {
      setError(t.errors.subDiscoverFailed || t.errors.discoverFailed);
      return false;
    } finally {
      setSubDiscoveringId(null);
    }
  };

  const demoteCluster = async ({ id, cascadeChildren }) => {
    setError('');
    try {
      const res = await fetch(`/api/clusters/${id}/demote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cascadeChildren }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(mapTreeError(data?.code, t, t.errors.demoteFailed || t.errors.updateFailed));
        return false;
      }
      await loadClusters();
      return true;
    } catch {
      setError(t.errors.demoteFailed || t.errors.updateFailed);
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
      if (!res.ok) {
        // Map server tree-validation errors (cycle, depth, pillar conflict)
        // to user-facing messages.
        const data = await res.json().catch(() => ({}));
        if (data?.code) {
          setError(mapTreeError(data.code, t, t.errors.updateFailed));
          return false;
        }
        throw new Error('update_failed');
      }
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

  // Lookup table for breadcrumb / promote-modal data.
  const clustersById = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);

  // Status filtering applies only to ROOTS — children always render alongside
  // their parent regardless of the children's own status. Without this rule,
  // filtering by DISCOVERED would orphan an entire CONFIRMED parent's subtree.
  // ROOTS filter shows only depth=0 clusters (parents without children of any kind).
  const visibleRoots = useMemo(() => {
    const tree = buildClusterTree(clusters);
    if (filter === 'ALL') return tree;
    if (filter === 'ROOTS') return tree;
    return tree.filter((root) => root.status === filter);
  }, [clusters, filter]);

  const totalCount = clusters.length;
  const rootCount = useMemo(() => clusters.filter((c) => !c.parentClusterId).length, [clusters]);

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
          {/* Roots-only filter — when many sub-clusters exist, lets the user
              focus on top-level structure without collapsing each branch. */}
          <FilterChip
            label={t.filters?.rootsOnly || 'Roots only'}
            count={rootCount}
            active={filter === 'ROOTS'}
            onClick={() => setFilter('ROOTS')}
          />
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
      ) : visibleRoots.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyHint}>{t.noResults}</p>
        </div>
      ) : viewMode === 'graph' ? (
        // Graph still receives the flat cluster list — the radial-tree layout
        // is a Phase 6 concern; today's solar-system view ignores parent links.
        <ClustersGraph
          clusters={clusters}
          translations={t}
          onClusterClick={(cluster) => setEditing(cluster)}
        />
      ) : (
        <div className={styles.tree}>
          {visibleRoots.map((root) => (
            <ClusterTreeNode
              key={root.id}
              cluster={root}
              depth={0}
              expandedIds={expandedIds}
              clustersById={clustersById}
              toggleExpand={toggleExpand}
              translations={t}
              onConfirm={(c) => updateCluster(c.id, { status: 'CONFIRMED' })}
              onReject={(c) => updateCluster(c.id, { status: 'REJECTED' })}
              onEdit={(c) => setEditing(c)}
              onPromote={(cluster, member) => setPromoting({ cluster, member })}
              onDiscoverSubclusters={discoverSubclusters}
              subDiscoveringId={subDiscoveringId}
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
          onDelete={async (id, cascade) => {
            const ok = await deleteCluster(id, cascade);
            if (ok) setEditing(null);
            return ok;
          }}
          onDemote={async ({ id, cascadeChildren }) => {
            const ok = await demoteCluster({ id, cascadeChildren });
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {promoting && (
        <PromoteMemberModal
          parent={promoting.cluster}
          seedMember={promoting.member}
          translations={t}
          onClose={() => setPromoting(null)}
          onSubmit={async (payload) => {
            const ok = await promoteMember({ cluster: promoting.cluster, ...payload });
            if (ok) setPromoting(null);
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

/**
 * ClusterTreeNode
 *
 * Recursive renderer: one ClusterCard per node, plus an indented children
 * container when this node is expanded. Depth is passed through so nested
 * children can render their own breadcrumb / depth-badge correctly.
 */
function ClusterTreeNode({
  cluster,
  depth,
  expandedIds,
  clustersById,
  toggleExpand,
  translations,
  onConfirm,
  onReject,
  onEdit,
  onPromote,
  onDiscoverSubclusters,
  subDiscoveringId,
  onMutate,
}) {
  const hasChildren = (cluster.children?.length ?? 0) > 0;
  const isExpanded = expandedIds.has(cluster.id);
  const breadcrumb = depth > 0 ? getAncestorBreadcrumb(cluster, clustersById) : [];

  return (
    <div className={styles.treeNode}>
      <ClusterCard
        cluster={cluster}
        translations={translations}
        depth={depth}
        breadcrumb={breadcrumb}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggleExpand={hasChildren ? () => toggleExpand(cluster.id) : null}
        onConfirm={() => onConfirm(cluster)}
        onReject={() => onReject(cluster)}
        onEdit={() => onEdit(cluster)}
        onPromoteMember={(member) => onPromote(cluster, member)}
        onDiscoverSubclusters={onDiscoverSubclusters}
        subDiscovering={subDiscoveringId === cluster.id}
        anySubDiscovering={subDiscoveringId != null}
        onMutate={onMutate}
      />
      {hasChildren && isExpanded && (
        <div className={styles.treeChildren}>
          {cluster.children.map((child) => (
            <ClusterTreeNode
              key={child.id}
              cluster={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              clustersById={clustersById}
              toggleExpand={toggleExpand}
              translations={translations}
              onConfirm={onConfirm}
              onReject={onReject}
              onEdit={onEdit}
              onPromote={onPromote}
              onDiscoverSubclusters={onDiscoverSubclusters}
              subDiscoveringId={subDiscoveringId}
              onMutate={onMutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterCard({
  cluster,
  translations,
  onConfirm,
  onReject,
  onEdit,
  onMutate,
  // Tree-only props (optional — when absent, card renders the same as v1+v2).
  depth = 0,
  breadcrumb = [],
  hasChildren = false,
  isExpanded = false,
  onToggleExpand = null,
  onPromoteMember = null,
  onDiscoverSubclusters = null,
  subDiscovering = false,
  anySubDiscovering = false,
}) {
  const t = translations;
  const memberCount = cluster.members?.length || cluster.memberEntityIds?.length || 0;
  const pillar = cluster.members?.find((m) => m.id === cluster.pillarEntityId);
  const memberLabel = memberCount === 1 ? t.memberOne : formatCount(t.members, memberCount);
  const tree = t.tree || {};
  const sep = tree.breadcrumbSeparator || ' › ';

  return (
    <div className={`${styles.card} ${styles[`card_${cluster.status}`] || ''}`}>
      <div className={styles.cardHeader}>
        {breadcrumb.length > 0 && (
          <div className={styles.cardBreadcrumb}>
            {breadcrumb.map((ancestor, i) => (
              <span key={ancestor.id}>
                {ancestor.name}
                {i < breadcrumb.length - 1 && (
                  <span className={styles.crumbSep}>{sep}</span>
                )}
                {i === breadcrumb.length - 1 && <span className={styles.crumbSep}>{sep}</span>}
              </span>
            ))}
          </div>
        )}
        <div className={styles.cardTitleRow}>
          <div className={styles.titleRowLeft}>
            {onToggleExpand ? (
              <button
                type="button"
                className={styles.expandToggle}
                onClick={onToggleExpand}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? tree.collapse : tree.expand}
                title={isExpanded ? tree.collapse : tree.expand}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : depth > 0 ? (
              <span className={styles.expandTogglePlaceholder} aria-hidden />
            ) : null}
            <h3 className={styles.cardName}>{cluster.name}</h3>
          </div>
          {depth > 0 && (
            <span
              className={styles.depthBadge}
              title={(tree.depthLabel || 'L{depth}').replace('{depth}', String(depth))}
            >
              {(tree.depthLabel || 'L{depth}').replace('{depth}', String(depth))}
            </span>
          )}
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
          {hasChildren && (
            <>
              <span className={styles.metaDot}>·</span>
              <span>
                {cluster.childCount === 1
                  ? (tree.childCount || '{n} sub-cluster').replace('{n}', '1')
                  : (tree.childCountPlural || '{n} sub-clusters').replace(
                      '{n}',
                      String(cluster.childCount || 0),
                    )}
              </span>
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
        {(cluster.members || []).slice(0, 6).map((m) => {
          // Pillar can't be promoted (it's the anchor of THIS cluster).
          // Promote button only renders inside the tree view (onPromoteMember
          // present) AND only on confirmed clusters (DISCOVERED clusters
          // shouldn't sprout sub-clusters before they're confirmed).
          const canPromote =
            onPromoteMember && cluster.status === 'CONFIRMED' && m.id !== cluster.pillarEntityId;
          return (
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
              {canPromote && (
                <button
                  type="button"
                  className={styles.memberPromote}
                  onClick={() => onPromoteMember(m)}
                  title={t.actions?.promoteToAnchor || 'Make anchor'}
                  aria-label={t.actions?.promoteToAnchor || 'Make anchor'}
                >
                  <CornerDownRight size={11} />
                  <span>{t.actions?.promoteToAnchor || 'Make anchor'}</span>
                </button>
              )}
            </div>
          );
        })}
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
        {/* Sub-discovery: only meaningful on confirmed parents that have at
            least one non-pillar member to candidate from, and that haven't
            already hit MAX_TREE_DEPTH. Disabled while another sub-discovery
            is in flight (server has maxDuration=300s; we don't want
            overlapping AI runs at the same time). */}
        {onDiscoverSubclusters &&
          cluster.status === 'CONFIRMED' &&
          cluster.pillarEntityId &&
          (cluster.memberEntityIds?.length || 0) > 1 &&
          (cluster.depth ?? 0) < MAX_TREE_DEPTH && (
            <button
              type="button"
              className={styles.actionDiscoverSub}
              onClick={() => onDiscoverSubclusters(cluster)}
              disabled={anySubDiscovering}
              title={t.actions?.discoverSubclusters || 'Discover sub-clusters'}
            >
              {subDiscovering ? (
                <Loader2 size={14} className={styles.spin} />
              ) : (
                <GitBranch size={14} />
              )}
              <span>
                {subDiscovering
                  ? t.actions?.discoveringSubclusters || 'Discovering...'
                  : t.actions?.discoverSubclusters || 'Discover sub-clusters'}
              </span>
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
            <LinkGapsByType
              clusterId={cluster.id}
              gaps={data.linkGaps}
              totalsByType={data.totals.linkGapsByType}
              moreCountByType={computeMoreCountByType(data.totals.linkGapsByType, data.linkGaps)}
              translations={ht}
              onMutate={onMutate}
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

// Render order matters: PARENT (HIGH) first, ANCESTOR (MEDIUM) next,
// BRAND/SIBLING (LOW) last. Each type renders as its own subsection so the
// user can scan typed counts at a glance instead of mixed-severity rows.
const LINK_GAP_TYPES_ORDER = ['PARENT', 'ANCESTOR', 'BRAND', 'SIBLING'];
const LINK_GAP_TOP_PER_TYPE = 3;

// Each capped category in the list response carries at most HEALTH_TOP_N_IN_LIST
// (5) total gaps across all four types, so the per-type "+more" count is
// clamped to whatever's actually visible in the totals breakdown.
function computeMoreCountByType(totalsByType, visibleGaps) {
  const visibleCounts = { PARENT: 0, ANCESTOR: 0, BRAND: 0, SIBLING: 0 };
  for (const g of visibleGaps) {
    if (visibleCounts[g.type] !== undefined) visibleCounts[g.type] += 1;
  }
  const out = {};
  for (const t of LINK_GAP_TYPES_ORDER) {
    const total = totalsByType?.[t] || 0;
    const shownInList = Math.min(visibleCounts[t], LINK_GAP_TOP_PER_TYPE);
    out[t] = Math.max(0, total - shownInList);
  }
  return out;
}

function LinkGapsByType({ clusterId, gaps, totalsByType, moreCountByType, translations: ht, onMutate }) {
  // Bucket the visible gaps by type, preserving their (already severity-sorted) order.
  const buckets = { PARENT: [], ANCESTOR: [], BRAND: [], SIBLING: [] };
  for (const g of gaps) {
    if (buckets[g.type]) buckets[g.type].push(g);
  }
  const moreLabelTemplate = ht.more || '+{n} more';

  return (
    <>
      {LINK_GAP_TYPES_ORDER.map((type) => {
        const items = buckets[type].slice(0, LINK_GAP_TOP_PER_TYPE);
        // Skip rendering a section when there are zero gaps of this type AND
        // none waiting in the "more" overflow either.
        const totalForType = totalsByType?.[type] || 0;
        if (items.length === 0 && totalForType === 0) return null;
        const typeStrings = ht.linkGaps?.types?.[type] || {};
        const moreCount = moreCountByType[type] || 0;
        return (
          <HealthSection
            key={type}
            icon={<Link2 size={13} />}
            title={typeStrings.title || ht.linkGaps?.title || 'Internal link gaps'}
            items={items.map((g) => ({
              key: `${g.fromEntityId}-${g.toEntityId}-${type}`,
              primary: `${g.fromTitle} → ${g.toTitle}`,
              secondary: typeStrings.description,
              action: (
                <FixLinkGapButton
                  clusterId={clusterId}
                  fromEntityId={g.fromEntityId}
                  toEntityId={g.toEntityId}
                  gapType={type}
                  translations={ht.linkGaps || {}}
                  onSuccess={onMutate}
                />
              ),
            }))}
            moreLabel={moreCount > 0 ? moreLabelTemplate.replace('{n}', String(moreCount)) : null}
          />
        );
      })}
    </>
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

function FixLinkGapButton({ clusterId, fromEntityId, toEntityId, gapType, translations: ht, onSuccess }) {
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
        body: JSON.stringify({ fromEntityId, toEntityId, ...(gapType ? { gapType } : {}) }),
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

function EditClusterModal({ cluster, translations, onClose, onSave, onDelete, onDemote }) {
  const t = translations;
  const [name, setName] = useState(cluster.name);
  const [mainKeyword, setMainKeyword] = useState(cluster.mainKeyword);
  const [pillarEntityId, setPillarEntityId] = useState(cluster.pillarEntityId || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDemote, setShowDemote] = useState(false);
  const [demoteCascade, setDemoteCascade] = useState('keep'); // keep | detach
  const [demoting, setDemoting] = useState(false);

  const members = cluster.members || [];
  const isChild = Boolean(cluster.parentClusterId);
  const dt = t.demote || {};

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
    // Default cascade='reparent' — children inherit the deleted cluster's parent.
    // The modal doesn't expose detach mode (advanced); users with that need can
    // demote first, then delete.
    const ok = await onDelete?.(cluster.id, 'reparent');
    if (!ok) setDeleting(false);
  };

  const handleDemote = async () => {
    if (demoting) return;
    setDemoting(true);
    const ok = await onDemote?.({ id: cluster.id, cascadeChildren: demoteCascade });
    if (!ok) setDemoting(false);
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

          {/* Detach-from-parent affordance: only meaningful for child clusters.
              Cascade choice lets the user keep their subtree intact (default)
              or detach all sub-clusters into roots simultaneously. */}
          {isChild && onDemote && !showDemote && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowDemote(true)}
            >
              <CornerDownRight size={14} />
              <span>{t.actions?.detachFromParent || 'Detach from parent'}</span>
            </button>
          )}
          {isChild && onDemote && showDemote && (
            <div className={styles.label}>
              <span>{dt.modalTitle || 'Detach from parent'}</span>
              <span className={styles.hint}>{dt.intro}</span>
              <div className={styles.demoteOptions}>
                <label
                  className={`${styles.demoteOption} ${demoteCascade === 'keep' ? styles.demoteOptionChecked : ''}`}
                >
                  <input
                    type="radio"
                    name="demoteCascade"
                    value="keep"
                    checked={demoteCascade === 'keep'}
                    onChange={() => setDemoteCascade('keep')}
                  />
                  <span>{dt.cascadeKeep || 'Keep its sub-clusters'}</span>
                </label>
                <label
                  className={`${styles.demoteOption} ${demoteCascade === 'detach' ? styles.demoteOptionChecked : ''}`}
                >
                  <input
                    type="radio"
                    name="demoteCascade"
                    value="detach"
                    checked={demoteCascade === 'detach'}
                    onChange={() => setDemoteCascade('detach')}
                  />
                  <span>{dt.cascadeDetach || 'Also detach its sub-clusters to roots'}</span>
                </label>
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleDemote}
                disabled={demoting}
              >
                {demoting && <Loader2 size={14} className={styles.spin} />}
                <span>{dt.confirm || 'Detach'}</span>
              </button>
            </div>
          )}

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

/**
 * PromoteMemberModal
 *
 * Creates a new sub-cluster anchored on `seedMember`. The user picks which
 * other parent-cluster members should also move into the new sub-cluster
 * (default: only the anchor; rest stay with the parent).
 *
 * Defaults:
 *   - name = seed member's title
 *   - mainKeyword = "<parent.mainKeyword> — <member.title>" (heuristic; user-editable)
 *   - selected non-anchor members = [] (anchor-only sub-cluster)
 */
function PromoteMemberModal({ parent, seedMember, translations, onClose, onSubmit }) {
  const t = translations;
  const pt = t.promote || {};
  const parentMembers = parent.members || [];
  const otherMembers = parentMembers.filter((m) => m.id !== seedMember.id);

  const [name, setName] = useState(seedMember.title || '');
  const [mainKeyword, setMainKeyword] = useState(
    parent.mainKeyword && seedMember.title
      ? `${parent.mainKeyword} — ${seedMember.title}`
      : seedMember.title || '',
  );
  // Anchor is always part of the sub-cluster; checked extras start empty.
  const [extraSelected, setExtraSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const toggleExtra = (id) => {
    setExtraSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !mainKeyword.trim()) return;
    setSaving(true);
    const memberEntityIds = [seedMember.id, ...Array.from(extraSelected)];
    const ok = await onSubmit({
      entityId: seedMember.id,
      name: name.trim(),
      mainKeyword: mainKeyword.trim(),
      memberEntityIds,
    });
    if (!ok) setSaving(false);
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{pt.title || 'Promote member to sub-cluster anchor'}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="close">
            <X size={18} />
          </button>
        </div>
        {pt.intro && <p className={styles.modalIntro}>{pt.intro}</p>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.label}>
            <span>{pt.anchorLabel || 'Anchor (pillar of new sub-cluster)'}</span>
            <div className={`${styles.memberPickerRow} ${styles.memberPickerRowChecked}`}>
              <Star size={14} className={styles.pillarIconActive} />
              <span className={styles.memberPickerTitle}>{seedMember.title}</span>
              <span className={styles.memberPickerAnchorBadge}>★</span>
            </div>
          </div>

          <label className={styles.label}>
            <span>{pt.nameLabel || 'Sub-cluster name'}</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={pt.namePlaceholder}
              required
            />
          </label>

          <label className={styles.label}>
            <span>{pt.keywordLabel || 'Anchor keyword'}</span>
            <input
              type="text"
              className={styles.input}
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              placeholder={pt.keywordPlaceholder}
              required
            />
          </label>

          <div className={styles.label}>
            <span>{pt.movedMembersLabel || 'Members to move from parent'}</span>
            {otherMembers.length === 0 ? (
              <span className={styles.hint}>
                {pt.noMovedMembers || 'Only the anchor will be in the sub-cluster.'}
              </span>
            ) : (
              <>
                <div className={styles.memberPicker}>
                  {otherMembers.map((m) => {
                    const checked = extraSelected.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`${styles.memberPickerRow} ${checked ? styles.memberPickerRowChecked : ''}`}
                        onClick={() => toggleExtra(m.id)}
                      >
                        <span className={styles.memberPickerCheck}>
                          {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                        <span className={styles.memberPickerTitle}>{m.title}</span>
                      </div>
                    );
                  })}
                </div>
                <span className={styles.hint}>{pt.movedMembersHint}</span>
              </>
            )}
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              {t.actions.cancel}
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || !name.trim() || !mainKeyword.trim()}
            >
              {saving ? <Loader2 size={14} className={styles.spin} /> : <Sparkles size={14} />}
              <span>{pt.confirm || 'Create sub-cluster'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
