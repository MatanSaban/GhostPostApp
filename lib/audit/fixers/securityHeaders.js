/**
 * Security Headers Fix Handler
 *
 * Issues handled (one handler, six issues — they all flip the same plugin
 * endpoint or paste the same kind of server config):
 *   - audit.issues.noHsts
 *   - audit.issues.noXFrameOptions
 *   - audit.issues.noContentTypeOptions
 *   - audit.issues.noCsp
 *   - audit.issues.noReferrerPolicy
 *   - audit.issues.noPermissionsPolicy
 *
 * WP-auto apply:
 *   - Calls enableSecurityHeaders(site, { headerKey: true, ... }) per the
 *     issues being fixed. Plugin sets sensible defaults and writes them via
 *     PHP `header()` calls.
 *
 * Manual:
 *   - Returns BOTH an Apache (`htaccess`) and an Nginx (`nginx`) snippet so
 *     the user can pick based on their stack, plus an `instructions` block
 *     covering Cloudflare/Vercel/Netlify and CSP caveats.
 */

import { enableSecurityHeaders } from '@/lib/wp-api-client';
import { htaccess as htaccessOutput, nginx as nginxOutput, instructions as instructionsOutput } from '@/lib/audit/fix-manual-output';
import { updateAuditWithRetry } from './_shared';

// Maps audit issue key → HTTP header name (the plugin uses lowercase names).
const HEADER_ISSUE_MAP = {
  'audit.issues.noHsts': 'strict-transport-security',
  'audit.issues.noXFrameOptions': 'x-frame-options',
  'audit.issues.noContentTypeOptions': 'x-content-type-options',
  'audit.issues.noCsp': 'content-security-policy',
  'audit.issues.noReferrerPolicy': 'referrer-policy',
  'audit.issues.noPermissionsPolicy': 'permissions-policy',
};

const PASSED_ISSUE_MAP = {
  'audit.issues.noHsts': 'audit.issues.hstsEnabled',
  'audit.issues.noXFrameOptions': 'audit.issues.xFrameOptionsSet',
  'audit.issues.noContentTypeOptions': 'audit.issues.contentTypeOptionsSet',
  'audit.issues.noCsp': 'audit.issues.cspSet',
  'audit.issues.noReferrerPolicy': 'audit.issues.referrerPolicySet',
  'audit.issues.noPermissionsPolicy': 'audit.issues.permissionsPolicySet',
};

// Recommended values for the manual paths (kept in sync with the plugin's defaults).
const HEADER_VALUES = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; frame-ancestors 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

const HEADER_DESCRIPTIONS = {
  'strict-transport-security': 'Tells browsers to ALWAYS use HTTPS for your domain (defends against SSL-strip attacks).',
  'x-frame-options': 'Prevents your site from being embedded in iframes on other sites (clickjacking defense).',
  'x-content-type-options': 'Stops browsers from MIME-sniffing responses, blocking a class of XSS via `Content-Type` confusion.',
  'content-security-policy': 'Whitelists which scripts/styles/images can run — the single most powerful XSS mitigation. Tune the policy carefully; the default below is permissive enough not to break most sites but tightening it is a strong improvement.',
  'referrer-policy': 'Limits how much URL info is leaked to third-party sites when users click outbound links.',
  'permissions-policy': 'Restricts which browser features (camera, microphone, geolocation, etc.) your site is allowed to use.',
};

function headersForIssues(issueKeys) {
  const out = {};
  for (const k of issueKeys) {
    const h = HEADER_ISSUE_MAP[k];
    if (h) out[h] = true;
  }
  return out;
}

export async function preview({ payload = {}, wpAuto }) {
  const { issueType } = payload;
  const headerKey = HEADER_ISSUE_MAP[issueType];
  if (!headerKey) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  if (wpAuto) {
    return {
      suggestions: [{ headerKey, issueType }],
      usage: null,
    };
  }

  const value = HEADER_VALUES[headerKey];
  const desc = HEADER_DESCRIPTIONS[headerKey];

  const apacheLine = `Header always set ${displayHeaderName(headerKey)} "${value}"`;
  const nginxLine = `add_header ${displayHeaderName(headerKey)} "${value}" always;`;

  return {
    manualOutputs: [
      htaccessOutput({
        title: `Apache: enable ${displayHeaderName(headerKey)}`,
        why: desc,
        instructions: 'Open your `.htaccess` file at the document root and add this line. Requires `mod_headers` (enabled on virtually every shared host).',
        code: apacheLine,
        where: 'in your site\'s `.htaccess`',
      }),
      nginxOutput({
        title: `Nginx: enable ${displayHeaderName(headerKey)}`,
        why: desc,
        instructions: 'Add this inside the `server { ... }` block in your Nginx config (often `/etc/nginx/sites-available/<site>.conf`), then reload with `nginx -s reload`.',
        code: nginxLine,
        where: 'inside the server { ... } block',
      }),
      instructionsOutput({
        title: `${displayHeaderName(headerKey)}: other platforms`,
        why: 'Most managed hosts let you set headers without touching server config.',
        instructions: [
          `**Cloudflare**: Rules → Transform Rules → Modify Response Header. Add **${displayHeaderName(headerKey)}** with value \`${value}\`.`,
          `**Vercel**: add to \`vercel.json\` →`,
          '```json',
          JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: displayHeaderName(headerKey), value }] }] }, null, 2),
          '```',
          `**Netlify**: add to \`_headers\` →`,
          '```',
          `/*\n  ${displayHeaderName(headerKey)}: ${value}`,
          '```',
          '',
          headerKey === 'content-security-policy'
            ? '⚠️ **CSP caveat**: the policy above is intentionally permissive (`unsafe-inline`, `unsafe-eval`) so it doesn\'t break common WordPress / analytics setups. To tighten it, drop the `unsafe-*` keywords and add explicit hashes / nonces for your inline scripts.'
            : null,
        ].filter(Boolean).join('\n'),
      }),
    ],
    usage: null,
  };
}

function displayHeaderName(lower) {
  // Convert 'strict-transport-security' → 'Strict-Transport-Security'
  return lower.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');
}

export async function apply({ site, payload = {}, audit }) {
  const issueTypes = Array.isArray(payload.issueTypes) && payload.issueTypes.length
    ? payload.issueTypes
    : (payload.issueType ? [payload.issueType] : []);

  if (issueTypes.length === 0) {
    return {
      results: [{ pushed: false, pushError: 'apply requires payload.issueType or payload.issueTypes' }],
      auditUpdated: false,
    };
  }

  const headersObj = headersForIssues(issueTypes);
  if (Object.keys(headersObj).length === 0) {
    return {
      results: [{ pushed: false, pushError: 'No valid security-header issue types in payload' }],
      auditUpdated: false,
    };
  }

  let pluginResult = null;
  try {
    pluginResult = await enableSecurityHeaders(site, headersObj);
  } catch (e) {
    const is404 = e.message?.includes('rest_no_route') || e.message?.includes('(404)');
    if (is404) {
      return {
        results: [{ pushed: false, pushError: 'Plugin update required (security-headers endpoint missing)' }],
        auditUpdated: false,
      };
    }
    return {
      results: issueTypes.map((it) => ({ issueType: it, pushed: false, pushError: e.message })),
      auditUpdated: false,
    };
  }

  const success = !!pluginResult?.success;
  const results = issueTypes.map((it) => ({
    issueType: it,
    headerKey: HEADER_ISSUE_MAP[it],
    pushed: success,
    pushError: success ? null : (pluginResult?.error || 'Plugin reported failure'),
  }));

  const auditUpdated = (success && audit?.id)
    ? await updateAuditWithRetry(audit.id, (a) => {
        const targeted = new Set(issueTypes);
        const updatedIssues = (a.issues || []).map((issue) => {
          if (!targeted.has(issue.message)) return issue;
          return {
            ...issue, severity: 'passed',
            message: PASSED_ISSUE_MAP[issue.message] || issue.message,
            suggestion: null, details: 'Fixed via Ghost Post plugin',
          };
        });
        return { issues: updatedIssues };
      }, { invalidateSiteId: site.id, fields: ['issues'] })
    : false;

  return { results, auditUpdated };
}
