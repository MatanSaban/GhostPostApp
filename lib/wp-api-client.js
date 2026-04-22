/**
 * Legacy shim — the implementation moved to lib/cms/adapters/wordpress.js
 * as part of the platform-agnostic CMS adapter layer.
 *
 * New code should import from '@/lib/cms' and use the `cms` dispatcher:
 *
 *     import { cms } from '@/lib/cms';
 *     await cms.getSiteInfo(site);
 *
 * This shim exists so existing imports keep working during the migration.
 */

export * from './cms/adapters/wordpress';
