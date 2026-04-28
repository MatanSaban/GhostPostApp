/**
 * Lazy-loading Images Fix Handler
 *
 * Issue handled: audit.issues.imagesNotLazy
 *
 * Theme/template change. Modern WordPress (≥5.5) adds `loading="lazy"`
 * automatically - if it's missing, the theme is probably overriding image
 * markup or using PHP that bypasses `wp_get_attachment_image()`.
 *
 * Apply is a no-op; we surface a snippet + practical instructions.
 */

import { snippet as snippetOutput, instructions as instructionsOutput } from '@/lib/audit/fix-manual-output';

export async function preview({ payload: _payload = {}, wpAuto: _wpAuto }) {
  return {
    manualOutputs: [
      snippetOutput({
        title: 'Add `loading="lazy"` to off-screen images',
        why: 'Lazy loading defers image downloads until the user scrolls near them - this dramatically improves initial page load (especially on long pages) and is a free Core Web Vitals win.',
        instructions: 'Add `loading="lazy"` to every `<img>` and `<iframe>` tag that\'s **below the fold**. Important: do NOT add it to images above the fold (especially the hero / LCP image) - lazy-loading the LCP element makes performance worse.',
        language: 'html',
        code: '<img src="/path/to/image.jpg" alt="..." loading="lazy" />',
        where: 'in your theme templates / page HTML',
      }),
      instructionsOutput({
        title: 'WordPress: investigate why auto-lazy is off',
        why: 'WordPress 5.5+ adds `loading="lazy"` automatically to images rendered via `the_content()` or `wp_get_attachment_image()`. If the audit flagged this, something is bypassing that.',
        instructions: '**Common causes:**\n\n1. **Outdated theme** rendering raw `<img>` tags. Update the theme or replace its image markup with `wp_get_attachment_image($id, $size, false, $attr)`.\n2. **Page builder** (Elementor/WPBakery) with lazy-load disabled - check the builder\'s performance settings.\n3. **A plugin** that strips the attribute (e.g. some "image optimizer" plugins). Disable plugins one-by-one to isolate.\n4. **Custom hooks** - search your theme for `wp_lazy_loading_enabled` or `wp_img_tag_add_loading_attr` filters that may be returning false.\n\nAfter fixing the root cause, re-run the audit.',
      }),
    ],
    usage: null,
  };
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Lazy-loading is a theme/template change - see the instructions for root-cause investigation.',
    })),
    auditUpdated: false,
  };
}
