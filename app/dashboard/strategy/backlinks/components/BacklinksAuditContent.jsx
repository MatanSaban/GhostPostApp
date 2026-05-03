'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Crown,
  RefreshCw,
  Upload,
  Link2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Search,
  X,
  MoreHorizontal,
  AlertTriangle,
  ShieldOff,
  Globe,
  Link as LinkIcon,
  ListChecks,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { Button, LoadingState, StatsGrid } from '@/app/dashboard/components';
import UpgradePlanModal from '@/app/components/ui/UpgradePlanModal';
import { GscImportModal } from './GscImportModal';
import { DisavowList } from './DisavowList';
import { InsightsPanel } from './InsightsPanel';
import styles from '../page.module.css';

// Plan-gating is driven by the SERVER's response, not the signed-in user's
// plan. This matters for super-admins (and impersonation) viewing another
// account's site: their own plan is irrelevant; the site's account plan is
// what decides feature access. The /api/strategy/backlinks/* endpoints all
// return 403 with `code: 'PLAN_REQUIRED'` when the SITE's account is on free,
// and that's what flips this page into the paywall view.
function isPlanGatedResponse(status, body) {
  return status === 403 && body?.code === 'PLAN_REQUIRED';
}

function relativeTime(dateStr, locale) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const isHe = locale === 'he';
  if (mins < 1) return isHe ? 'רגע' : 'just now';
  if (mins < 60) return isHe ? `${mins} דקות` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isHe ? `${hours} שעות` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return isHe ? `${days} ימים` : `${days}d`;
}

function shortDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function fillTemplate(str, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    str || ''
  );
}

const STATUS_TABS = ['ALL', 'ACTIVE', 'LOST', 'BROKEN'];
const PAGE_SIZE = 50;

const DEFAULT_FILTERS = {
  status: 'ACTIVE',
  drMin: '',
  drMax: '',
  dofollow: 'all',
  anchor: '',
  toxicOnly: false,
};

export function BacklinksAuditContent() {
  const { t, locale } = useLocale();
  const { user, isLoading: isUserLoading } = useUser();
  const { selectedSite } = useSite();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [viewMode, setViewMode] = useState('backlinks'); // 'backlinks' | 'disavow'
  const [openMenuId, setOpenMenuId] = useState(null);
  const [busyRowId, setBusyRowId] = useState(null);

  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isPlanGated, setIsPlanGated] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // anchor input is debounced — typing fires a request 400ms after last keystroke,
  // not on every character.
  const [anchorInput, setAnchorInput] = useState('');
  const anchorDebounce = useRef(null);

  const siteId = selectedSite?.id || null;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('siteId', siteId || '');
    p.set('page', String(page));
    p.set('pageSize', String(PAGE_SIZE));
    if (filters.status !== 'ALL') p.set('status', filters.status);
    if (filters.drMin !== '') p.set('drMin', String(filters.drMin));
    if (filters.drMax !== '') p.set('drMax', String(filters.drMax));
    if (filters.dofollow !== 'all') p.set('dofollow', filters.dofollow);
    if (filters.anchor) p.set('anchor', filters.anchor);
    if (filters.toxicOnly) p.set('toxic', 'true');
    return p.toString();
  }, [siteId, page, filters]);

  const loadList = useCallback(async () => {
    if (!siteId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/strategy/backlinks?${queryString}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (isPlanGatedResponse(res.status, body)) {
          setIsPlanGated(true);
        }
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
      setIsPlanGated(false);
    } finally {
      setIsLoading(false);
    }
  }, [siteId, queryString]);

  const loadMetrics = useCallback(async () => {
    if (!siteId) return;
    try {
      const res = await fetch(`/api/strategy/backlinks/metrics?siteId=${siteId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (isPlanGatedResponse(res.status, body)) {
          setIsPlanGated(true);
        }
        setMetrics(null);
        return;
      }
      setMetrics(await res.json());
      setIsPlanGated(false);
    } catch {
      setMetrics(null);
    }
  }, [siteId]);

  // Site changed → wipe everything and load fresh.
  useEffect(() => {
    setData(null);
    setMetrics(null);
    setFeedback(null);
    setFilters(DEFAULT_FILTERS);
    setAnchorInput('');
    setPage(1);
    setIsPlanGated(false);
    if (siteId) {
      loadList();
      loadMetrics();
    }
    // We deliberately don't depend on loadList/loadMetrics here — they change
    // with queryString and would cause a duplicate fetch on filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Filters or page changed (but not on the initial site mount, that's handled above).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (siteId && !isPlanGated) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  // Debounce anchor input → filters.anchor.
  useEffect(() => {
    if (anchorDebounce.current) clearTimeout(anchorDebounce.current);
    anchorDebounce.current = setTimeout(() => {
      setFilters(f => f.anchor === anchorInput ? f : { ...f, anchor: anchorInput });
      setPage(1);
    }, 400);
    return () => { if (anchorDebounce.current) clearTimeout(anchorDebounce.current); };
  }, [anchorInput]);

  const handleRefresh = async () => {
    if (!siteId || isSyncing) return;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/strategy/backlinks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && body.retryAfterSeconds) {
          const hours = Math.max(1, Math.ceil(body.retryAfterSeconds / 3600));
          setFeedback({ kind: 'error', text: fillTemplate(t('backlinkAudit.syncCooldown'), { hours }) });
        } else {
          setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.syncFailed') });
        }
        return;
      }
      const sync = body.sync || {};
      setFeedback({
        kind: 'success',
        text: fillTemplate(t('backlinkAudit.syncResult'), {
          total: sync.totalFound || 0,
          new: sync.newCount || 0,
          lost: sync.lostCount || 0,
        }),
      });
      await Promise.all([loadList(), loadMetrics()]);
    } catch {
      setFeedback({ kind: 'error', text: t('backlinkAudit.syncFailed') });
    } finally {
      setIsSyncing(false);
    }
  };

  const updateFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAnchorInput('');
    setPage(1);
  };

  // Mark/unmark toxic via PATCH. Updates the row in-place so the table doesn't
  // flicker through a full reload, then refreshes metrics so the KPI count stays in sync.
  const toggleToxic = async (row) => {
    if (busyRowId) return;
    setBusyRowId(row.id);
    setOpenMenuId(null);
    try {
      const next = !row.isToxic;
      const res = await fetch(`/api/strategy/backlinks/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isToxic: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.actions.errorGeneric') });
        return;
      }
      setData(prev => prev ? {
        ...prev,
        rows: prev.rows.map(r => r.id === row.id ? { ...r, isToxic: next } : r),
      } : prev);
      loadMetrics();
    } finally {
      setBusyRowId(null);
    }
  };

  const disavow = async (row, scope) => {
    if (busyRowId) return;
    setBusyRowId(row.id);
    setOpenMenuId(null);
    try {
      const value = scope === 'DOMAIN' ? row.referringDomain : row.referringUrl;
      const res = await fetch('/api/strategy/backlinks/disavow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, scope, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ kind: 'error', text: body.error || t('backlinkAudit.actions.errorGeneric') });
        return;
      }
      setFeedback({
        kind: 'success',
        text: fillTemplate(t(body.alreadyExisted ? 'backlinkAudit.actions.disavowAlready' : 'backlinkAudit.actions.disavowAdded'), {
          coverage: body.coverageCount ?? 0,
        }),
      });
      // Reload list + metrics so isDisavowed updates everywhere covered.
      await Promise.all([loadList(), loadMetrics()]);
    } finally {
      setBusyRowId(null);
    }
  };

  // Click anywhere outside an open row menu closes it.
  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = (e) => {
      if (!e.target.closest?.('[data-row-menu]')) setOpenMenuId(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openMenuId]);

  if (isUserLoading) return null;

  if (!selectedSite) {
    return (
      <div className={styles.selectSite}>
        <Link2 size={32} />
        <p>{t('backlinkAudit.selectSite')}</p>
      </div>
    );
  }

  if (isPlanGated) {
    return (
      <>
        <div className={styles.gateCard}>
          <div className={styles.gateIcon}><Crown size={28} /></div>
          <h2 className={styles.gateTitle}>{t('backlinkAudit.premiumGate.title')}</h2>
          <p className={styles.gateDescription}>{t('backlinkAudit.premiumGate.description')}</p>
          <div className={styles.gateActions}>
            <Button onClick={() => setShowUpgradeModal(true)}>
              {t('backlinkAudit.premiumGate.upgradeCta')}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
        <UpgradePlanModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
      </>
    );
  }

  const lastSync = data?.lastSync;
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const kpiStats = metrics ? [
    {
      iconName: 'Link',
      value: (metrics.totals?.all ?? 0).toLocaleString(),
      label: t('backlinkAudit.kpi.totalBacklinks'),
      color: 'purple',
    },
    {
      iconName: 'Database',
      value: (metrics.referringDomains ?? 0).toLocaleString(),
      label: t('backlinkAudit.kpi.referringDomains'),
      color: 'blue',
    },
    {
      iconName: 'TrendingDown',
      value: (metrics.lostRecent ?? 0).toLocaleString(),
      label: fillTemplate(t('backlinkAudit.kpi.lostRecent'), { days: metrics.lostWindowDays ?? 30 }),
      color: 'red',
    },
    {
      iconName: 'AlertTriangle',
      value: (metrics.toxic ?? 0).toLocaleString(),
      label: t('backlinkAudit.kpi.toxic'),
      color: 'red',
    },
    {
      iconName: 'CheckCircle',
      value: (metrics.disavowed ?? 0).toLocaleString(),
      label: t('backlinkAudit.kpi.disavowed'),
      color: 'green',
    },
  ] : [];

  const hasActiveFilters =
    filters.status !== DEFAULT_FILTERS.status ||
    filters.drMin !== '' ||
    filters.drMax !== '' ||
    filters.dofollow !== 'all' ||
    filters.anchor !== '' ||
    filters.toxicOnly;

  return (
    <>
      {kpiStats.length > 0 && (
        <div className={styles.kpiWrap}>
          <StatsGrid stats={kpiStats} columns={4} />
        </div>
      )}

      <InsightsPanel
        siteId={siteId}
        onApplied={() => Promise.all([loadList(), loadMetrics()])}
      />

      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          {lastSync?.completedAt
            ? fillTemplate(t('backlinkAudit.lastSyncedAgo'), { time: relativeTime(lastSync.completedAt, locale) })
            : t('backlinkAudit.lastSyncedNever')}
        </div>
        <div className={styles.toolbarActions}>
          <Button onClick={handleRefresh} disabled={isSyncing}>
            {isSyncing ? <Loader2 size={16} className={styles.spinning} /> : <RefreshCw size={16} />}
            {isSyncing ? t('backlinkAudit.refreshing') : t('backlinkAudit.refresh')}
          </Button>
          <Button variant="ghost" onClick={() => setShowImportModal(true)} disabled={isSyncing}>
            <Upload size={16} />
            {t('backlinkAudit.emptyState.importAction')}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className={`${styles.feedback} ${feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess}`}>
          {feedback.text}
        </div>
      )}

      <div className={styles.viewToggle}>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${viewMode === 'backlinks' ? styles.viewToggleActive : ''}`}
          onClick={() => setViewMode('backlinks')}
        >
          <Link2 size={14} />
          {t('backlinkAudit.viewToggle.backlinks')}
        </button>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${viewMode === 'disavow' ? styles.viewToggleActive : ''}`}
          onClick={() => setViewMode('disavow')}
        >
          <ListChecks size={14} />
          {t('backlinkAudit.viewToggle.disavow')}
          {metrics?.disavowed > 0 && (
            <span className={styles.viewToggleCount}>{metrics.disavowed}</span>
          )}
        </button>
      </div>

      {viewMode === 'disavow' && (
        <DisavowList
          siteId={siteId}
          onChanged={() => Promise.all([loadList(), loadMetrics()])}
        />
      )}

      {viewMode === 'backlinks' && (
      <div className={styles.tabs}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${filters.status === tab ? styles.tabActive : ''}`}
            onClick={() => updateFilter('status', tab)}
          >
            {t(`backlinkAudit.tabs.${tab.toLowerCase()}`)}
          </button>
        ))}
      </div>
      )}

      {viewMode === 'backlinks' && (
      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <Search size={14} className={styles.filterIcon} />
          <input
            type="text"
            className={styles.filterInput}
            placeholder={t('backlinkAudit.filters.anchorPlaceholder')}
            value={anchorInput}
            onChange={(e) => setAnchorInput(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('backlinkAudit.filters.drRange')}</span>
          <input
            type="number"
            min="0"
            max="100"
            className={styles.filterNumber}
            placeholder={t('backlinkAudit.filters.drMin')}
            value={filters.drMin}
            onChange={(e) => updateFilter('drMin', e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))))}
          />
          <span className={styles.filterDash}>—</span>
          <input
            type="number"
            min="0"
            max="100"
            className={styles.filterNumber}
            placeholder={t('backlinkAudit.filters.drMax')}
            value={filters.drMax}
            onChange={(e) => updateFilter('drMax', e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </div>

        <select
          className={styles.filterSelect}
          value={filters.dofollow}
          onChange={(e) => updateFilter('dofollow', e.target.value)}
        >
          <option value="all">{t('backlinkAudit.filters.dofollowAll')}</option>
          <option value="true">{t('backlinkAudit.filters.dofollowOnly')}</option>
          <option value="false">{t('backlinkAudit.filters.nofollowOnly')}</option>
        </select>

        <label className={styles.filterCheckbox}>
          <input
            type="checkbox"
            checked={filters.toxicOnly}
            onChange={(e) => updateFilter('toxicOnly', e.target.checked)}
          />
          <span>{t('backlinkAudit.filters.toxicOnly')}</span>
        </label>

        {hasActiveFilters && (
          <button type="button" className={styles.filterReset} onClick={resetFilters}>
            <X size={14} />
            {t('backlinkAudit.filters.reset')}
          </button>
        )}
      </div>
      )}

      {viewMode === 'backlinks' && isLoading && !data && (
        <div className={styles.loadingWrap}>
          <LoadingState message={t('backlinkAudit.loading')} />
        </div>
      )}

      {viewMode === 'backlinks' && !isLoading && rows.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Link2 size={32} /></div>
          <h3 className={styles.emptyTitle}>{t('backlinkAudit.emptyState.title')}</h3>
          <p className={styles.emptyDescription}>{t('backlinkAudit.emptyState.description')}</p>
        </div>
      )}

      {viewMode === 'backlinks' && rows.length > 0 && (
        <div className={styles.tableWrap}>
          <div className={styles.tableMeta}>
            {fillTemplate(t('backlinkAudit.table.rowCount'), { shown: rows.length, total })}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('backlinkAudit.table.source')}</th>
                <th>{t('backlinkAudit.table.anchor')}</th>
                <th className={styles.colNarrow}>{t('backlinkAudit.table.dr')}</th>
                <th className={styles.colNarrow}>{t('backlinkAudit.table.status')}</th>
                <th className={styles.colNarrow}>{t('backlinkAudit.table.lastSeen')}</th>
                <th className={styles.colNarrow} aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className={styles.sourceCell}>
                      <a
                        href={row.referringUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={styles.sourceLink}
                      >
                        {row.referringDomain || shortDomain(row.referringUrl)}
                        <ExternalLink size={12} />
                      </a>
                      {row.isDofollow === false && (
                        <span className={styles.nofollowTag}>{t('backlinkAudit.table.nofollow')}</span>
                      )}
                      {row.isToxic && <span className={styles.toxicTag}>{t('backlinkAudit.kpi.toxic')}</span>}
                      {row.isDisavowed && <span className={styles.disavowedTag}>{t('backlinkAudit.kpi.disavowed')}</span>}
                    </div>
                  </td>
                  <td className={styles.anchorCell}>
                    {row.anchorText || <span className={styles.muted}>{t('backlinkAudit.table.noAnchor')}</span>}
                  </td>
                  <td className={styles.colNarrow}>{row.domainRating ?? '—'}</td>
                  <td className={styles.colNarrow}>
                    <StatusBadge status={row.status} t={t} />
                  </td>
                  <td className={styles.colNarrow}>
                    {row.lastSeen ? relativeTime(row.lastSeen, locale) : '—'}
                  </td>
                  <td className={styles.colNarrow}>
                    <RowActionsMenu
                      row={row}
                      isOpen={openMenuId === row.id}
                      isBusy={busyRowId === row.id}
                      onToggle={() => setOpenMenuId(prev => prev === row.id ? null : row.id)}
                      onToggleToxic={() => toggleToxic(row)}
                      onDisavow={(scope) => disavow(row, scope)}
                      t={t}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ArrowLeft size={14} />
                {t('backlinkAudit.pagination.prev')}
              </button>
              <span className={styles.pageIndicator}>
                {fillTemplate(t('backlinkAudit.pagination.page'), { page, total: totalPages })}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                {t('backlinkAudit.pagination.next')}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <GscImportModal
        isOpen={showImportModal}
        siteId={siteId}
        onClose={() => setShowImportModal(false)}
        onComplete={async ({ totalFound, newCount }) => {
          setFeedback({
            kind: 'success',
            text: fillTemplate(t('backlinkAudit.import.success'), {
              total: totalFound,
              new: newCount,
            }),
          });
          await Promise.all([loadList(), loadMetrics()]);
        }}
      />
    </>
  );
}

function StatusBadge({ status, t }) {
  const cls =
    status === 'LOST' ? styles.statusLost
    : status === 'BROKEN' ? styles.statusBroken
    : styles.statusActive;
  return (
    <span className={`${styles.statusBadge} ${cls}`}>
      {t(`backlinkAudit.status.${status.toLowerCase()}`)}
    </span>
  );
}

function RowActionsMenu({ row, isOpen, isBusy, onToggle, onToggleToxic, onDisavow, t }) {
  return (
    <div className={styles.rowMenu} data-row-menu>
      <button
        type="button"
        className={styles.rowMenuTrigger}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        disabled={isBusy}
        aria-label={t('backlinkAudit.actions.menuLabel')}
      >
        {isBusy ? <Loader2 size={14} className={styles.spinning} /> : <MoreHorizontal size={14} />}
      </button>
      {isOpen && (
        <div className={styles.rowMenuPanel}>
          <button type="button" className={styles.rowMenuItem} onClick={onToggleToxic}>
            <AlertTriangle size={14} />
            {row.isToxic ? t('backlinkAudit.actions.unmarkToxic') : t('backlinkAudit.actions.markToxic')}
          </button>
          <button
            type="button"
            className={styles.rowMenuItem}
            onClick={() => onDisavow('DOMAIN')}
            disabled={!row.referringDomain}
          >
            <Globe size={14} />
            {t('backlinkAudit.actions.disavowDomain')}
          </button>
          <button
            type="button"
            className={styles.rowMenuItem}
            onClick={() => onDisavow('URL')}
          >
            <LinkIcon size={14} />
            {t('backlinkAudit.actions.disavowUrl')}
          </button>
        </div>
      )}
    </div>
  );
}
