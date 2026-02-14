'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  XCircle,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Palette,
  Code2,
  Wand2,
  Loader2,
  Coins,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { toImgSrc } from '../lib/img-src';
import styles from './AccessibilityIssueCard.module.css';

/**
 * AccessibilityIssueCard — Expandable rule-level card with per-element evidence
 *
 * Props:
 * - rule: aggregated rule object { ruleId, impact, description, helpUrl, message, severity, urls[], nodes[] }
 * - auditId, siteId: for AI fix API
 * - onFixComplete: callback after fix
 */
export default function AccessibilityIssueCard({
  rule,
  auditId,
  siteId,
  onFixComplete,
  translateIssueMsg,
  locale,
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [fixingIndex, setFixingIndex] = useState(-1);
  const [fixResults, setFixResults] = useState({}); // nodeIndex -> altText
  const [copiedIndex, setCopiedIndex] = useState(-1);
  const [lightboxImg, setLightboxImg] = useState(null);

  const nodes = rule.nodes || [];
  const isImageAltRule = ['image-alt', 'input-image-alt', 'area-alt'].includes(rule.ruleId);
  const isContrastRule = rule.ruleId === 'color-contrast';

  const handleAltFix = async (nodeIndex) => {
    const node = nodes[nodeIndex];
    if (!node || fixingIndex >= 0) return;
    setFixingIndex(nodeIndex);

    try {
      const res = await fetch('/api/audit/a11y-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId,
          siteId,
          pageUrl: node.pageUrl || '',
          selector: node.selector || '',
          elementScreenshot: node.elementScreenshot || null,
          imageSrc: node.metadata?.imageSrc || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (handleLimitError(data)) return; // shows global modal
        alert(data.error || 'Fix failed');
        return;
      }

      if (data.creditsUpdated?.used != null) {
        emitCreditsUpdated(data.creditsUpdated.used);
      }

      setFixResults((prev) => ({ ...prev, [nodeIndex]: data.altText }));
      if (onFixComplete) onFixComplete(data);
    } catch (err) {
      console.error('[A11yFix] Failed:', err.message);
    } finally {
      setFixingIndex(-1);
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(-1), 2000);
    });
  };

  // Translated texts (falls back to English originals)
  const translatedDescription = translateIssueMsg
    ? translateIssueMsg(rule.description, 'message', rule.translationKey)
    : rule.description;
  const translatedSuggestion = translateIssueMsg
    ? translateIssueMsg(rule.suggestion || rule.description, 'suggestion', rule.translationKey)
    : (rule.suggestion || '');

  const SeverityIcon = rule.severity === 'error'
    ? XCircle
    : rule.severity === 'warning'
    ? AlertTriangle
    : Info;

  return (
    <>
      {/* Rule Header — always visible */}
      <button
        className={`${styles.card} ${styles[`impact_${rule.impact}`]}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={styles.cardIcon}>
          <SeverityIcon size={18} />
        </div>
        <div className={styles.cardContent}>
          <span className={styles.cardTitle}>{translatedDescription}</span>
          <span className={styles.cardMeta}>
            <span className={`${styles.impactBadge} ${styles[`impact_${rule.impact}`]}`}>
              {rule.impact}
            </span>
            <span className={styles.nodeCount}>
              {nodes.length} {nodes.length === 1 ? t('siteAudit.a11y.element') : t('siteAudit.a11y.elements')}
            </span>
            {rule.urls?.length > 0 && (
              <span className={styles.pageCount}>
                {rule.urls.length} {rule.urls.length === 1 ? t('siteAudit.page') : t('siteAudit.pages')}
              </span>
            )}
            {rule.helpUrl && (
              <a
                href={rule.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.helpLink}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
                {t('siteAudit.a11y.learnMore')}
              </a>
            )}
          </span>
        </div>
        <div className={styles.cardChevron}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Expanded: per-element evidence */}
      {expanded && (
        <div className={styles.nodeList}>
          {nodes.map((node, idx) => {
            const hasScreenshot = !!node.elementScreenshot;
            const hasCode = !!node.codeSnippet;
            const meta = node.metadata || {};
            const generatedAlt = fixResults[idx];

            return (
              <div key={idx} className={styles.nodeRow}>
                {/* Page URL badge (when grouped from multiple pages) */}
                {rule.urls?.length > 1 && node.pageUrl && (
                  <a
                    href={node.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.nodePageUrl}
                    dir="ltr"
                  >
                    <ExternalLink size={11} />
                    {(() => { try { return new URL(node.pageUrl).pathname; } catch { return node.pageUrl; } })()}
                  </a>
                )}
                {/* Split View: screenshot | code */}
                <div className={styles.splitView}>
                  {/* Left: Visual evidence */}
                  <div className={styles.visualSide}>
                    {hasScreenshot ? (
                      <div
                        className={styles.screenshotWrap}
                        onClick={() => setLightboxImg(toImgSrc(node.elementScreenshot))}
                      >
                        <img
                          src={toImgSrc(node.elementScreenshot)}
                          alt={t('siteAudit.a11y.elementScreenshot')}
                          className={styles.screenshot}
                        />
                      </div>
                    ) : (
                      <div className={styles.noScreenshot}>
                        <ImageIcon size={24} />
                        <span>{t('siteAudit.a11y.noScreenshot')}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Code + details */}
                  <div className={styles.codeSide}>
                    {hasCode && (
                      <div className={styles.codeBlock}>
                        <div className={styles.codeHeader}>
                          <Code2 size={13} />
                          <span>HTML</span>
                        </div>
                        <pre className={styles.codeSnippet}>
                          <code>{node.codeSnippet}</code>
                        </pre>
                      </div>
                    )}

                    {node.selector && (
                      <div className={styles.selectorRow}>
                        <span className={styles.selectorLabel}>Selector:</span>
                        <code className={styles.selectorValue}>{node.selector}</code>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata Section */}
                <div className={styles.metaSection}>
                  {/* Image metadata */}
                  {isImageAltRule && meta.imageSrc && (
                    <div className={styles.metaRow}>
                      <ImageIcon size={14} />
                      <span className={styles.metaLabel}>{t('siteAudit.a11y.fileName')}:</span>
                      <span className={styles.metaValue}>{meta.imageFileName || '—'}</span>
                      <a
                        href={meta.imageSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.metaLink}
                      >
                        {t('siteAudit.a11y.viewFull')}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}

                  {/* Color contrast metadata */}
                  {isContrastRule && (meta.fgColor || meta.bgColor) && (
                    <div className={styles.contrastRow}>
                      <Palette size={14} />
                      <div className={styles.contrastDetails}>
                        {meta.fgColor && (
                          <span className={styles.colorChip}>
                            <span
                              className={styles.colorSwatch}
                              style={{ backgroundColor: meta.fgColor }}
                            />
                            Text: {meta.fgColor}
                          </span>
                        )}
                        {meta.bgColor && (
                          <span className={styles.colorChip}>
                            <span
                              className={styles.colorSwatch}
                              style={{ backgroundColor: meta.bgColor }}
                            />
                            BG: {meta.bgColor}
                          </span>
                        )}
                        {meta.contrastRatio && (
                          <span className={styles.ratioChip}>
                            Ratio: {meta.contrastRatio}:1
                            {meta.expectedRatio && (
                              <span className={styles.expectedRatio}>
                                {' '}(need {meta.expectedRatio})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Quick Fix result */}
                  {generatedAlt && (
                    <div className={styles.fixResult}>
                      <CheckCircle2 size={14} />
                      <span className={styles.fixLabel}>{t('siteAudit.a11y.suggestedAlt')}:</span>
                      <code className={styles.fixValue}>{generatedAlt}</code>
                      <button
                        className={styles.copyBtn}
                        onClick={() => handleCopy(generatedAlt, idx)}
                      >
                        {copiedIndex === idx ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  )}

                  {/* AI Quick Fix button for image-alt issues */}
                  {isImageAltRule && !generatedAlt && (
                    <button
                      className={styles.fixButton}
                      onClick={() => handleAltFix(idx)}
                      disabled={fixingIndex >= 0}
                    >
                      {fixingIndex === idx ? (
                        <Loader2 size={14} className={styles.spinning} />
                      ) : (
                        <Wand2 size={14} />
                      )}
                      <span>{t('siteAudit.a11y.generateAlt')}</span>
                      <span className={styles.creditCost}>
                        <Coins size={12} /> 2
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && createPortal(
        <div className={styles.lightbox} onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" className={styles.lightboxImg} />
        </div>,
        document.body
      )}
    </>
  );
}
