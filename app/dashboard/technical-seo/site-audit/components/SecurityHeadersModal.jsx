'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Wrench,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './SecurityHeadersModal.module.css';

/**
 * SECURITY_HEADERS — the 6 headers we can fix, with their audit issue keys.
 */
const SECURITY_HEADERS = [
  {
    key: 'strict-transport-security',
    issueKey: 'audit.issues.noHsts',
    nameKey: 'siteAudit.secHeaders.hsts',
    descKey: 'siteAudit.secHeaders.hstsDesc',
  },
  {
    key: 'x-frame-options',
    issueKey: 'audit.issues.noXFrameOptions',
    nameKey: 'siteAudit.secHeaders.xframe',
    descKey: 'siteAudit.secHeaders.xframeDesc',
  },
  {
    key: 'x-content-type-options',
    issueKey: 'audit.issues.noContentTypeOptions',
    nameKey: 'siteAudit.secHeaders.xcto',
    descKey: 'siteAudit.secHeaders.xctoDesc',
  },
  {
    key: 'content-security-policy',
    issueKey: 'audit.issues.noCsp',
    nameKey: 'siteAudit.secHeaders.csp',
    descKey: 'siteAudit.secHeaders.cspDesc',
  },
  {
    key: 'referrer-policy',
    issueKey: 'audit.issues.noReferrerPolicy',
    nameKey: 'siteAudit.secHeaders.referrer',
    descKey: 'siteAudit.secHeaders.referrerDesc',
  },
  {
    key: 'permissions-policy',
    issueKey: 'audit.issues.noPermissionsPolicy',
    nameKey: 'siteAudit.secHeaders.permissions',
    descKey: 'siteAudit.secHeaders.permissionsDesc',
  },
];

/**
 * SecurityHeadersModal — Shows explanation of missing security headers and a
 * single "Fix All" button that enables all headers via the WordPress plugin.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - siteId: string
 * - auditId: string
 * - missingHeaders: string[] — array of issue keys that are missing (e.g. 'audit.issues.noHsts')
 * - onAuditUpdated: () => void
 */
export default function SecurityHeadersModal({
  open,
  onClose,
  siteId,
  auditId,
  missingHeaders = [],
  onAuditUpdated,
}) {
  const { t } = useLocale();
  const [isFixing, setIsFixing] = useState(false);
  const [fixingKey, setFixingKey] = useState(null); // null = fix-all, or a specific header key
  const [fixedKeys, setFixedKeys] = useState(new Set());
  const [error, setError] = useState(null);
  const [appliedHeaders, setAppliedHeaders] = useState({});

  if (!open) return null;

  const missingSet = new Set(missingHeaders);
  const allFixed = missingHeaders.length > 0 && missingHeaders.every((k) => {
    const hdr = SECURITY_HEADERS.find((h) => h.issueKey === k);
    return hdr && fixedKeys.has(hdr.key);
  });

  /** Call the API to fix header(s). If headerKey is provided, fix just that one. */
  const doFix = async (headerKey) => {
    setIsFixing(true);
    setFixingKey(headerKey || null);
    setError(null);

    try {
      const body = { siteId, auditId };
      if (headerKey) body.headerKeys = [headerKey];

      const res = await fetch('/api/audit/fix-security-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const code = data.code;
        if (code === 'PLUGIN_UPDATE_REQUIRED') {
          setError(t('siteAudit.secHeaders.pluginUpdateRequired'));
        } else if (code === 'PLUGIN_NOT_CONNECTED') {
          setError(t('siteAudit.secHeaders.pluginNotConnected'));
        } else {
          setError(data.error || t('siteAudit.secHeaders.fixFailed'));
        }
        return;
      }

      setAppliedHeaders((prev) => ({ ...prev, ...(data.headers || {}) }));

      if (headerKey) {
        setFixedKeys((prev) => new Set([...prev, headerKey]));
      } else {
        // Fix-all: mark all missing as fixed
        const allKeys = SECURITY_HEADERS.filter((h) => missingSet.has(h.issueKey)).map((h) => h.key);
        setFixedKeys(new Set(allKeys));
      }

      if (data.auditUpdated && onAuditUpdated) {
        onAuditUpdated();
      }
    } catch (err) {
      console.error('[SecurityHeadersModal] Error:', err);
      setError(err.message);
    } finally {
      setIsFixing(false);
      setFixingKey(null);
    }
  };

  const handleFixAll = () => doFix(null);
  const handleFixOne = (headerKey) => doFix(headerKey);

  const handleClose = () => {
    setFixedKeys(new Set());
    setError(null);
    setAppliedHeaders({});
    onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>
          <X size={18} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Shield size={24} />
          </div>
          <h2 className={styles.title}>{t('siteAudit.secHeaders.title')}</h2>
          <p className={styles.subtitle}>
            {t('siteAudit.secHeaders.subtitle')}
            {' '}
            <span className={styles.freeBadge}>{t('siteAudit.secHeaders.free')}</span>
          </p>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Header explanations */}
          <div className={styles.headerList}>
            {SECURITY_HEADERS.map((h) => {
              const isMissing = missingSet.has(h.issueKey);
              const isItemFixed = fixedKeys.has(h.key);
              const isItemFixing = isFixing && fixingKey === h.key;

              return (
                <div
                  key={h.key}
                  className={`${styles.headerItem} ${isItemFixed ? styles.headerFixed : ''}`}
                >
                  <div className={styles.headerIcon}>
                    {isItemFixed ? (
                      <CheckCircle2 size={18} />
                    ) : isMissing ? (
                      <AlertTriangle size={18} />
                    ) : (
                      <CheckCircle2 size={18} style={{ color: 'var(--success-color, #22c55e)' }} />
                    )}
                  </div>
                  <div className={styles.headerInfo}>
                    <p className={styles.headerName}>{t(h.nameKey)}</p>
                    <p className={styles.headerDesc}>{t(h.descKey)}</p>
                    {isItemFixed && appliedHeaders[h.key] && (
                      <div className={styles.headerValue}>
                        {h.key}: {appliedHeaders[h.key]}
                      </div>
                    )}
                  </div>
                  {isMissing && !isItemFixed && (
                    <button
                      className={styles.fixOneBtn}
                      onClick={() => handleFixOne(h.key)}
                      disabled={isFixing}
                    >
                      {isItemFixing ? (
                        <Loader2 size={13} className={styles.spinning} />
                      ) : (
                        <Wrench size={13} />
                      )}
                      <span>{t('siteAudit.secHeaders.fixOne')}</span>
                    </button>
                  )}
                  {isItemFixed && (
                    <span className={styles.fixedBadge}>
                      <CheckCircle2 size={13} />
                      {t('siteAudit.secHeaders.fixed')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className={styles.error}>
              <XCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions / Success */}
          {allFixed ? (
            <div className={styles.successState}>
              <CheckCircle2 size={36} className={styles.successIcon} />
              <p className={styles.successText}>{t('siteAudit.secHeaders.successTitle')}</p>
              <p className={styles.successHint}>{t('siteAudit.secHeaders.successHint')}</p>
            </div>
          ) : (
            <div className={styles.actions}>
              <button
                className={styles.fixAllBtn}
                onClick={handleFixAll}
                disabled={isFixing || missingHeaders.length === 0}
              >
                {isFixing && fixingKey === null ? (
                  <Loader2 size={16} className={styles.spinning} />
                ) : (
                  <Wrench size={16} />
                )}
                <span>
                  {isFixing && fixingKey === null
                    ? t('siteAudit.secHeaders.fixing')
                    : t('siteAudit.secHeaders.fixAll')}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
