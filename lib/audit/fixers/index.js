/**
 * Fixer Handler Registry
 *
 * Maps the `handler` strings from fix-registry.js to the actual handler
 * modules under this directory. The dispatcher (app/api/audit/fix/route.js)
 * looks up handlers by name; each module exports `preview` and (when the
 * fix is appliable via the WP plugin) `apply`.
 *
 * Handler interface:
 *   preview({ site, payload, wpAuto }) → Promise<{
 *     suggestions?: any[],         // WP-auto path: AI-generated suggested fixes
 *     manualOutputs?: ManualOutput[], // non-WP path: ready-to-copy outputs
 *     usage?: { inputTokens, outputTokens, totalTokens }, // for telemetry
 *   }>
 *
 *   apply({ site, payload, audit, wpAuto }) → Promise<{
 *     results: [{ url, ..., pushed: boolean, pushError?: string, skipped?: boolean }],
 *     auditUpdated: boolean,
 *   }>
 *
 * Adding a new handler:
 *   1. Create lib/audit/fixers/<name>.js exporting `preview` and (optionally) `apply`.
 *   2. Add it to HANDLERS below.
 *   3. Add the registry entry in fix-registry.js pointing `handler: '<name>'`.
 *
 * Handlers MUST NOT charge credits — that's the dispatcher's job. They MAY
 * throw, in which case the dispatcher classifies third-party errors and
 * returns the user-facing apology.
 */

import * as title from './title';
import * as description from './description';
import * as og from './og';
import * as alt from './alt';
import * as imageFormat from './imageFormat';
import * as brokenLink from './brokenLink';
import * as heading from './heading';
import * as structuredData from './structuredData';
import * as favicon from './favicon';
import * as noindex from './noindex';
import * as viewport from './viewport';
import * as charset from './charset';
import * as canonical from './canonical';
import * as lazyImages from './lazyImages';
import * as langAttribute from './langAttribute';
import * as securityHeaders from './securityHeaders';

const HANDLERS = {
  title,
  description,
  og,
  alt,
  imageFormat,
  brokenLink,
  heading,
  structuredData,
  favicon,
  noindex,
  viewport,
  charset,
  canonical,
  lazyImages,
  langAttribute,
  securityHeaders,
};

export function getHandler(name) {
  return HANDLERS[name] || null;
}

export function listHandlers() {
  return Object.keys(HANDLERS);
}
