'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  Edit3,
  Save,
  RefreshCw,
  Download,
  Sparkles,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Layers,
  GitCompareArrows,
  ArrowUpDown,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { languageNamesFromCodes } from '@/lib/reports/language-names';
import styles from './ReportPreviewModal.module.css';

const SECTION_LABEL_KEYS = {
  overview: 'overview',
  aiSummary: 'aiSummary',
  healthScore: 'healthScore',
  aiActions: 'aiActions',
  keywords: 'keywords',
  competitors: 'competitors',
  seo: 'seo',
  geo: 'geo',
  siteAudits: 'siteAudits',
};

// Authoritative ordering of every section the report can have. Used by
// the section-editor "Add section" dropdown to know what's available
// when a section was previously removed from the report.
const ALL_SECTION_IDS = [
  'overview',
  'aiSummary',
  'healthScore',
  'aiActions',
  'keywords',
  'competitors',
  'seo',
  'geo',
  'siteAudits',
];

function formatDate(date, locale = 'en') {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * In-platform preview of a generated report. Shows the same structure as
 * the PDF (overview tiles, AI summary, health score, etc.) and lets the
 * user edit the AI summary inline. Saving the edit re-renders the PDF
 * via /api/reports/[id]/regenerate so the downloadable file stays in sync.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {string} props.reportId
 * @param {(report: object) => void} [props.onUpdated]
 */
export function ReportPreviewModal({ isOpen, onClose, reportId, onUpdated }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftSummary, setDraftSummary] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState('');

  // Sections editor mode: when on, each section header gets up/down/
  // remove controls and a save bar offers to persist + regenerate the
  // PDF. The draft is initialized from the report's saved sectionsConfig
  // and stays disconnected from `data` until saved.
  const [sectionsEditing, setSectionsEditing] = useState(false);
  const [sectionsDraft, setSectionsDraft] = useState([]);

  // Load preview data on open and whenever the reportId changes. Keeping
  // the fetch effect-driven (not in onClick) means re-opening the same
  // report after a regenerate refreshes the displayed snapshot.
  useEffect(() => {
    if (!isOpen || !reportId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/reports/${reportId}/preview`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to load preview');
        }
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setDraftSummary(json.report?.aiSummary || '');
        setEditing(false);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, reportId]);

  // Poll while a regenerate is in flight so the modal flips back to the
  // updated preview automatically. Without this the user would see the
  // stale snapshot until they manually closed and reopened the modal.
  useEffect(() => {
    if (!isOpen || !reportId || data?.report?.status !== 'PENDING') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/reports/${reportId}/preview`);
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
        if (json.report?.status !== 'PENDING') {
          setIsRegenerating(false);
          onUpdated?.(json.report);
          clearInterval(interval);
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen, reportId, data?.report?.status]);

  const report = data?.report;
  const branding = data?.branding;
  const site = data?.site;

  const sectionsOrdered = useMemo(() => {
    const cfg = report?.sectionsConfig?.sections;
    if (Array.isArray(cfg)) return cfg.filter((s) => s?.enabled !== false).map((s) => s.id).filter(Boolean);
    return [];
  }, [report]);

  // While the editor is open we render from the local draft so the
  // user sees their changes (reorder/remove/add) immediately. Saved
  // changes flow back into `data.report.sectionsConfig` afterwards.
  const displayedSections = useMemo(() => {
    if (!sectionsEditing) return sectionsOrdered;
    return sectionsDraft.filter((s) => s?.enabled !== false).map((s) => s.id);
  }, [sectionsEditing, sectionsDraft, sectionsOrdered]);

  // Sections that are currently disabled / removed from the draft and
  // can be added back via the "Add section" dropdown.
  const addableSectionIds = useMemo(() => {
    if (!sectionsEditing) return [];
    const enabled = new Set(sectionsDraft.filter((s) => s?.enabled !== false).map((s) => s.id));
    return ALL_SECTION_IDS.filter((id) => !enabled.has(id));
  }, [sectionsEditing, sectionsDraft]);

  // The draft is "dirty" when its ordered enabled-id list differs from
  // the persisted sectionsOrdered - this gates the Save bar.
  const sectionsDirty = useMemo(() => {
    if (!sectionsEditing) return false;
    const draft = sectionsDraft.filter((s) => s?.enabled !== false).map((s) => s.id);
    if (draft.length !== sectionsOrdered.length) return true;
    return draft.some((id, i) => id !== sectionsOrdered[i]);
  }, [sectionsEditing, sectionsDraft, sectionsOrdered]);

  const enterSectionsEdit = () => {
    // Seed the draft with the persisted config; if the report has no
    // saved config, fall back to the canonical order.
    const cfg = report?.sectionsConfig?.sections;
    const seed = Array.isArray(cfg) && cfg.length
      ? cfg.map((s) => ({ id: s.id, enabled: s.enabled !== false }))
      : ALL_SECTION_IDS.map((id) => ({ id, enabled: true }));
    setSectionsDraft(seed);
    setSectionsEditing(true);
  };

  const cancelSectionsEdit = () => {
    setSectionsEditing(false);
    setSectionsDraft([]);
  };

  const moveDraftSection = (id, delta) => {
    setSectionsDraft((prev) => {
      const next = [...prev];
      const idx = next.findIndex((s) => s.id === id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeDraftSection = (id) => {
    // Soft-disable rather than splice - preserves position so re-adding
    // doesn't reorder unrelated sections.
    setSectionsDraft((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: false } : s)));
  };

  const addDraftSection = (id) => {
    setSectionsDraft((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (existing) {
        // Re-enable in place.
        return prev.map((s) => (s.id === id ? { ...s, enabled: true } : s));
      }
      // Brand new id (e.g. user hadn't saved this section before) →
      // append to the end.
      return [...prev, { id, enabled: true }];
    });
  };

  const handleSaveSections = async () => {
    if (!reportId) return;
    setIsSaving(true);
    setError('');
    try {
      const orderedSections = sectionsDraft.map((s) => ({ id: s.id, enabled: s.enabled !== false }));
      // Persist the new config first…
      const patchRes = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionsConfig: { sections: orderedSections } }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save sections');
      }
      // …then kick off a regenerate so the PDF matches the new layout.
      const regenRes = await fetch(`/api/reports/${reportId}/regenerate`, { method: 'POST' });
      if (!regenRes.ok) {
        const err = await regenRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to regenerate');
      }
      // Optimistically reflect both the new config and the PENDING
      // regenerate state in the local data; the polling effect below
      // will overwrite once the pipeline finishes.
      setData((prev) => prev
        ? { ...prev, report: { ...prev.report, sectionsConfig: { sections: orderedSections }, status: 'PENDING' } }
        : prev);
      setSectionsEditing(false);
      setSectionsDraft([]);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const sectionData = report?.sectionData?.sectionData || report?.sectionData || {};
  const currentAudit = report?.sectionData?.currentAudit || null;
  const previousAudit = report?.sectionData?.previousAudit || null;
  const executedActions = report?.sectionData?.executedActions || [];

  const sectionLabel = (id) => {
    const k = SECTION_LABEL_KEYS[id] || id;
    return t(`settings.clientReportingSection.options.${k}`) || k;
  };

  const handleSaveSummary = async () => {
    if (!reportId) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiSummary: draftSummary }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save summary');
      }
      const { report: updated } = await res.json();
      setData((prev) => (prev ? { ...prev, report: updated } : prev));
      setEditing(false);
      onUpdated?.(updated);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // Full PDF regeneration - used by the snapshot-missing fallback
  // (no preview data available, only path forward is to re-render
  // the whole report). The section-editor save bar uses its own
  // handler since it also persists section changes first.
  const handleRegenerate = async () => {
    if (!reportId) return;
    setIsRegenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/${reportId}/regenerate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to regenerate');
      }
      // Optimistic flip - the polling effect above will overwrite
      // once the pipeline finishes.
      setData((prev) => prev ? { ...prev, report: { ...prev.report, status: 'PENDING' } } : prev);
    } catch (e) {
      setError(e.message || String(e));
      setIsRegenerating(false);
    }
  };

  // Regenerate just the AI summary (not the whole PDF). Sends the
  // user's current draft as a `hint` so the model refines it rather
  // than overwriting their edits cold. This is the lighter path the
  // user reaches for "give me a different phrasing"; full PDF regen
  // happens separately via the section-editor save flow.
  const handleRegenerateSummary = async () => {
    if (!reportId) return;
    setIsRegenerating(true);
    setError('');
    try {
      // The "hint" is whatever lives in the editor right now if the
      // user is mid-edit, otherwise the saved summary.
      const hint = editing
        ? draftSummary
        : (data?.report?.aiSummary || '');
      const res = await fetch(`/api/reports/${reportId}/regenerate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to regenerate summary');
      }
      const json = await res.json();
      const newSummary = json?.aiSummary || '';
      setData((prev) => prev
        ? { ...prev, report: { ...prev.report, aiSummary: newSummary } }
        : prev);
      setDraftSummary(newSummary);
      // Stay in view-mode after regeneration - the user can flip back
      // to edit if they want to keep tweaking the new draft.
      setEditing(false);
      onUpdated?.({ ...data?.report, aiSummary: newSummary });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // The report's own locale (en/he) - falls back to the UI locale.
  // Drives the modal's `dir` so an EN report previewed inside a HE
  // dashboard reads LTR (and vice-versa), matching the PDF.
  const reportDir = (data?.report?.locale || locale) === 'he' ? 'rtl' : 'ltr';

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        dir={reportDir}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>
              {t('settings.clientReportingSection.preview.title') || 'Report Preview'}
            </h2>
            {site && <p className={styles.subtitle}>{site.name} · {report?.month}</p>}
          </div>
          <div className={styles.headerActions}>
            {/* Sections-edit toggle. Hidden while a regenerate/PDF is
                in flight so the user can't queue conflicting writes. */}
            {report && report.status !== 'PENDING' && (
              sectionsEditing ? (
                <button
                  className={styles.iconBtn}
                  onClick={cancelSectionsEdit}
                  title={t('common.cancel') || 'Cancel'}
                  disabled={isSaving}
                >
                  <X size={16} />
                </button>
              ) : (
                <button
                  className={styles.iconBtn}
                  onClick={enterSectionsEdit}
                  title={t('settings.clientReportingSection.preview.editSections') || 'Edit sections'}
                >
                  <ArrowUpDown size={16} />
                </button>
              )
            )}
            {report?.pdfUrl && (
              <a
                href={`/api/reports/${reportId}/download`}
                download
                className={styles.iconBtn}
                title={t('common.download') || 'Download'}
              >
                <Download size={16} />
              </a>
            )}
            <button className={styles.iconBtn} onClick={onClose} aria-label={t('common.close') || 'Close'}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinningIcon} size={24} />
              <span>{t('common.loading') || 'Loading...'}</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          ) : !report ? null : (
            <>
              {report.status === 'PENDING' && (
                <div className={styles.pendingBanner}>
                  <Loader2 className={styles.spinningIcon} size={16} />
                  <span>{t('settings.clientReportingSection.preview.regenerating') || 'Regenerating PDF - preview will refresh when ready.'}</span>
                </div>
              )}
              {report.status === 'ERROR' && report.error && (
                <div className={styles.errorState}>
                  <AlertTriangle size={18} />
                  <span>{report.error}</span>
                </div>
              )}

              {/* Brand header preview */}
              <div
                className={styles.brandHeader}
                style={{ borderBottomColor: branding?.primaryColor || '#7b2cbf' }}
              >
                <div>
                  {branding?.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.logoUrl} alt={branding.agencyName || ''} className={styles.brandLogo} />
                  )}
                  <div className={styles.brandName} style={{ color: branding?.primaryColor }}>
                    {branding?.agencyName}
                  </div>
                  {/* Contact lines - only render when present so we
                      don't leave empty rows for agencies that haven't
                      filled in every field. */}
                  {(branding?.contactEmail || branding?.contactWebsite || branding?.contactPhone) && (
                    <div className={styles.brandContact}>
                      {branding?.contactEmail && <span>{branding.contactEmail}</span>}
                      {branding?.contactWebsite && <span>{branding.contactWebsite}</span>}
                      {branding?.contactPhone && <span>{branding.contactPhone}</span>}
                    </div>
                  )}
                </div>
                <div className={styles.brandRight}>
                  <div className={styles.reportTitle} style={{ color: branding?.primaryColor }}>
                    {t('settings.clientReportingSection.preview.reportHeaderTitle') || 'SEO Performance Report'}
                  </div>
                  <div className={styles.reportDate}>{report.month}</div>
                  {report?.metadata?.previousPeriodLabel && report?.metadata?.currentPeriodLabel && (
                    <div className={styles.comparisonPill} style={{ background: `${branding?.primaryColor}22`, color: branding?.primaryColor }}>
                      <span>{report.metadata.previousPeriodLabel}</span>
                      <GitCompareArrows size={11} aria-hidden="true" />
                      <span>{report.metadata.currentPeriodLabel}</span>
                    </div>
                  )}
                </div>
              </div>

              {site && (
                <div className={styles.siteBlock}>
                  {(site.logo || site.favicon) && (
                    // Prefer the full logo when present; fall back to
                    // the favicon so older sites without a logo still
                    // get a visual marker.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={site.logo || site.favicon}
                      alt={site.name || ''}
                      className={styles.siteLogo}
                    />
                  )}
                  <div>
                    <div className={styles.siteName}>{site.name}</div>
                    <div className={styles.siteUrl}>{site.url}</div>
                  </div>
                </div>
              )}

              {/* Sections-edit toolbar: lists all currently-removed
                  sections so the user can re-add any of them. The list
                  is empty by default (everything in), and only renders
                  when the user is in edit mode. */}
              {sectionsEditing && addableSectionIds.length > 0 && (
                <div className={styles.addSectionRow}>
                  <span className={styles.addSectionLabel}>
                    <Plus size={12} />
                    {t('settings.clientReportingSection.preview.addSection') || 'Add section'}
                  </span>
                  {addableSectionIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={styles.addSectionChip}
                      onClick={() => addDraftSection(id)}
                    >
                      <Plus size={12} />
                      {sectionLabel(id)}
                    </button>
                  ))}
                </div>
              )}

              {/* AI Summary - rendered up front when the report either has
                  an actual summary or has aiSummary in its section list.
                  This guarantees the summary stays editable on older
                  reports that pre-date the snapshot-persistence work.
                  When the user is in sections-edit mode we hide it here
                  and let the regular loop render it (so move/remove
                  controls work uniformly). */}
              {!sectionsEditing
                && ((typeof report.aiSummary === 'string' && report.aiSummary)
                  || sectionsOrdered.includes('aiSummary')) && (
                <Section
                  id="aiSummary"
                  label={sectionLabel('aiSummary')}
                  primaryColor={branding?.primaryColor}
                  data={null}
                  aiSummary={report.aiSummary}
                  editing={editing}
                  draftSummary={draftSummary}
                  setDraftSummary={setDraftSummary}
                  setEditing={setEditing}
                  isSaving={isSaving}
                  onSaveSummary={handleSaveSummary}
                  isRegenerating={isRegenerating || report.status === 'PENDING'}
                  onRegenerate={handleRegenerateSummary}
                  locale={locale}
                  t={t}
                />
              )}

              {/*
               * No sections snapshot at all → either an older report
               * generated before the snapshot fields existed, or a
               * report whose generator skipped persisting them. Show a
               * friendly empty state with a Regenerate button so the
               * user can opt-in to a full preview. We hide aiSummary
               * here from the duplicate render above by checking that
               * sectionsOrdered already includes it.
               */}
              {!sectionsEditing && sectionsOrdered.length === 0 ? (
                <div className={styles.snapshotMissingState}>
                  <AlertTriangle size={16} />
                  <div>
                    <div className={styles.snapshotMissingTitle}>
                      {t('settings.clientReportingSection.preview.noSnapshotTitle') || 'Limited preview available'}
                    </div>
                    <div className={styles.snapshotMissingBody}>
                      {t('settings.clientReportingSection.preview.noSnapshotBody') || 'This report was generated before in-platform previews were supported, or its data snapshot is missing. Regenerate it to see the full preview here.'}
                    </div>
                  </div>
                  {report.status !== 'PENDING' && (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? <Loader2 size={14} className={styles.spinningIcon} /> : <RefreshCw size={14} />}
                      {t('settings.clientReportingSection.preview.regeneratePdf') || 'Regenerate'}
                    </button>
                  )}
                </div>
              ) : (
                /* Sections - render in either the saved order (normal
                   mode) or the user's draft (edit mode). When editing
                   we DO render aiSummary inside the loop so move/remove
                   controls work for it too; the standalone render
                   above is suppressed in that case. */
                displayedSections
                  .filter((id) => sectionsEditing || id !== 'aiSummary')
                  .map((id, idx, arr) => (
                    <Section
                      key={id}
                      id={id}
                      label={sectionLabel(id)}
                      primaryColor={branding?.primaryColor}
                      data={sectionData?.[id]}
                      currentAudit={currentAudit}
                      previousAudit={previousAudit}
                      executedActions={executedActions}
                      aiSummary={report.aiSummary}
                      editing={editing}
                      draftSummary={draftSummary}
                      setDraftSummary={setDraftSummary}
                      setEditing={setEditing}
                      isSaving={isSaving}
                      onSaveSummary={handleSaveSummary}
                      isRegenerating={isRegenerating || report.status === 'PENDING'}
                      onRegenerate={handleRegenerate}
                      locale={locale}
                      t={t}
                      sectionsEditing={sectionsEditing}
                      isFirst={idx === 0}
                      isLast={idx === arr.length - 1}
                      onMoveUp={() => moveDraftSection(id, -1)}
                      onMoveDown={() => moveDraftSection(id, 1)}
                      onRemove={() => removeDraftSection(id)}
                    />
                  ))
              )}
            </>
          )}
        </div>
        {/* Save bar - visible only while the user has unsaved
            section-edit changes. Triggers PATCH + regenerate. */}
        {sectionsEditing && (
          <div className={styles.saveBar}>
            <span className={styles.saveBarHint}>
              {sectionsDirty
                ? (t('settings.clientReportingSection.preview.unsavedChanges') || 'You have unsaved changes')
                : (t('settings.clientReportingSection.preview.noChanges') || 'No changes yet')}
            </span>
            <div className={styles.saveBarActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={cancelSectionsEdit}
                disabled={isSaving}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleSaveSections}
                disabled={isSaving || !sectionsDirty}
              >
                {isSaving ? (
                  <Loader2 size={14} className={styles.spinningIcon} />
                ) : (
                  <RefreshCw size={14} />
                )}
                {t('settings.clientReportingSection.preview.saveAndRegenerate') || 'Save & regenerate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Per-section renderer. Mirrors the PDF structure in HTML so the preview
// looks similar (not pixel-identical) to the downloaded PDF.
// ───────────────────────────────────────────────────────────────────────────
function Section({
  id, label, primaryColor, data, currentAudit, previousAudit, executedActions,
  aiSummary, editing, draftSummary, setDraftSummary, setEditing, isSaving,
  onSaveSummary, isRegenerating, onRegenerate, locale, t,
  sectionsEditing, isFirst, isLast, onMoveUp, onMoveDown, onRemove,
}) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle} style={{ color: primaryColor }}>
        <span>{label}</span>
        {sectionsEditing && (
          <span className={styles.sectionEditControls}>
            <button
              type="button"
              className={styles.sectionEditBtn}
              onClick={onMoveUp}
              disabled={isFirst}
              title={t('common.moveUp') || 'Move up'}
              aria-label={t('common.moveUp') || 'Move up'}
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              className={styles.sectionEditBtn}
              onClick={onMoveDown}
              disabled={isLast}
              title={t('common.moveDown') || 'Move down'}
              aria-label={t('common.moveDown') || 'Move down'}
            >
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              className={`${styles.sectionEditBtn} ${styles.sectionEditBtnDanger}`}
              onClick={onRemove}
              title={t('common.delete') || 'Remove'}
              aria-label={t('common.delete') || 'Remove'}
            >
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </h3>
      <div className={styles.sectionBody}>
        {id === 'aiSummary' ? (
          <AiSummaryBlock
            aiSummary={aiSummary}
            editing={editing}
            draft={draftSummary}
            setDraft={setDraftSummary}
            setEditing={setEditing}
            isSaving={isSaving}
            onSaveSummary={onSaveSummary}
            isRegenerating={isRegenerating}
            onRegenerate={onRegenerate}
            primaryColor={primaryColor}
            t={t}
          />
        ) : id === 'overview' ? (
          <OverviewBlock data={data} t={t} primaryColor={primaryColor} />
        ) : id === 'healthScore' ? (
          <HealthScoreBlock
            currentAudit={currentAudit}
            previousAudit={previousAudit}
            primaryColor={primaryColor}
            t={t}
          />
        ) : id === 'aiActions' ? (
          <ActionsBlock executedActions={executedActions} locale={locale} t={t} />
        ) : id === 'keywords' ? (
          <KeywordsBlock data={data} locale={locale} t={t} />
        ) : id === 'competitors' ? (
          <CompetitorsBlock data={data} t={t} />
        ) : id === 'seo' ? (
          <SeoBlock data={data} t={t} primaryColor={primaryColor} />
        ) : id === 'geo' ? (
          <GeoBlock data={data} locale={locale} t={t} />
        ) : id === 'siteAudits' ? (
          <SiteAuditsBlock data={data} locale={locale} t={t} />
        ) : null}
      </div>
    </div>
  );
}

function AiSummaryBlock({ aiSummary, editing, draft, setDraft, setEditing, isSaving, onSaveSummary, isRegenerating, onRegenerate, primaryColor, t }) {
  if (editing) {
    return (
      <div className={styles.summaryEdit}>
        <textarea
          className={styles.summaryTextarea}
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className={styles.summaryEditActions}>
          <button
            className={styles.secondaryBtn}
            onClick={() => setEditing(false)}
            disabled={isSaving}
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            className={styles.primaryBtn}
            onClick={onSaveSummary}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 size={14} className={styles.spinningIcon} /> : <Save size={14} />}
            {t('common.save') || 'Save'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.summaryView}>
      <div className={styles.summaryBox} style={{ borderInlineStartColor: primaryColor, background: `${primaryColor}11` }}>
        {aiSummary || <em>{t('settings.clientReportingSection.preview.noAiSummary') || 'No AI summary yet.'}</em>}
      </div>
      <div className={styles.summaryActions}>
        <button className={styles.secondaryBtn} onClick={() => setEditing(true)}>
          <Edit3 size={14} />
          {t('settings.clientReportingSection.preview.editSummary') || 'Edit summary'}
        </button>
        <button className={styles.secondaryBtn} onClick={onRegenerate} disabled={isRegenerating}>
          {isRegenerating ? <Loader2 size={14} className={styles.spinningIcon} /> : <RefreshCw size={14} />}
          {t('settings.clientReportingSection.preview.regenerateSummary') || 'Regenerate summary'}
        </button>
      </div>
    </div>
  );
}

function OverviewBlock({ data, t, primaryColor }) {
  if (!data) return null;
  const tiles = [
    { label: t('settings.clientReportingSection.preview.overviewKeywords') || 'Tracked Keywords', value: data.keywordsCount ?? 0 },
    { label: t('settings.clientReportingSection.preview.overviewCompetitors') || 'Tracked Competitors', value: data.competitorsCount ?? 0 },
    { label: t('settings.clientReportingSection.preview.overviewContent') || 'Content Pieces', value: data.contentCount ?? 0 },
    { label: t('settings.clientReportingSection.preview.overviewActions') || 'AI Actions in Period', value: data.executedActionsCount ?? 0 },
  ];
  return (
    <div className={styles.overviewGrid}>
      {tiles.map((tile, i) => (
        <div key={i} className={styles.overviewTile} style={{ borderInlineStartColor: primaryColor, background: `${primaryColor}11` }}>
          <div className={styles.overviewLabel}>{tile.label}</div>
          <div className={styles.overviewValue} style={{ color: primaryColor }}>{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

function HealthScoreBlock({ currentAudit, previousAudit, primaryColor, t }) {
  const curr = currentAudit?.score;
  const prev = previousAudit?.score;
  const delta = curr != null && prev != null ? curr - prev : null;
  const sign = delta > 0 ? '+' : '';
  const deltaColor = delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#6b7280';
  const cats = ['technical', 'performance', 'visual', 'accessibility'];
  return (
    <div className={styles.scoreBlock}>
      <div className={styles.scoreCircle} style={{ background: primaryColor }}>
        <div className={styles.scoreValue}>{curr ?? '-'}</div>
        <div className={styles.scoreLabel}>{t('settings.clientReportingSection.preview.healthScore') || 'Health Score'}</div>
      </div>
      <div className={styles.scoreDetails}>
        {delta != null && (
          <div className={styles.deltaPill} style={{ color: deltaColor }}>
            {sign}{delta} {t('settings.clientReportingSection.preview.pointsVs') || 'points vs previous'}
          </div>
        )}
        <div className={styles.previousScore}>
          {prev != null
            ? `${t('settings.clientReportingSection.preview.previousScore') || 'Previous score:'} ${prev}`
            : t('settings.clientReportingSection.preview.firstAudit') || 'First audit for this period'}
        </div>
        <div className={styles.categoryGrid}>
          {cats.map((c) => {
            const score = currentAudit?.categoryScores?.[c];
            const prevScore = previousAudit?.categoryScores?.[c];
            const dlt = score != null && prevScore != null ? score - prevScore : null;
            const dltColor = dlt > 0 ? '#16a34a' : dlt < 0 ? '#dc2626' : '#6b7280';
            return (
              <div key={c} className={styles.categoryCard}>
                <div className={styles.categoryName}>{t(`settings.clientReportingSection.preview.categories.${c}`) || c}</div>
                <div className={styles.categoryScoreRow}>
                  <span className={styles.categoryScore}>{score ?? '-'}</span>
                  {dlt != null && (
                    <span style={{ color: dltColor, fontSize: '0.8125rem', fontWeight: 600 }}>
                      {dlt > 0 ? '+' : ''}{dlt}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Translate the raw action enum into a human-readable label, with the
// same fallback chain as the PDF generator. Keeps the preview in sync
// with the shipped report.
function localizeActionType(actionType, t) {
  if (!actionType) return '-';
  const translated = t(`settings.clientReportingSection.actionTypes.${actionType}`);
  if (translated) return translated;
  // Last resort: humanize the snake_case enum so the user never sees
  // "fix_heading_structure" raw.
  return actionType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Description mirrors the PDF's `humanizeActionDescription` - when
// the description is a translation key (a.b.c) we surface the last
// segment as title-cased text so the preview never shows raw keys.
function localizeActionDescription(action, t) {
  const candidate = action?.data?.description || action?.descriptionKey || '';
  if (!candidate) return t('settings.clientReportingSection.actionTypes.default') || '-';
  if (/^[a-z][a-zA-Z]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(candidate)) {
    // It's a translation key - try to resolve it directly first;
    // otherwise humanize the tail segment.
    const direct = t(candidate);
    if (direct && direct !== candidate) return direct;
    const parts = candidate.split('.');
    const tail = parts[parts.length - 1] === 'description' ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!tail) return t('settings.clientReportingSection.actionTypes.default') || '-';
    return tail
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
  return candidate;
}

function ActionsBlock({ executedActions, locale, t }) {
  if (!executedActions || executedActions.length === 0) {
    return <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.noActions') || 'No automated actions in this period.'}</p>;
  }
  return (
    <div className={styles.dataTable} style={{ '--cols': 3 }}>
      <div className={styles.dataTableHead}>
        <div>{t('common.date') || 'Date'}</div>
        <div>{t('common.type') || 'Type'}</div>
        <div>{t('settings.clientReportingSection.preview.actionDescription') || 'Description'}</div>
      </div>
      {executedActions.slice(0, 15).map((a, idx) => (
        <div key={a.id || idx} className={styles.dataTableRow}>
          <div>{formatDate(a.executedAt, locale)}</div>
          <div>{localizeActionType(a.actionType, t)}</div>
          <div>{localizeActionDescription(a, t)}</div>
        </div>
      ))}
    </div>
  );
}

// Format a YYYY-MM month key into a short header label like "Apr 2026"
// for the keyword rank column header.
function shortMonthLabel(key, locale) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function KeywordsBlock({ data, locale, t }) {
  const items = data?.items || [];
  if (items.length === 0) return <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.noKeywords') || 'No keywords tracked.'}</p>;
  // Build the rank columns. When the report is comparing two months
  // we show both side-by-side; single-month reports get one rank
  // column. Falls back to the keyword's `position` when no
  // ranksByMonth map is present (live reports without rank history).
  const currentKey = data?.currentMonthKey || null;
  const previousKey = data?.previousMonthKey || null;
  const rankCols = [];
  if (previousKey) rankCols.push({ key: previousKey, label: shortMonthLabel(previousKey, locale) });
  if (currentKey) rankCols.push({ key: currentKey, label: shortMonthLabel(currentKey, locale) });
  // Fallback header when the report has no period data at all.
  const useFallback = rankCols.length === 0;
  if (useFallback) {
    rankCols.push({ key: '__current', label: t('settings.clientReportingSection.preview.position') || 'Position' });
  }
  // Total cols = keyword + N rank columns + volume.
  const totalCols = 1 + rankCols.length + 1;
  return (
    <div className={styles.dataTable} style={{ '--cols': totalCols }}>
      <div className={styles.dataTableHead}>
        <div>{t('settings.clientReportingSection.preview.keyword') || 'Keyword'}</div>
        {rankCols.map((col) => (
          <div key={col.key}>{col.label}</div>
        ))}
        <div>{t('settings.clientReportingSection.preview.volume') || 'Volume'}</div>
      </div>
      {items.slice(0, 20).map((k, i) => (
        <div key={k.id || i} className={styles.dataTableRow}>
          <div>{k.keyword}</div>
          {rankCols.map((col) => {
            const r = useFallback
              ? k.position
              : (k.ranksByMonth?.[col.key] ?? null);
            return <div key={col.key}>{r != null ? `#${r}` : '-'}</div>;
          })}
          <div>{k.searchVolume != null ? k.searchVolume.toLocaleString() : '-'}</div>
        </div>
      ))}
    </div>
  );
}

function CompetitorsBlock({ data, t }) {
  const items = data?.items || [];
  if (items.length === 0) return <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.noCompetitors') || 'No competitors tracked.'}</p>;
  return (
    <div className={styles.dataTable} style={{ '--cols': 1 }}>
      <div className={styles.dataTableHead}>
        <div>{t('settings.clientReportingSection.preview.competitor') || 'Competitor'}</div>
      </div>
      {items.slice(0, 15).map((c, i) => (
        <div key={c.id || i} className={styles.dataTableRow}>
          <div>{c.domain || c.name || '-'}</div>
        </div>
      ))}
    </div>
  );
}

function SeoBlock({ data, t, primaryColor }) {
  // Strategy + writing style + business positioning. Score and
  // category breakdown live in the Site Health section.
  if (!data) return null;
  const strategyPreview = (() => {
    const s = data.seoStrategy;
    if (!s || typeof s !== 'object') return null;
    const keys = ['summary', 'overview', 'focus', 'positioning', 'tone', 'niche'];
    for (const k of keys) if (typeof s[k] === 'string' && s[k].trim()) return s[k].trim();
    return Object.keys(s).slice(0, 5).join(', ');
  })();
  const hasAny = !!(data.writingStyle || strategyPreview || data.businessCategory || data.businessAbout);
  if (!hasAny) {
    return <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.seoEmpty') || 'No SEO insights recorded yet.'}</p>;
  }
  return (
    <div className={styles.kvList}>
      {data.businessCategory && (
        <div className={styles.kvRow}>
          <span>{t('settings.clientReportingSection.preview.businessCategory') || 'Category'}</span>
          <strong>{String(data.businessCategory).slice(0, 80)}</strong>
        </div>
      )}
      {data.writingStyle && (
        <div className={styles.kvRow}>
          <span>{t('settings.clientReportingSection.preview.writingStyle') || 'Writing style'}</span>
          <strong>{String(data.writingStyle).slice(0, 80)}</strong>
        </div>
      )}
      {strategyPreview && (
        <div className={styles.kvRow}>
          <span>{t('settings.clientReportingSection.preview.seoStrategy') || 'Strategy'}</span>
          <strong>{String(strategyPreview).slice(0, 120)}</strong>
        </div>
      )}
      {data.businessAbout && (
        <div className={styles.kvRow}>
          <span>{t('settings.clientReportingSection.preview.businessAbout') || 'About'}</span>
          <strong>{String(data.businessAbout).slice(0, 200)}</strong>
        </div>
      )}
    </div>
  );
}

function GeoBlock({ data, locale, t }) {
  if (!data) return null;
  // Accept either a single code (legacy) or an array of codes for
  // multi-language sites. Render names in the report's display
  // locale so HE reports show "אנגלית, עברית" and EN ones show
  // "English, Hebrew".
  const rawCodes = data.contentLanguages
    || (data.contentLanguage ? [data.contentLanguage] : null)
    || (data.wpLocale ? [data.wpLocale] : null);
  const langLabel = rawCodes ? languageNamesFromCodes(rawCodes, locale) : null;
  const locations = Array.isArray(data.targetLocations) ? data.targetLocations : [];
  return (
    <div className={styles.kvList}>
      {langLabel && (
        <div className={styles.kvRow}>
          <span>{t('settings.clientReportingSection.preview.contentLanguage') || 'Content language'}</span>
          <strong>{langLabel}</strong>
        </div>
      )}
      <div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginBottom: '0.375rem' }}>
          {t('settings.clientReportingSection.preview.targetLocations') || 'Target locations'}
        </div>
        {locations.length > 0 ? (
          <div className={styles.chipsRow}>
            {locations.slice(0, 20).map((loc, i) => (
              <span key={i} className={styles.chip}>{String(loc)}</span>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.noTargetLocations') || 'No target locations configured.'}</p>
        )}
      </div>
    </div>
  );
}

function SiteAuditsBlock({ data, locale, t }) {
  const items = data?.items || [];
  if (items.length === 0) return <p className={styles.emptyText}>{t('settings.clientReportingSection.preview.noAudits') || 'No audits in this period.'}</p>;
  return (
    <div className={styles.dataTable} style={{ '--cols': 3 }}>
      <div className={styles.dataTableHead}>
        <div>{t('common.date') || 'Date'}</div>
        <div>{t('settings.clientReportingSection.preview.score') || 'Score'}</div>
        <div>{t('common.status') || 'Status'}</div>
      </div>
      {items.slice(0, 12).map((a, i) => {
        // Translate the audit status (COMPLETED/IN_PROGRESS/etc) so the
        // preview reads naturally in Hebrew alongside English. Falls
        // back to the raw enum if the locale doesn't have it.
        const statusKey = (a.status || '').toLowerCase();
        const statusLabel = statusKey
          ? t(`settings.clientReportingSection.preview.auditStatuses.${statusKey}`) || a.status
          : '-';
        return (
          <div key={a.id || i} className={styles.dataTableRow}>
            <div>{formatDate(a.completedAt || a.createdAt, locale)}</div>
            <div>{a.score ?? '-'}</div>
            <div>{statusLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
