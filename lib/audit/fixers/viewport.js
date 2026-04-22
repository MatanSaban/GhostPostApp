/**
 * Viewport Meta Fix Handler
 *
 * Issues handled:
 *   - audit.issues.noViewportMeta     (no <meta name="viewport"> at all)
 *   - audit.issues.viewportMetaWeak   (present but missing width=device-width / initial-scale)
 *
 * No AI, no plugin endpoint — viewport meta is a theme template change.
 * Returns a snippet for the user to paste into the theme `<head>`. `apply`
 * is a no-op that records the limitation.
 */

import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';

const VIEWPORT_TAG = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';

export async function preview({ payload = {}, wpAuto: _wpAuto }) {
  const { issueType } = payload;
  const isWeak = issueType === 'audit.issues.viewportMetaWeak';

  return {
    manualOutputs: [snippetOutput({
      title: isWeak ? 'Replace your weak viewport meta' : 'Add a viewport meta tag',
      why: 'The viewport meta tag tells mobile browsers to render at the device\'s actual width instead of zooming out a desktop layout. Without it, your site looks broken on phones — and Google\'s mobile-first indexing penalises pages that aren\'t mobile-friendly.',
      instructions: `${isWeak
        ? 'Find the existing `<meta name="viewport">` tag in your theme\'s `<head>` and replace it with the line below.'
        : 'Add this line inside the `<head>` of your theme template (in WordPress that\'s usually `header.php`).'} Do NOT use \`maximum-scale\` or \`user-scalable=no\` — those break accessibility.`,
      language: 'html',
      code: VIEWPORT_TAG,
      where: 'inside <head>',
    })],
    usage: null,
  };
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Viewport meta is a theme template change — paste the snippet into your theme\'s <head>.',
    })),
    auditUpdated: false,
  };
}
