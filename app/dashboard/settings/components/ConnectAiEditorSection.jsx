'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  Plus,
  X,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './ConnectAiEditorSection.module.css';

const API_URL = 'https://app.ghostseo.ai';

// Mirrored from lib/mcp/auth.js (SCOPES) - that module is server-only (it
// imports prisma), so the scope strings are duplicated here. Keep in sync.
const SCOPE_OPTIONS = [
  { value: 'issues:read', labelKey: 'scopeIssuesRead', fallback: 'Read SEO issues' },
  { value: 'fix:read', labelKey: 'scopeFixRead', fallback: 'Read ready-to-apply fixes' },
  { value: 'override:write', labelKey: 'scopeOverrideWrite', fallback: 'Propose SEO overrides' },
  { value: 'redirect:write', labelKey: 'scopeRedirectWrite', fallback: 'Propose redirects' },
];

const DEFAULT_SCOPES = SCOPE_OPTIONS.map((scope) => scope.value);
const EXPIRY_OPTIONS_DAYS = [30, 90, 365];
const DEFAULT_EXPIRY_DAYS = 90;

/**
 * ConnectAiEditorSection - "Connect AI Editor" (MCP tokens) settings panel.
 *
 * Lets the user mint read/propose-scoped MCP tokens for AI coding agents
 * (Cursor, Claude Code, ...) via the @ghostpost/mcp server, list the tokens
 * that apply to the selected site (site-bound + account-wide), and revoke
 * them. The plaintext token is shown exactly once at mint time, together
 * with a ready-to-paste mcpServers config snippet (see gp-mcp/README.md).
 *
 * Not platform-gated: WordPress/Shopify devs can use the MCP too. Pass
 * `highlighted` to visually emphasize it (custom-code sites).
 *
 * Uses useLocale() internally for translations (settings.aiEditor.* keys)
 * with inline English fallbacks until the dictionary keys land.
 *
 * @param {Object} props
 * @param {boolean} props.highlighted - Emphasized styling (custom-code sites)
 */
export default function ConnectAiEditorSection({ highlighted = false } = {}) {
  const { t, locale } = useLocale();
  const { selectedSite } = useSite();

  // t() echoes the key when a translation is missing - fall back to English
  // so the section works before the dictionary keys land.
  const tr = useCallback(
    (key, fallback) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );

  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // Mint modal
  const [mintOpen, setMintOpen] = useState(false);
  const [mintName, setMintName] = useState('');
  const [mintScopes, setMintScopes] = useState(DEFAULT_SCOPES);
  const [mintExpiryDays, setMintExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState(null);

  // Show-once modal - the plaintext token only ever lives in this state
  const [mintedToken, setMintedToken] = useState(null);

  const [revokingId, setRevokingId] = useState(null);
  const [revokeError, setRevokeError] = useState(null);

  const fetchTokens = useCallback(async () => {
    try {
      const response = await fetch('/api/mcp-tokens');
      if (!response.ok) throw new Error('load failed');
      const data = await response.json();
      setTokens(Array.isArray(data) ? data : data.tokens || []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // The endpoint returns every token on the account - show only the ones
  // relevant here: bound to the selected site, or account-wide (no siteId).
  const siteId = selectedSite?.id;
  const visibleTokens = tokens
    .filter((token) => !token.siteId || token.siteId === siteId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US') : null;

  const statusOf = (token) => {
    if (token.revokedAt) {
      return { label: tr('settings.aiEditor.revoked', 'Revoked'), color: 'error' };
    }
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      return { label: tr('settings.aiEditor.expired', 'Expired'), color: 'neutral' };
    }
    return { label: tr('settings.aiEditor.active', 'Active'), color: 'success' };
  };

  const copyValue = async (field, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const toggleScope = (scope) => {
    setMintScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const openMintModal = () => {
    setMintName('');
    setMintScopes(DEFAULT_SCOPES);
    setMintExpiryDays(DEFAULT_EXPIRY_DAYS);
    setMintError(null);
    setMintOpen(true);
  };

  const handleMint = async (event) => {
    event.preventDefault();
    if (mintScopes.length === 0) {
      setMintError(tr('settings.aiEditor.scopesRequired', 'Select at least one scope.'));
      return;
    }

    setMinting(true);
    setMintError(null);

    try {
      const response = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: mintName.trim(),
          siteId: siteId || null,
          scopes: mintScopes,
          expiresInDays: mintExpiryDays,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || tr('settings.aiEditor.mintFailed', 'Failed to create token.'));
      }

      // Plaintext is returned once at creation (only the hash is stored).
      const plaintext = data.token || data.plaintext || data.plaintextToken;
      if (!plaintext) {
        throw new Error(tr('settings.aiEditor.mintFailed', 'Failed to create token.'));
      }

      setMintOpen(false);
      setMintedToken(plaintext);
      fetchTokens();
    } catch (error) {
      setMintError(error.message);
    } finally {
      setMinting(false);
    }
  };

  const handleRevoke = async (token) => {
    const confirmMessage = tr(
      'settings.aiEditor.revokeConfirm',
      'Revoke this token? Any AI editor using it will immediately lose access.',
    );
    if (!window.confirm(confirmMessage)) return;

    setRevokingId(token.id);
    setRevokeError(null);

    try {
      // DELETE /api/mcp-tokens/:id revokes (soft-delete via revokedAt); fall
      // back to the POST .../revoke spelling if the API uses that instead.
      let response = await fetch(`/api/mcp-tokens/${token.id}`, { method: 'DELETE' });
      if (response.status === 404 || response.status === 405) {
        response = await fetch(`/api/mcp-tokens/${token.id}/revoke`, { method: 'POST' });
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || tr('settings.aiEditor.revokeFailed', 'Failed to revoke token.'));
      }
      fetchTokens();
    } catch (error) {
      setRevokeError(error.message);
    } finally {
      setRevokingId(null);
    }
  };

  // mcpServers snippet mirroring gp-mcp/README.md "Connect (Cursor / Claude Code)"
  const buildConfigSnippet = (token) =>
    JSON.stringify(
      {
        mcpServers: {
          'ghostpost-seo': {
            command: 'npx',
            args: ['-y', '@ghostpost/mcp'],
            env: {
              GHOSTPOST_MCP_TOKEN: token,
              GHOSTPOST_SITE_KEY: selectedSite?.siteKey || 'gp_site_...',
              GHOSTPOST_API_URL: API_URL,
            },
          },
        },
      },
      null,
      2,
    );

  const renderCodeBlock = (code, copyKey) => (
    <div className={styles.codeBlock} dir="ltr">
      <pre className={styles.codePre}>{code}</pre>
      <button
        type="button"
        className={styles.copyCodeButton}
        onClick={() => copyValue(copyKey, code)}
        aria-label={tr('settings.aiEditor.copy', 'Copy')}
        title={tr('settings.aiEditor.copy', 'Copy')}
      >
        {copiedField === copyKey ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );

  if (!selectedSite) return null;

  return (
    <div className={`${styles.container} ${highlighted ? styles.highlighted : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>
            <Bot size={18} />
            {tr('settings.aiEditor.title', 'Connect AI Editor (MCP)')}
            {highlighted && (
              <span className={styles.recommendedBadge}>
                {tr('settings.aiEditor.recommendedForCustom', 'Recommended for custom-code sites')}
              </span>
            )}
          </h3>
          <p className={styles.description}>
            {tr(
              'settings.aiEditor.description',
              "Mint a scoped token so your AI coding agent (Cursor, Claude Code, ...) can read this site's SEO issues and propose fixes through the GhostSEO MCP server. Tokens only propose changes - they can never push to a live site.",
            )}
          </p>
        </div>
        <button type="button" className={styles.mintButton} onClick={openMintModal}>
          <Plus size={14} />
          {tr('settings.aiEditor.mintToken', 'Mint token')}
        </button>
      </div>

      {/* Errors */}
      {loadFailed && (
        <div className={styles.errorMessage}>
          <AlertCircle size={14} />
          <span>{tr('settings.aiEditor.loadFailed', 'Failed to load tokens.')}</span>
        </div>
      )}
      {revokeError && (
        <div className={styles.errorMessage}>
          <AlertCircle size={14} />
          <span>{revokeError}</span>
        </div>
      )}

      {/* Token table */}
      {loading ? (
        <div className={styles.loadingRow}>
          <Loader2 size={16} className={styles.spinning} />
        </div>
      ) : visibleTokens.length === 0 ? (
        !loadFailed && (
          <p className={styles.emptyState}>
            {tr('settings.aiEditor.noTokens', 'No tokens yet - mint one to connect your AI editor.')}
          </p>
        )
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{tr('settings.aiEditor.colName', 'Name')}</th>
                <th>{tr('settings.aiEditor.colScopes', 'Scopes')}</th>
                <th>{tr('settings.aiEditor.colCreated', 'Created')}</th>
                <th>{tr('settings.aiEditor.colExpires', 'Expires')}</th>
                <th>{tr('settings.aiEditor.colLastUsed', 'Last used')}</th>
                <th>{tr('settings.aiEditor.colStatus', 'Status')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {visibleTokens.map((token) => {
                const status = statusOf(token);
                return (
                  <tr key={token.id} className={token.revokedAt ? styles.revokedRow : ''}>
                    <td>
                      <div className={styles.nameCell}>
                        <span className={styles.tokenName}>
                          {token.label || tr('settings.aiEditor.unnamed', 'Unnamed token')}
                        </span>
                        {token.prefix && (
                          <code className={styles.tokenPrefix} dir="ltr">{token.prefix}</code>
                        )}
                        {!token.siteId && (
                          <span className={styles.scopePill}>
                            {tr('settings.aiEditor.accountWide', 'All sites')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.scopeList} dir="ltr">
                        {(token.scopes || []).map((scope) => (
                          <span key={scope} className={styles.scopePill}>{scope}</span>
                        ))}
                      </div>
                    </td>
                    <td>{formatDate(token.createdAt) || '-'}</td>
                    <td>{formatDate(token.expiresAt) || tr('settings.aiEditor.never', 'Never')}</td>
                    <td>{formatDate(token.lastUsedAt) || tr('settings.aiEditor.never', 'Never')}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[status.color]}`}>
                        {status.label}
                      </span>
                    </td>
                    <td>
                      {!token.revokedAt && (
                        <button
                          type="button"
                          className={styles.revokeButton}
                          onClick={() => handleRevoke(token)}
                          disabled={revokingId === token.id}
                        >
                          {revokingId === token.id ? (
                            <Loader2 size={13} className={styles.spinning} />
                          ) : (
                            <Ban size={13} />
                          )}
                          {tr('settings.aiEditor.revoke', 'Revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mint modal */}
      {mintOpen && createPortal(
        <div className={styles.modalOverlay} onClick={() => !minting && setMintOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {tr('settings.aiEditor.mintTitle', 'Mint MCP token')}
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setMintOpen(false)}
                aria-label={tr('common.cancel', 'Cancel')}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleMint}>
              <div className={styles.modalBody}>
                {mintError && (
                  <div className={styles.errorMessage}>
                    <AlertCircle size={14} />
                    <span>{mintError}</span>
                  </div>
                )}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="gp-mcp-token-name">
                    {tr('settings.aiEditor.nameLabel', 'Token name')}
                  </label>
                  <input
                    id="gp-mcp-token-name"
                    type="text"
                    className={styles.formInput}
                    value={mintName}
                    onChange={(e) => setMintName(e.target.value)}
                    placeholder={tr('settings.aiEditor.namePlaceholder', 'e.g. Cursor on my laptop')}
                    maxLength={80}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <span className={styles.formLabel}>
                    {tr('settings.aiEditor.scopesLabel', 'Scopes')}
                  </span>
                  <div className={styles.scopeOptions}>
                    {SCOPE_OPTIONS.map((scope) => (
                      <label key={scope.value} className={styles.scopeOption}>
                        <input
                          type="checkbox"
                          checked={mintScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                        />
                        <code className={styles.scopeCode} dir="ltr">{scope.value}</code>
                        <span className={styles.scopeHint}>
                          {tr(`settings.aiEditor.${scope.labelKey}`, scope.fallback)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="gp-mcp-token-expiry">
                    {tr('settings.aiEditor.expiryLabel', 'Expires after')}
                  </label>
                  <select
                    id="gp-mcp-token-expiry"
                    className={styles.formInput}
                    value={mintExpiryDays}
                    onChange={(e) => setMintExpiryDays(Number(e.target.value))}
                  >
                    {EXPIRY_OPTIONS_DAYS.map((days) => (
                      <option key={days} value={days}>
                        {days} {tr('settings.aiEditor.days', 'days')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setMintOpen(false)}
                  disabled={minting}
                >
                  {tr('common.cancel', 'Cancel')}
                </button>
                <button type="submit" className={styles.primaryButton} disabled={minting}>
                  {minting ? <Loader2 size={14} className={styles.spinning} /> : <Plus size={14} />}
                  {tr('settings.aiEditor.create', 'Create token')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Show-once modal - deliberately no overlay-click close so the token
          is not lost by accident; it is only dismissed via the Done button */}
      {mintedToken && createPortal(
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {tr('settings.aiEditor.tokenReadyTitle', 'Token created')}
              </h2>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.showOnceWarning}>
                <AlertTriangle size={16} />
                <span>
                  {tr(
                    'settings.aiEditor.showOnceWarning',
                    'Copy this token now - it is stored hashed and you will not see it again.',
                  )}
                </span>
              </div>
              <div className={styles.formGroup}>
                <span className={styles.formLabel}>
                  {tr('settings.aiEditor.tokenLabel', 'MCP token')}
                </span>
                {renderCodeBlock(mintedToken, 'token')}
              </div>
              <div className={styles.formGroup}>
                <span className={styles.formLabel}>
                  {tr('settings.aiEditor.configLabel', 'MCP config (Cursor / Claude Code)')}
                </span>
                {renderCodeBlock(buildConfigSnippet(mintedToken), 'config')}
                <p className={styles.fieldNote}>
                  {tr(
                    'settings.aiEditor.configHint',
                    "Paste into your editor's MCP config, e.g. .cursor/mcp.json or Claude Code's MCP settings.",
                  )}
                </p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setMintedToken(null)}
              >
                <Check size={14} />
                {tr('settings.aiEditor.done', 'Done')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
