'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  AlertTriangle,
  TrendingDown,
  Hash,
  AlertCircle,
  Target,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  ShieldOff,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
import styles from '../page.module.css';

function fillTemplate(str, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v ?? '')),
    str || ''
  );
}

// Match the insightSubtype stamped by the detector into `data` to a UI presenter.
const SUBTYPE_PRESENTERS = {
  BACKLINK_TOXIC: {
    icon: AlertTriangle,
    color: 'red',
    titleKey: 'backlinkAudit.insights.toxic.title',
    descKey: 'backlinkAudit.insights.toxic.description',
    descVars: (data) => ({
      domain: data.referringDomain,
      reason: data.reason || '',
      confidence: Math.round((data.confidence || 0) * 100),
    }),
  },
  BACKLINK_LOST_HIGH_VALUE: {
    icon: TrendingDown,
    color: 'amber',
    titleKey: 'backlinkAudit.insights.lostHighValue.title',
    descKey: 'backlinkAudit.insights.lostHighValue.description',
    descVars: (data) => ({
      domain: data.referringDomain,
      count: data.count,
      avgDR: data.avgDR,
    }),
  },
  BACKLINK_ANCHOR_OVER_OPT: {
    icon: Hash,
    color: 'amber',
    titleKey: 'backlinkAudit.insights.anchorOverOpt.title',
    descKey: 'backlinkAudit.insights.anchorOverOpt.description',
    descVars: (data) => ({
      target: data.targetUrl,
      anchor: data.topAnchor,
      sharePct: data.sharePct,
      total: data.totalLinks,
    }),
  },
  BACKLINK_BROKEN_TARGET: {
    icon: AlertCircle,
    color: 'red',
    titleKey: 'backlinkAudit.insights.brokenTarget.title',
    descKey: 'backlinkAudit.insights.brokenTarget.description',
    descVars: (data) => ({
      target: data.targetUrl,
      status: data.httpStatus,
      inbound: data.inboundLinks,
    }),
  },
  BACKLINK_OPPORTUNITY: {
    icon: Target,
    color: 'purple',
    titleKey: 'backlinkAudit.insights.opportunity.title',
    descKey: 'backlinkAudit.insights.opportunity.description',
    descVars: (data) => ({
      domain: data.referringDomain,
      dr: data.domainRating,
      competitor: data.viaCompetitor,
    }),
  },
};

export function InsightsPanel({ siteId, onApplied }) {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) { setData(null); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/strategy/backlinks/insights?siteId=${siteId}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const handleApply = async (insight) => {
    if (busyId) return;
    setBusyId(insight.id);
    try {
      const res = await fetch(`/api/strategy/backlinks/insights/${insight.id}/apply`, {
        method: 'POST',
      });
      if (res.ok) {
        await load();
        onApplied?.();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (insight) => {
    if (busyId) return;
    setBusyId(insight.id);
    try {
      await fetch(`/api/strategy/backlinks/insights/${insight.id}/dismiss`, {
        method: 'POST',
      });
      // Optimistic local removal — avoids re-fetching the whole list for a dismiss.
      setData(prev => prev ? { ...prev, insights: prev.insights.filter(i => i.id !== insight.id) } : prev);
    } finally {
      setBusyId(null);
    }
  };

  if (!siteId) return null;
  const insights = data?.insights || [];
  if (!isLoading && insights.length === 0) return null;

  return (
    <div className={styles.insightsPanel}>
      <button
        type="button"
        className={styles.insightsHeader}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div className={styles.insightsHeaderLeft}>
          <Sparkles size={16} className={styles.insightsHeaderIcon} />
          <span className={styles.insightsHeaderTitle}>{t('backlinkAudit.insights.title')}</span>
          <span className={styles.insightsCount}>{insights.length}</span>
        </div>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {!collapsed && (
        <div className={styles.insightsBody}>
          {isLoading && insights.length === 0 ? (
            <div className={styles.insightsSkeleton}><Loader2 size={16} className={styles.spinning} /></div>
          ) : insights.map(ins => {
            const subtype = ins.data?.insightSubtype;
            const presenter = SUBTYPE_PRESENTERS[subtype];
            if (!presenter) return null;
            const Icon = presenter.icon;
            const title = t(presenter.titleKey);
            const desc = fillTemplate(t(presenter.descKey), presenter.descVars(ins.data || {}));
            const isFixable = ins.actionType === 'disavow_domain';

            return (
              <div key={ins.id} className={`${styles.insightCard} ${styles[`insightColor_${presenter.color}`] || ''}`}>
                <div className={styles.insightIcon}><Icon size={16} /></div>
                <div className={styles.insightContent}>
                  <div className={styles.insightTitle}>{title}</div>
                  <div className={styles.insightDesc}>{desc}</div>
                  <div className={styles.insightActions}>
                    {isFixable && (
                      <button
                        type="button"
                        className={`${styles.insightBtn} ${styles.insightBtnPrimary}`}
                        onClick={() => handleApply(ins)}
                        disabled={busyId === ins.id}
                      >
                        {busyId === ins.id
                          ? <Loader2 size={12} className={styles.spinning} />
                          : <ShieldOff size={12} />}
                        {t('backlinkAudit.insights.applyDisavow')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.insightBtn}
                      onClick={() => handleDismiss(ins)}
                      disabled={busyId === ins.id}
                    >
                      <X size={12} />
                      {t('backlinkAudit.insights.dismiss')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
