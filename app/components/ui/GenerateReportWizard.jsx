'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  Mail,
  Languages,
  Check,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import styles from './GenerateReportWizard.module.css';

/*
 * Section list available in reports. Mirror what the server's /api/reports/generate
 * understands; ordering here is the default render order in the PDF and the
 * user can rearrange via the up/down buttons in step 1.
 */
const DEFAULT_SECTIONS = [
  { id: 'overview', defaultEnabled: true },
  { id: 'aiSummary', defaultEnabled: true },
  { id: 'healthScore', defaultEnabled: true },
  { id: 'aiActions', defaultEnabled: true },
  { id: 'keywords', defaultEnabled: false },
  { id: 'competitors', defaultEnabled: false },
  { id: 'seo', defaultEnabled: false },
  { id: 'geo', defaultEnabled: false },
  { id: 'siteAudits', defaultEnabled: true },
];

const SECTION_LABELS_FALLBACK = {
  overview: 'Overview',
  aiSummary: 'AI Executive Summary',
  healthScore: 'Site Health Score & Progress',
  aiActions: 'AI Actions Performed',
  keywords: 'Keywords',
  competitors: 'Competitors',
  seo: 'SEO Insights',
  geo: 'Geographic Performance',
  siteAudits: 'Site Audits',
};

function formatMonthKey(key, locale) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Three-step wizard for generating a client report.
 *
 * Step 1: Language + sections (toggle + reorder)
 * Step 2: Comparison months (current vs previous)
 * Step 3: Recipients (optional, only used by the post-generation send action)
 *
 * Submitting calls /api/reports/generate and invokes onGenerated(report).
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {{ id: string }} props.site - The selected site to generate for.
 * @param {(report: object) => void} [props.onGenerated]
 */
export function GenerateReportWizard({ isOpen, onClose, site, onGenerated }) {
  const { t, locale } = useLocale();
  const { addTask, updateTask } = useBackgroundTasks();

  const [step, setStep] = useState(1);
  const [reportLanguage, setReportLanguage] = useState(locale || 'en');
  const [sections, setSections] = useState(() =>
    DEFAULT_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled }))
  );
  const [availablePeriods, setAvailablePeriods] = useState({ availableMonths: [], hasComparison: false });
  const [currentMonthKey, setCurrentMonthKey] = useState('');
  const [previousMonthKey, setPreviousMonthKey] = useState('');
  const [recipients, setRecipients] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Reset state on every fresh open. Avoids stale wizard state between
  // generations and stops us from showing yesterday's draft if the modal
  // reopens for a different site.
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setReportLanguage(locale || 'en');
    setSections(DEFAULT_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled })));
    setRecipients('');
    setError('');
    setIsGenerating(false);
  }, [isOpen, locale]);

  // Prefill the wizard from the site's saved report-config when one exists,
  // so power users don't have to re-pick their preferred sections every time.
  useEffect(() => {
    if (!isOpen || !site?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${site.id}/report-config`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.config) return;
        if (data.config.reportLanguage) setReportLanguage(data.config.reportLanguage);
        if (Array.isArray(data.config.sections) && data.config.sections.length) {
          const known = new Map(DEFAULT_SECTIONS.map((s) => [s.id, s]));
          const seen = new Set();
          const merged = [];
          for (const s of data.config.sections) {
            if (s?.id && known.has(s.id) && !seen.has(s.id)) {
              seen.add(s.id);
              merged.push({ id: s.id, enabled: s.enabled !== false });
            }
          }
          for (const def of DEFAULT_SECTIONS) {
            if (!seen.has(def.id)) merged.push({ id: def.id, enabled: def.defaultEnabled });
          }
          setSections(merged);
        }
        if (Array.isArray(data.config.recipients)) {
          setRecipients(data.config.recipients.join(', '));
        } else if (typeof data.config.recipients === 'string') {
          setRecipients(data.config.recipients);
        }
      } catch (e) {
        // Non-fatal: the wizard still works with defaults.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, site?.id]);

  // Pull the months that have data for this site so the period dropdowns
  // can't offer empty months. Default to the two newest available.
  useEffect(() => {
    if (!isOpen || !site?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reports/available-periods?siteId=${site.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAvailablePeriods(data || { availableMonths: [], hasComparison: false });
        const months = Array.isArray(data?.availableMonths) ? data.availableMonths : [];
        setCurrentMonthKey(months[0] || '');
        setPreviousMonthKey(months[1] || '');
      } catch (e) {
        // Non-fatal: empty period list just means the legacy fallback runs.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, site?.id]);

  const toggleSection = (id) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const moveSection = (id, delta) => {
    setSections((prev) => {
      const next = [...prev];
      const idx = next.findIndex((s) => s.id === id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Dictionary stores section labels under `clientReportingSection.options.<id>`,
  // so the wizard reads from the same place the legacy settings page used —
  // otherwise the Hebrew labels never show up despite being in the dictionary.
  const sectionLabel = (id) =>
    t(`settings.clientReportingSection.options.${id}`) || SECTION_LABELS_FALLBACK[id] || id;

  const enabledSectionCount = useMemo(() => sections.filter((s) => s.enabled).length, [sections]);

  const stepTitles = [
    t('settings.clientReportingSection.wizard.step1Title') || 'Sections & language',
    t('settings.clientReportingSection.wizard.step2Title') || 'Comparison period',
    t('settings.clientReportingSection.wizard.step3Title') || 'Recipients',
  ];

  const canAdvance =
    (step === 1 && enabledSectionCount > 0) ||
    (step === 2) ||
    step === 3;

  const handleClose = () => {
    if (!isGenerating) onClose();
  };

  // Polls the report's status every 3s until it leaves PENDING. Uses the
  // platform's BackgroundTasks system so the user sees a non-blocking
  // notification while continuing to work elsewhere in the dashboard.
  // Stops the interval the moment status flips off PENDING — leaving it
  // running would leak a closure once the wizard unmounts.
  const startReportPolling = (reportId, taskId) => {
    let interval = null;
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const tick = async () => {
      try {
        const res = await fetch(`/api/reports/${reportId}`);
        if (!res.ok) return; // transient — try next tick
        const { report } = await res.json();
        if (!report) return;

        if (report.status === 'PENDING') {
          updateTask(taskId, {
            status: 'running',
            message: t('settings.clientReportingSection.wizard.taskRunning') || 'Generating report PDF...',
          });
          return;
        }

        // Terminal status reached — clear the interval first so a slow
        // request can't trigger another tick after we've finalized.
        stop();

        if (report.status === 'ERROR') {
          updateTask(taskId, {
            status: 'error',
            message: report.error
              || t('settings.clientReportingSection.wizard.taskError')
              || 'Report generation failed.',
            progress: 100,
          });
        } else {
          updateTask(taskId, {
            status: 'completed',
            progress: 100,
            message: t('settings.clientReportingSection.wizard.taskComplete') || 'Report is ready.',
          });
        }
        onGenerated?.({ reportId, report });
      } catch {
        // ignore — next tick retries
      }
    };
    tick();
    interval = setInterval(tick, 3000);
    return stop;
  };

  const handleGenerate = async () => {
    if (!site?.id) return;
    setIsGenerating(true);
    setError('');
    try {
      const recipientsList = recipients
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const enabledSections = sections.filter((s) => s.enabled).map((s) => s.id);

      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          locale: reportLanguage,
          sections: enabledSections,
          currentMonth: currentMonthKey || undefined,
          previousMonth: previousMonthKey || undefined,
          recipients: recipientsList,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('settings.clientReportingSection.wizard.generateError') || 'Failed to generate report');
        setIsGenerating(false);
        return;
      }

      const data = await res.json();

      // Best-effort persistence of wizard preferences. Doesn't block close.
      fetch(`/api/sites/${site.id}/report-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportLanguage,
          sections,
          recipients: recipientsList,
        }),
      }).catch(() => {});

      // Register a background task so the user gets a non-blocking
      // notification when the PDF finishes rendering. The wizard then
      // closes immediately — generation no longer blocks the modal.
      const taskId = `report-generate-${data.reportId}`;
      addTask({
        id: taskId,
        type: 'report-generate',
        title: t('settings.clientReportingSection.wizard.taskTitle') || 'Generating report',
        message: t('settings.clientReportingSection.wizard.taskRunning') || 'Generating report PDF...',
        status: 'running',
        progress: 0,
        metadata: { reportId: data.reportId, siteId: site.id, siteName: site.name },
      });
      startReportPolling(data.reportId, taskId);

      // Hand the parent the PENDING report id so it can refresh + show a
      // skeleton row in the table while the pipeline finishes.
      onGenerated?.({ reportId: data.reportId, status: 'PENDING' });
      onClose();
    } catch (e) {
      setError(t('settings.clientReportingSection.wizard.generateError') || 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>
              <FileText size={18} />
              {t('settings.clientReportingSection.wizard.title') || 'Generate Report'}
            </h3>
            <p className={styles.modalSubtitle}>{stepTitles[step - 1]}</p>
          </div>
          <button className={styles.modalClose} onClick={handleClose} aria-label={t('common.close') || 'Close'}>
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`${styles.stepDot} ${n === step ? styles.stepDotActive : ''} ${n < step ? styles.stepDotDone : ''}`}
            >
              {n < step ? <Check size={12} /> : n}
            </div>
          ))}
        </div>

        <div className={styles.modalBody}>
          {/* Step 1: Sections + language */}
          {step === 1 && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <Languages size={14} />
                  {t('settings.clientReportingSection.wizard.language') || 'Report language'}
                </label>
                <select
                  className={styles.formInput}
                  value={reportLanguage}
                  onChange={(e) => setReportLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="he">עברית</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {t('settings.clientReportingSection.wizard.sections') || 'Included sections'}
                </label>
                <ul className={styles.sectionsList}>
                  {sections.map((s, idx) => (
                    <li key={s.id} className={styles.sectionItem}>
                      <label className={styles.sectionToggle}>
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => toggleSection(s.id)}
                        />
                        <span>{sectionLabel(s.id)}</span>
                      </label>
                      <div className={styles.sectionControls}>
                        <button
                          type="button"
                          className={styles.sectionBtn}
                          onClick={() => moveSection(s.id, -1)}
                          disabled={idx === 0}
                          aria-label={t('common.moveUp') || 'Move up'}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          className={styles.sectionBtn}
                          onClick={() => moveSection(s.id, 1)}
                          disabled={idx === sections.length - 1}
                          aria-label={t('common.moveDown') || 'Move down'}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {enabledSectionCount === 0 && (
                  <p className={styles.formError}>
                    {t('settings.clientReportingSection.wizard.atLeastOneSection') || 'Select at least one section.'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Step 2: Period comparison */}
          {step === 2 && (
            <>
              <p className={styles.stepDescription}>
                <Calendar size={14} />
                {t('settings.clientReportingSection.wizard.periodHelp') || 'Pick which months to compare. Only months with audit or action data are shown.'}
              </p>
              {availablePeriods.availableMonths.length === 0 ? (
                <p className={styles.formHint}>
                  {t('settings.clientReportingSection.wizard.noPeriodsHint') || 'No historical data yet — the report will use current data only.'}
                </p>
              ) : (
                <div className={styles.periodGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {t('settings.clientReportingSection.wizard.currentMonth') || 'Current month'}
                    </label>
                    <select
                      className={styles.formInput}
                      value={currentMonthKey}
                      onChange={(e) => setCurrentMonthKey(e.target.value)}
                    >
                      {availablePeriods.availableMonths.map((key) => (
                        <option key={key} value={key}>{formatMonthKey(key, locale)}</option>
                      ))}
                    </select>
                  </div>
                  {availablePeriods.hasComparison && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        {t('settings.clientReportingSection.wizard.previousMonth') || 'Compare to'}
                      </label>
                      <select
                        className={styles.formInput}
                        value={previousMonthKey}
                        onChange={(e) => setPreviousMonthKey(e.target.value)}
                      >
                        <option value="">{t('settings.clientReportingSection.wizard.noComparison') || 'No comparison'}</option>
                        {availablePeriods.availableMonths
                          .filter((key) => key !== currentMonthKey)
                          .map((key) => (
                            <option key={key} value={key}>{formatMonthKey(key, locale)}</option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Step 3: Recipients */}
          {step === 3 && (
            <>
              <p className={styles.stepDescription}>
                <Mail size={14} />
                {t('settings.clientReportingSection.wizard.recipientsHelp') || 'Optional. Add comma-separated emails to enable sending the PDF after generation.'}
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {t('settings.clientReportingSection.wizard.recipients') || 'Recipient emails'}
                </label>
                <textarea
                  className={styles.formTextarea}
                  rows={3}
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={t('settings.clientReportingSection.wizard.recipientsPlaceholder') || 'client@example.com, team@example.com'}
                />
                <p className={styles.formHint}>
                  {t('settings.clientReportingSection.wizard.recipientsHint') || "We'll save these as defaults for next time."}
                </p>
              </div>
            </>
          )}

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || isGenerating}
          >
            <ChevronLeft size={14} />
            {t('common.back') || 'Back'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              disabled={!canAdvance}
            >
              {t('common.next') || 'Next'}
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleGenerate}
              disabled={isGenerating || enabledSectionCount === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className={styles.spinningIcon} />
                  {t('settings.clientReportingSection.wizard.generating') || 'Generating...'}
                </>
              ) : (
                <>
                  <FileText size={14} />
                  {t('settings.clientReportingSection.wizard.generate') || 'Generate report'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
