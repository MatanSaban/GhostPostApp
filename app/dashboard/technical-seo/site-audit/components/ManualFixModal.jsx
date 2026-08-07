'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Download,
  ExternalLink,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocale } from '@/app/context/locale-context';
import { emitCreditsUpdated } from '@/app/context/user-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import GCoinIcon from '@/app/components/ui/GCoinIcon';
import styles from './ManualFixModal.module.css';

/**
 * ManualFixModal - custom-site (non-WP / no-plugin) audit fix flow.
 *
 * Confirm → generate → render the dispatcher's manualOutputs (ready-to-copy
 * snippets / values / records / instructions). The non-WP preview charges the
 * FULL fixer price immediately, so step 1 is an explicit confirm. Re-opening
 * a previously generated fix is free — the server answers with cached:true
 * and we show a "no additional charge" note instead (response-driven).
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - siteId: string
 * - auditId: string
 * - issueType: string        (fix-registry key, e.g. 'missing-title')
 * - issueTitle: string       (human label shown in the header)
 * - credits: number|null     (fixer cost if the caller knows it; confirm copy adapts)
 * - onFixed: (data) => void  (fired once per fresh generation, after a successful non-cached preview)
 */
export default function ManualFixModal({
  open,
  onClose,
  siteId,
  auditId,
  issueType,
  issueTitle,
  credits = null,
  onFixed,
}) {
  const { t } = useLocale();
  const { isMaximized, toggleMaximize } = useModalResize();

  // tr(key, fallback) - t() echoes the key when the translation is missing.
  const tr = useCallback((key, fallback, params) => {
    const translated = t(key, params);
    if (translated !== key) return translated;
    let result = fallback;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return result;
  }, [t]);

  // 'confirm' | 'loading' | 'result' | 'error'
  const [step, setStep] = useState('confirm');
  const [error, setError] = useState(null);
  // { outputs, cached, creditsUsed }
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState('');

  const requestingRef = useRef(false);
  const copyTimerRef = useRef(null);

  // Reset to the confirm step every time the modal opens (server cache makes
  // a re-confirm free, so no charge risk).
  useEffect(() => {
    if (open) {
      setStep('confirm');
      setError(null);
      setResult(null);
      setCopied('');
    }
  }, [open]);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  // ─── Generate (POST preview - exactly once per confirm) ─────────

  const generate = useCallback(async () => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setStep('loading');
    setError(null);

    try {
      const res = await fetch('/api/audit/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId, siteId, issueType, action: 'preview' }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_CREDITS' && handleLimitError(data)) {
          // Global limit modal is showing - drop back to confirm.
          setStep('confirm');
          return;
        }
        throw new Error(data.error || tr('siteAudit.manualFix.errorGeneric', 'Failed to generate the fix.'));
      }

      setResult({
        outputs: data.manualOutputs || [],
        cached: !!data.cached,
        creditsUsed: data.creditsUsed || 0,
      });
      setStep('result');

      if (!data.cached) {
        if ((data.creditsUsed || 0) > 0) emitCreditsUpdated();
        onFixed?.(data);
      }
    } catch (err) {
      console.error('[ManualFixModal] preview error:', err);
      setError(err.message);
      setStep('error');
    } finally {
      requestingRef.current = false;
    }
  }, [auditId, siteId, issueType, onFixed, tr]);

  // ─── Copy helper (Copy → Check swap, like PostPopover) ──────────

  const copyText = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopied(key);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard blocked */ }
  }, []);

  // ─── Group outputs by page/url when the handler attached one ────

  const groups = useMemo(() => {
    const map = new Map();
    (result?.outputs || []).forEach((out) => {
      const key = out.page || out.pageUrl || out.url || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(out);
    });
    return [...map.entries()];
  }, [result]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}>
          <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <ClipboardList size={24} />
          </div>
          <h3 className={styles.title}>{tr('siteAudit.manualFix.title', 'Copy-paste fix')}</h3>
          {(issueTitle || issueType) && (
            <p className={styles.subtitle}>{issueTitle || issueType}</p>
          )}
        </div>

        {/* Step 1 - confirm */}
        {step === 'confirm' && (
          <div className={styles.confirmState}>
            <p className={styles.confirmBody}>
              {tr('siteAudit.manualFix.confirmBody',
                'GhostSEO will generate ready-to-apply fix content (code snippets, values or step-by-step instructions) tailored to this site. You apply it yourself - nothing is changed on your site automatically.')}
            </p>
            {(credits == null || credits > 0) && (
              <div className={styles.chargeNote}>
                <GCoinIcon size={14} />
                <span>
                  {credits != null
                    ? tr('siteAudit.manualFix.chargeNote', 'Generating this fix will charge {count} Ai-GCoins immediately.', { count: credits })
                    : tr('siteAudit.manualFix.chargeNoteUnknown', 'Generating this fix will charge Ai-GCoins immediately.')}
                </span>
              </div>
            )}
            <p className={styles.cachedHint}>
              {tr('siteAudit.manualFix.cachedHint',
                'Already generated for this audit? Reopening is free - you will not be charged twice.')}
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={onClose}>
                {tr('siteAudit.manualFix.cancel', 'Cancel')}
              </button>
              <button className={styles.confirmBtn} onClick={generate}>
                <Wand2 size={15} />
                {tr('siteAudit.manualFix.confirm', 'Generate fix')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 - loading */}
        {step === 'loading' && (
          <div className={styles.loadingState}>
            <Loader2 size={28} className={styles.spinning} />
            <span>{tr('siteAudit.manualFix.loading', 'Generating your fix...')}</span>
            <span className={styles.loadingHint}>{tr('siteAudit.manualFix.loadingHint', 'This can take up to a minute.')}</span>
          </div>
        )}

        {/* Error - inline with retry */}
        {step === 'error' && (
          <div className={styles.errorState}>
            <XCircle size={32} color="var(--error, #ef4444)" />
            <p className={styles.errorMsg}>{error}</p>
            <button className={styles.retryBtn} onClick={generate}>
              <RefreshCw size={14} />
              {tr('siteAudit.manualFix.retry', 'Try again')}
            </button>
          </div>
        )}

        {/* Step 3 - render manualOutputs */}
        {step === 'result' && result && (
          <>
            <div className={styles.outputsList}>
              {result.outputs.length === 0 && (
                <div className={styles.emptyState}>
                  <CheckCircle2 size={32} color="var(--success, #22c55e)" />
                  <span>{tr('siteAudit.manualFix.noOutputs', 'No fix content was generated for this issue.')}</span>
                </div>
              )}

              {groups.map(([pageUrl, outputs], gIdx) => (
                <div key={pageUrl || `general-${gIdx}`} className={styles.pageGroup}>
                  {pageUrl && (
                    <div className={styles.pageGroupHeader}>
                      <a href={pageUrl} target="_blank" rel="noopener noreferrer" className={styles.pageUrlLink} title={pageUrl}>
                        <bdi dir="ltr">{formatPageUrl(pageUrl)}</bdi>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                  {outputs.map((out, idx) => (
                    <OutputCard
                      key={`${gIdx}-${idx}`}
                      out={out}
                      path={`${gIdx}-${idx}`}
                      copied={copied}
                      onCopy={copyText}
                      tr={tr}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Footer - charge note is response-driven */}
            <div className={styles.footer}>
              <span className={styles.footerInfo}>
                {result.cached ? (
                  <>
                    <CheckCircle2 size={14} color="var(--success, #22c55e)" />
                    {tr('siteAudit.manualFix.cachedFree', 'Previously generated - no additional charge.')}
                  </>
                ) : result.creditsUsed > 0 ? (
                  <>
                    <GCoinIcon size={14} />
                    {tr('siteAudit.manualFix.charged', '{count} Ai-GCoins charged', { count: result.creditsUsed })}
                  </>
                ) : null}
              </span>
              <button className={styles.doneBtn} onClick={onClose}>
                <Check size={15} />
                {tr('siteAudit.manualFix.done', 'Done')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatPageUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : `${u.hostname}${decodeURIComponent(u.pathname)}`;
  } catch {
    return url;
  }
}

function downloadInlineFile(data) {
  const blob = new Blob([data.content || ''], { type: data.contentType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename || 'fix.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Per-kind renderers ───────────────────────────────────────────

/**
 * Renders one ManualOutput (see lib/audit/fix-manual-output.js).
 * Every kind shares the envelope { title, why?, instructions } - the body
 * varies per kind. `composite` recurses into data.parts.
 */
function OutputCard({ out, path, copied, onCopy, tr, nested = false }) {
  if (!out) return null;
  const data = out.data || {};

  const copyBtn = (text, key) => (
    <button className={styles.copyBtn} onClick={() => onCopy(text, key)} type="button">
      {copied === key ? <Check size={13} /> : <Copy size={13} />}
      {copied === key
        ? tr('siteAudit.manualFix.copied', 'Copied')
        : tr('siteAudit.manualFix.copy', 'Copy')}
    </button>
  );

  let body = null;

  switch (out.kind) {
    case 'snippet':
    case 'htaccess':
    case 'nginx':
      body = (
        <div className={styles.codeCard}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLang}>{data.language || 'text'}</span>
            {data.where && (
              <span className={styles.codeWhere}>
                {tr('siteAudit.manualFix.whereLabel', 'Where:')} <bdi dir="ltr">{data.where}</bdi>
              </span>
            )}
            {copyBtn(data.code, `${path}-code`)}
          </div>
          <pre dir="ltr" className={styles.codeBlock}><code>{data.code}</code></pre>
        </div>
      );
      break;

    case 'value':
      body = (
        <div className={styles.valueRow}>
          <span className={styles.valueField}>
            {data.field || tr('siteAudit.manualFix.valueLabel', 'Value')}
          </span>
          <span className={styles.valueText} dir="auto">{data.value}</span>
          {data.charLimit != null && (
            <span className={styles.charHint}>
              {tr('siteAudit.manualFix.charLimitHint', 'max {count} chars', { count: data.charLimit })}
            </span>
          )}
          {copyBtn(data.value, `${path}-value`)}
        </div>
      );
      break;

    case 'redirect':
      body = (
        <div className={styles.redirectRow} dir="ltr">
          <span className={styles.redirectBadge}>{data.statusCode || 301}</span>
          <code className={styles.redirectUrl} title={tr('siteAudit.manualFix.redirectFrom', 'From')}>{data.from}</code>
          <ArrowRight size={14} className={styles.redirectArrow} />
          <code className={styles.redirectUrl} title={tr('siteAudit.manualFix.redirectTo', 'To')}>{data.to}</code>
        </div>
      );
      break;

    case 'dnsRecord':
      body = (
        <div className={styles.tableWrap} dir="ltr">
          <table className={styles.dnsTable}>
            <thead>
              <tr>
                <th>{tr('siteAudit.manualFix.recordType', 'Type')}</th>
                <th>{tr('siteAudit.manualFix.recordName', 'Name')}</th>
                <th>{tr('siteAudit.manualFix.recordValue', 'Value')}</th>
                {data.ttl != null && <th>{tr('siteAudit.manualFix.recordTtl', 'TTL')}</th>}
                {data.priority != null && <th>{tr('siteAudit.manualFix.recordPriority', 'Priority')}</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{data.type}</td>
                <td className={styles.dnsMono}>{data.name}</td>
                <td className={styles.dnsMono}>{data.value}</td>
                {data.ttl != null && <td>{data.ttl}</td>}
                {data.priority != null && <td>{data.priority}</td>}
                <td>{copyBtn(data.value, `${path}-dns`)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
      break;

    case 'image':
      body = (
        <div className={styles.imageCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.url} alt={data.altText || ''} className={styles.imagePreview} />
          <div className={styles.imageMeta}>
            {data.filename && <span className={styles.fileName} dir="ltr">{data.filename}</span>}
            {data.width && data.height && (
              <span className={styles.imageDims} dir="ltr">{data.width}&times;{data.height}</span>
            )}
            <div className={styles.imageActions}>
              <a
                href={data.url}
                download={data.filename || true}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkBtn}
              >
                <Download size={13} />
                {tr('siteAudit.manualFix.download', 'Download')}
              </a>
              {copyBtn(data.url, `${path}-img`)}
            </div>
          </div>
        </div>
      );
      break;

    case 'file':
      body = (
        <div className={styles.codeCard}>
          <div className={styles.codeHeader}>
            <span className={styles.fileName} dir="ltr">{data.filename}</span>
            {data.content && copyBtn(data.content, `${path}-file`)}
            {data.content ? (
              <button className={styles.linkBtn} onClick={() => downloadInlineFile(data)} type="button">
                <Download size={13} />
                {tr('siteAudit.manualFix.download', 'Download')}
              </button>
            ) : (
              <a
                href={data.url}
                download={data.filename || true}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkBtn}
              >
                <Download size={13} />
                {tr('siteAudit.manualFix.download', 'Download')}
              </a>
            )}
          </div>
          {data.content && (
            <pre dir="ltr" className={styles.codeBlock}><code>{data.content}</code></pre>
          )}
        </div>
      );
      break;

    case 'wpAdminStep':
      body = (
        <ol className={styles.stepsList}>
          {(data.steps || []).map((s, i) => (
            <li key={i}>
              <span>{s.text}</span>
              {s.note && <span className={styles.stepNote}>{s.note}</span>}
            </li>
          ))}
        </ol>
      );
      break;

    case 'composite':
      body = (
        <div className={styles.compositeParts}>
          {(data.parts || []).map((part, i) => (
            <OutputCard
              key={i}
              out={part}
              path={`${path}-${i}`}
              copied={copied}
              onCopy={onCopy}
              tr={tr}
              nested
            />
          ))}
        </div>
      );
      break;

    case 'instructions':
    default:
      // Envelope instructions below are the whole body for this kind.
      body = null;
      break;
  }

  return (
    <div className={`${styles.outputCard} ${nested ? styles.outputNested : ''}`}>
      {out.title && <h4 className={styles.outputTitle}>{out.title}</h4>}
      {out.why && <p className={styles.outputWhy}>{out.why}</p>}
      {body}
      {out.instructions && (
        <div className={styles.instructions}>
          {out.kind !== 'instructions' && (
            <span className={styles.instructionsLabel}>
              {tr('siteAudit.manualFix.howToApply', 'How to apply')}
            </span>
          )}
          <div className={styles.instructionsBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{out.instructions}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
