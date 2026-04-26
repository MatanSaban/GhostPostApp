'use client';

import { createPortal } from 'react-dom';
import {
  X,
  Layers,
  Sparkles,
  Activity,
  Bot,
  Target,
  Users,
  Search,
  Globe,
  ClipboardList,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './SectionsInfoModal.module.css';

/*
 * Per-section icon map. Keeps the modal visually scannable so the user
 * can spot the section they want at a glance without reading every row.
 */
const SECTION_ICONS = {
  overview: Layers,
  aiSummary: Sparkles,
  healthScore: Activity,
  aiActions: Bot,
  keywords: Target,
  competitors: Users,
  seo: Search,
  geo: Globe,
  siteAudits: ClipboardList,
};

/**
 * SectionsInfoModal — shows the sections included in a given report,
 * each with a short explanation of what it contains. Triggered by
 * clicking the Sections cell on a row in the reports table.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {Object} props.report - Report row; we read `sectionsConfig` and `month`.
 */
export function SectionsInfoModal({ isOpen, onClose, report }) {
  const { t } = useLocale();

  if (!isOpen || !report) return null;
  if (typeof document === 'undefined') return null;

  const sections = Array.isArray(report?.sectionsConfig?.sections)
    ? report.sectionsConfig.sections.filter((s) => s?.enabled !== false).map((s) => s.id)
    : [];

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>
              <Layers size={16} />
              {t('settings.clientReportingSection.sectionsModal.title') || 'Report sections'}
            </h3>
            {report.month && <p className={styles.subtitle}>{report.month}</p>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {sections.length === 0 ? (
            <p className={styles.emptyText}>
              {t('settings.clientReportingSection.sectionsModal.empty') || 'This report has no sections recorded.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {sections.map((id) => {
                const Icon = SECTION_ICONS[id] || Layers;
                const title = t(`settings.clientReportingSection.options.${id}`) || id;
                const description = t(`settings.clientReportingSection.optionDescriptions.${id}`) || '';
                return (
                  <li key={id} className={styles.item}>
                    <span className={styles.itemIcon}>
                      <Icon size={16} />
                    </span>
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>{title}</div>
                      {description && <div className={styles.itemDescription}>{description}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
