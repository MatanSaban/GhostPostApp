# GitHub Copilot Instructions for gp-platform

## Meta Instruction
**IMPORTANT**: When the user tells you to always do something for this project, add that instruction to this file (`.github/copilot-instructions.md`) so it's preserved for future sessions.

## WordPress Plugin Version Management

**CRITICAL**: Every time you modify **any** plugin code - whether in `gp-wordpress-plugin/ghost-post-connector/` OR in `gp-platform/app/api/sites/[id]/download-plugin/plugin-templates/` - you **MUST** also:
1. Increment `PLUGIN_VERSION` in `app/api/plugin/version.js` by `0.0.1` (e.g. `2.3.1` → `2.3.2`)
2. Add a changelog entry to `PLUGIN_CHANGELOG` in the same file describing the change
3. Remind the user to run `node scripts/sync-plugin-version.mjs` after deployment

**Do this in the SAME edit session as the plugin code change - never defer it.**

The plugin is generated from **template JS files** in `plugin-templates/`, NOT from the source PHP files. See `/memories/repo/wp-plugin-architecture.md` for details. Without a version bump, changes will never reach WordPress installations.

## Page Metadata

**All page metadata flows through `lib/seo/metadata.js`.** Never hand-write `export const metadata = {...}` in a page or layout — add an entry to `pageRegistry` (keyed by Next.js route pattern, e.g. `/dashboard/strategy/[slug]`) and add `meta.*` translation keys to `i18n/dictionaries/en.json` + `i18n/dictionaries/he.json`.

### How it's wired

- **Root layout** (`app/layout.jsx`) calls `buildRootMetadata({ locale })` from `generateMetadata` — this provides `metadataBase`, the `%s | Ghost Post` title template, default openGraph/twitter, robots `noindex` (private SaaS), icons, and theme color.
- **Server pages and layouts**: one-liner — `export const generateMetadata = createGenerateMetadata('<route pattern>');`. The factory reads the `ghost-post-locale` cookie and looks up the registry entry. Use `buildMetadata(...)` directly only when you need to pass dynamic overrides.
- **Client pages** (`'use client'`): they CANNOT export metadata. The `<PageMeta />` client component is mounted once in each client layout (`app/dashboard/layout.jsx`, `app/admin/layout.jsx`, `app/auth/layout.jsx`). It reads `usePathname()` and `useLocale()`, looks up the matching entry in `pageRegistry`, and updates `document.title`, the description meta tag, robots tag, and og:title / og:description on every navigation and locale change. **Do not add `<PageMeta />` to individual pages — it lives in the layout.**
- **Dynamic titles on client pages** (e.g. an entity name, a blog post title): call `useDynamicPageMeta(dynamicTitle, dynamicDescription?)` from `@/app/components/PageMeta` inside the page. It writes to an external store that the layout-mounted `<PageMeta />` subscribes to, so the dynamic title wins over the registry-derived one. Example: `useDynamicPageMeta(displayName)` in [app/dashboard/entities/[type]/page.jsx](../app/dashboard/entities/[type]/page.jsx).

### Adding a new page

1. Create the `page.jsx` (server or client).
2. Add an entry to `pageRegistry` in `lib/seo/metadata.js`:
   ```js
   '/dashboard/my-new-page': { titleKey: 'meta.dashboard.myNewPage.title', descriptionKey: 'meta.dashboard.myNewPage.description' },
   ```
3. Add the strings under `meta.*` in `en.json` AND `he.json`.
4. If the page should be indexed by search engines (rare — defaults are noindex), add `robots: 'index'` to the registry entry.
5. For server pages, also export `generateMetadata` calling `buildMetadata({ pageKey, locale })`. For client pages, the layout-level `<PageMeta />` handles it automatically.

### Site-wide defaults

Edit `siteConfig` in `lib/seo/metadata.js` to change the brand name, default OG image, theme color, title template, or canonical origin. The origin resolves from `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → fallback.

## AI Service Guidelines

### Always Use Vercel AI SDK
- All AI operations must use the **Vercel AI SDK** (`ai` package)
- Never use direct API calls to OpenAI, Anthropic, or Google AI
- Import AI functionality from `@/lib/ai/gemini.js` or the central index

### Centralized AI Configuration
The AI model configuration is centralized in `lib/ai/gemini.js`:

```javascript
// Model configurations - Change these to update AI models across the entire platform
// IMAGE uses Nano Banana 2 (gemini-3.1-flash-image-preview) - the latest Gemini native image model
export const MODELS = {
  TEXT: 'gemini-2.0-flash',
  IMAGE: 'gemini-3.1-flash-image-preview',  // Nano Banana 2 - ALWAYS use the latest version
};
```

### AI Service Functions
Use these functions from `@/lib/ai/gemini.js`:
- `generateTextResponse()` - For simple text generation
- `streamTextResponse()` - For streaming responses
- `generateStructuredResponse()` - For structured/JSON output with Zod schemas
- `getTextModel()` - Get the configured Gemini model instance

### Environment Variables
Required for AI:
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI API key for Gemini

### Example Usage
```javascript
import { generateTextResponse, generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

// Text generation
const response = await generateTextResponse({
  system: 'You are a helpful assistant.',
  prompt: 'Hello!',
  temperature: 0.7,
});

// Structured output
const data = await generateStructuredResponse({
  system: 'Extract information.',
  prompt: 'Some text to analyze',
  schema: z.object({
    name: z.string(),
    items: z.array(z.string()),
  }),
});
```
