# GhostSEO - Chat System

The GhostSEO chat system is an AI-powered SEO assistant that can analyze WordPress sites, provide recommendations, and **execute changes directly on WordPress** - with user approval. It uses Google Gemini models via Vertex AI, the Vercel AI SDK v6 for streaming, and an approval-gated action system that snapshots before writes and supports full rollback.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (ghost-chat-popup.jsx)                                │
│  React component with useChat hook (AI SDK v6)                  │
│  3-column layout: conversations | chat | quick actions          │
│  Action cards with approve/reject/rollback + polling            │
└─────────────────────┬───────────────────────────────────────────┘
                      │ POST /api/chat (streaming)
                      │ GET/POST /api/chat/conversations/...
                      │ GET/POST /api/chat/actions/...
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Next.js App Router)                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  route.js - Main chat handler                           │    │
│  │  • Smart model routing (Flash for greetings, Pro for SEO)│   │
│  │  • Dynamic system prompt with site context               │   │
│  │  • 20+ tools: read-only execute inline, writes →        │   │
│  │    propose_action (dynamic tool) → approval flow         │   │
│  │  • streamText with stopWhen: stepCountIs(5),            │   │
│  │    hasToolCall('propose_action')                         │   │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │ chat-tools.js │  │ approval-    │  │ action-executor.js│    │
│  │ Tool schemas  │  │ manager.js   │  │ Snapshot + exec   │    │
│  │ + categories  │  │ 5min expiry  │  │ + rollback data   │    │
│  └───────────────┘  └──────────────┘  └───────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ action-rollback.js - Reverses all changes in REVERSE    │   │
│  │ order, restoring snapshots via wp-api-client             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HMAC-SHA256 signed requests
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  WordPress Plugin (ghost-post/v1 REST API)                      │
│  50+ endpoints - content, media, SEO, redirects, code snippets  │
│  See: WORDPRESS_PLUGIN_SYSTEM.md                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Technologies:**
- **AI Models:** Google Gemini 2.5 Flash (routing + simple messages) and Gemini 2.5 Pro (SEO/analysis/actions) via Vertex AI
- **AI SDK:** Vercel AI SDK v6 - `streamText`, `generateText`, `tool`, `jsonSchema`, `stepCountIs`, `hasToolCall` from `'ai'`
- **Frontend:** `useChat` hook from `@ai-sdk/react` with UIMessage format (parts array)
- **Database:** MongoDB via Prisma - `ChatConversation`, `ChatMessage`, `ChatAction` models
- **Platform:** Next.js App Router, deployed at `app.ghostseo.ai`

---

## 2. AI Models & Routing

### Model Configuration (`lib/ai/gemini.js`)

```javascript
MODELS = {
  TEXT: 'gemini-2.5-pro',
  FLASH: 'gemini-2.5-flash',
  IMAGE: 'gemini-2.5-pro',
  PRO_PREVIEW: 'gemini-2.5-pro',
}

getTextModel()  → vertex(MODELS.TEXT)   // For SEO analysis, actions, complex queries
getFlashModel() → vertex(MODELS.FLASH)  // For routing + simple messages
```

Uses `vertex` provider from `./vertex-provider.js` (Google Cloud Vertex AI).

### Smart Model Routing (`routeToModel(message)`)

Before processing each message, a **fast classifier** determines which model to use:

```javascript
const result = await generateText({
  model: getFlashModel(),
  maxTokens: 10,
  temperature: 0,
  system: `Classify this message. Reply ONLY "flash" or "pro".
    flash = greetings, thank you, yes/no, small talk, farewells
    pro = SEO questions, analysis, actions, technical questions, anything needing expertise`,
  prompt: message,
});
// Returns "flash" or "pro" (defaults to "pro" on error)
```

- **Flash model** (Gemini 2.5 Flash): Handles greetings, acknowledgments, small talk - no tools provided
- **Pro model** (Gemini 2.5 Pro): Handles SEO analysis, content optimization, write actions - full tool suite

---

## 3. System Prompt (`buildSystemPrompt`)

The system prompt is **dynamically built per-request** using site context from WordPress:

### Base Identity

The `BASE_SYSTEM_PROMPT` constant establishes the AI as a **GhostSEO AI Assistant - expert SEO advisor** with these behavioral rules:

- **Male identity** (for grammatically gendered languages like Hebrew)
- Must be concise, actionable, data-driven
- Formatting rules: bold, bullets, numbered lists, headings, code blocks, blockquotes
- **Critical tool behavior:**
  - Never say "I'll check" without actually calling a tool
  - Never write text describing a tool call (stripped by `stripToolCallText`)
  - Never ask "should I do X?" when data is available - just call the tool
  - Use `analyze_page` for page content, `wp_get_seo_data` for SEO data, `get_keywords` for rankings
- **Write tool rules:**
  - Must use `propose_action` for any write operation
  - After calling `propose_action`, STOP - user sees approve/reject buttons
  - Never execute write tools directly
- **Page builder awareness:**
  - Elementor uses `_elementor_data` JSON, not `post_content`
  - Use `add_h1` / `old_h1` + `new_h1` fields for H1 heading operations
- **Link rules:** Always include clickable WordPress admin links when referencing dashboard pages

### Dynamic Context Injection

```javascript
function buildSystemPrompt(site, siteInfo) {
  let prompt = BASE_SYSTEM_PROMPT;

  // Site context
  prompt += `\n\nSite: "${site.name}" (${site.url}), Platform: ${site.platform}`;

  // WordPress details (if siteInfo available)
  if (siteInfo) {
    prompt += `\nLocale: ${siteInfo.locale}, WP: ${siteInfo.wpVersion}`;
    prompt += `\nTheme: ${siteInfo.theme?.name}`;
    prompt += `\nActive Plugins: ${siteInfo.activePlugins?.map(p => p.name).join(', ')}`;

    // Detected capabilities
    const capabilities = [];
    if (siteInfo.hasYoast) capabilities.push(`Yoast SEO ${siteInfo.yoastVersion}`);
    if (siteInfo.hasRankMath) capabilities.push(`Rank Math ${siteInfo.rankMathVersion}`);
    if (siteInfo.hasACF) capabilities.push(`ACF ${siteInfo.acfVersion}`);
    if (siteInfo.hasElementor) capabilities.push('Elementor');
    if (siteInfo.hasWooCommerce) capabilities.push('WooCommerce');
    prompt += `\nCapabilities: ${capabilities.join(', ')}`;

    // SEO plugin
    prompt += `\nSEO Plugin: ${siteInfo.hasYoast ? 'Yoast' : siteInfo.hasRankMath ? 'RankMath' : 'None'}`;

    // Post types
    prompt += `\nPost Types: ${siteInfo.postTypes?.map(pt => pt.slug).join(', ')}`;
  }

  // Dashboard page links
  prompt += `\n\nDashboard Links:`;
  prompt += `\n- Site Audit: /dashboard/site-audit?siteId=${site.id}`;
  prompt += `\n- AI Agent: /dashboard/agent?siteId=${site.id}`;
  prompt += `\n- Keywords: /dashboard/strategy/keywords?siteId=${site.id}`;
  prompt += `\n- Content Entities: /dashboard/entities?siteId=${site.id}`;
  prompt += `\n- Competitors: /dashboard/strategy/competitors?siteId=${site.id}`;
  prompt += `\n- Content Planner: /dashboard/strategy/content-planner?siteId=${site.id}`;
  prompt += `\n- Technical SEO: /dashboard/technical-seo?siteId=${site.id}`;
  prompt += `\n- Backlinks: /dashboard/backlinks?siteId=${site.id}`;

  return prompt;
}
```

---

## 4. Tool Definitions (`lib/chat/chat-tools.js`)

### Constants

```javascript
const TOOL_CATEGORIES = {
  WORDPRESS: 'wordpress',
  PLATFORM: 'platform',
  ANALYSIS: 'analysis'
};

const APPROVAL_REQUIRED_TOOLS = new Set([
  'wp_update_post',
  'wp_update_seo',
  'wp_create_redirect',
  'wp_update_acf',
  'wp_add_code_snippet',
  'wp_bulk_update_posts',
  'wp_delete_redirect',
  'wp_upload_media',
  'wp_update_media',
  'wp_search_replace_links',
  'run_site_audit',
  'run_agent_scan',
]);
```

### Analysis Tools (Always Available)

| Tool | Description | Parameters |
|------|-------------|------------|
| `analyze_page` | Analyze a page's content, headings, images, links, SEO meta | `url?: string` |
| `get_site_audit_results` | Get latest site audit score, issues, recommendations | `device?: 'desktop'\|'mobile'` |
| `get_agent_insights` | Get AI agent SEO insights by category/status | `category?: enum`, `status?: enum`, `limit?: number` |
| `get_keywords` | Get tracked keyword rankings and metrics | `query?: string`, `limit?: number`, `sortBy?: enum` |
| `get_content_entities` | Get indexed content entities (pages, posts) | `type?: string`, `query?: string`, `limit?: number` |
| `get_competitors` | Get monitored competitors | `limit?: number` |

### Platform Tools (Always Available, Approval Required)

| Tool | Description | Parameters |
|------|-------------|------------|
| `run_site_audit` | Run a new site audit (desktop + mobile) | `maxPages?: number` |
| `run_agent_scan` | Run AI agent SEO scan | (none) |

### WordPress Tools (Only When `isWordPress === true`)

#### Read-Only (No Approval)

| Tool | Description | Parameters |
|------|-------------|------------|
| `wp_get_site_info` | Get WordPress site info, theme, plugins | (none) |
| `wp_get_post` | Get a post/page by ID or URL | `postId?: string`, `url?: string`, `postType?: 'posts'\|'pages'` |
| `wp_search_posts` | Search posts by title/content | `query` (required), `postType?: 'posts'\|'pages'`, `limit?: number` |
| `wp_get_seo_data` | Get SEO metadata for a post | `postId` (required) |
| `wp_get_redirects` | List all redirects | (none) |
| `wp_get_menus` | Get navigation menus | (none) |
| `wp_get_media` | List media items | `limit?: number` |
| `wp_get_taxonomies` | List registered taxonomies | (none) |

#### Write (Approval Required)

| Tool | Description | Parameters |
|------|-------------|------------|
| `wp_update_post` | Update post/page content, title, slug, H1 | `postId` (required), `postType?`, `data`: `{ title, content, slug, status, excerpt, add_h1, old_h1, new_h1 }` |
| `wp_update_seo` | Update SEO meta (title, desc, keywords) | `postId` (required), `seoData`: `{ title, description, focusKeyword, canonical, robots: { noindex, nofollow } }` |
| `wp_update_acf` | Update Advanced Custom Fields | `postId` (required), `fields` (required) |
| `wp_create_redirect` | Create a URL redirect | `sourceUrl` (required), `targetUrl` (required), `type?: '301'\|'302'` |
| `wp_delete_redirect` | Delete a redirect | `redirectId` (required) |
| `wp_add_code_snippet` | Add a code snippet | `title` (required), `code` (required), `type`: `'php'\|'js'\|'css'`, `scope?: 'global'\|'admin'\|'frontend'`, `description?` |
| `wp_bulk_update_posts` | Update multiple posts at once | `updates`: array of `{ postId, postType?, data, description }` |
| `wp_search_replace_links` | Search & replace URLs across content | `oldUrl` (required), `newUrl` (required) |
| `wp_upload_media` | Upload media from URL | `url` (required), `title?`, `alt?` |
| `wp_update_media` | Update media metadata | `mediaId` (required), `data` (required) |

### `propose_action` - Dynamic Tool (Added in `route.js`)

This tool is **not defined in `chat-tools.js`** - it is dynamically injected into the tool set in `route.js` for every Pro model request. It serves as the **gateway for all write operations**.

```javascript
// Schema:
propose_action: {
  title: string,           // Human-readable action title
  description: string,     // Markdown description of what will be done
  actionType: enum ['WORDPRESS_UPDATE', 'CODE_SNIPPET', 'PLATFORM_ACTION', 'MULTI_STEP'],
  actions: [{
    tool: string,          // The actual write tool to execute (e.g., 'wp_update_post')
    args: object,          // Arguments for that tool
    description: string    // Human-readable step description
  }]
}
```

When the AI calls `propose_action`:
1. `createActionProposal()` creates a `ChatAction` record with `PENDING_APPROVAL` status
2. Returns `{ actionId, status: 'PENDING_APPROVAL', message, expiresInSeconds: 300 }`
3. `stopWhen: hasToolCall('propose_action')` halts the stream - user sees the action card

### Exports

```javascript
export { TOOL_CATEGORIES, APPROVAL_REQUIRED_TOOLS, getChatTools, toolRequiresApproval, getToolCategory }
```

- `toolRequiresApproval(toolName)` → `APPROVAL_REQUIRED_TOOLS.has(toolName)`
- `getToolCategory(toolName)` → `wp_*` → WORDPRESS, `run_site_audit`/`run_agent_scan` → PLATFORM, else → ANALYSIS

---

## 5. Main Chat Endpoint (`POST /api/chat`)

### Request

```json
{
  "conversationId": "abc123",
  "siteId": "def456",
  "messages": [/* AI SDK v6 UIMessage format */]
}
```

### Processing Flow

1. **Auth:** `getCurrentAccountMember()` - verifies user session
2. **Parse:** Extract `conversationId`, `siteId`, and last user message from UIMessages
3. **Load conversation** with site data (`id, name, url, platform, siteKey, siteSecret`)
4. **Access check:** Account member or superAdmin
5. **WordPress detection:** `isWordPress = platform === 'wordpress' && siteKey && siteSecret`
6. **Expiry check:** `checkPendingActions(conversationId)` - expires stale actions, sends warnings
7. **Save user message** to `ChatMessage` (role: `USER`)
8. **Load history:** Last 50 messages from DB, mapped to `{ role, content }` format. Tool call text stripped from assistant messages via `stripToolCallText()`
9. **Fetch site info:** If WordPress, call `wpApi.getSiteInfo(site)` (non-fatal)
10. **Build system prompt:** `buildSystemPrompt(site, siteInfo)`
11. **Route model:** `routeToModel(lastUserMessage)` → `'flash'` or `'pro'`
12. **Get tools:** If Pro, `getChatTools({ isWordPress })` + dynamically add `propose_action`
13. **Build tool handlers:**
    - `propose_action` → `createActionProposal()` → returns `{ actionId, status, message, expiresInSeconds }`
    - Read-only tools → `executeReadOnlyTool()` → returns JSON result
    - Write tools (if called directly) → returns error message telling AI to use `propose_action`
14. **Convert tools** to AI SDK `tool()` format with `description`, `inputSchema`, `execute`
15. **Stream:**
    ```javascript
    const result = streamText({
      model: selectedModel,         // getTextModel() or getFlashModel()
      system: systemPrompt,
      messages: aiMessages,
      tools: toolDefinitions,       // undefined for Flash
      stopWhen: [
        stepCountIs(5),             // Max 5 tool-calling steps
        hasToolCall('propose_action') // Stop immediately on action proposal
      ],
      maxTokens: 4096,
      temperature: 0.7,
      onFinish: async ({ steps }) => {
        // Collect text from ALL steps
        const fullText = steps.map(s => s.text).filter(Boolean).join('\n');
        const cleanText = stripToolCallText(fullText);
        // Save assistant response to DB
        // Update conversation updatedAt
        // Log + track AI credits
      }
    });
    ```
16. **Return:** `result.toUIMessageStreamResponse()`

### `stripToolCallText(text)`

Removes tool call artifacts that may leak into text:
- `call: tool_name(...)` patterns
- ` ```tool ... ``` ` blocks
- Excessive newlines

### `getMessageText(msg)`

Extracts text from AI SDK v6 UIMessage format:
- Checks `msg.parts` array for parts with `type === 'text'`
- Falls back to `msg.content`

---

## 6. Action Lifecycle

### Status Flow

```
┌──────────────────┐
│ PENDING_APPROVAL │ ← AI calls propose_action, ChatAction created
│  (5 min expiry)  │
└────┬───┬───┬─────┘
     │   │   │
     │   │   └──── (timeout) ──→ EXPIRED
     │   │
     │   └──── (user rejects) ──→ REJECTED
     │
     └──── (user approves) ──→ APPROVED ──→ EXECUTING ──→ COMPLETED ──→ (user rollbacks) ──→ ROLLED_BACK
                                                     └──→ FAILED ──→ (user rollbacks) ──→ ROLLED_BACK
```

### Status Enum Values

| Status | Description |
|--------|-------------|
| `PENDING_APPROVAL` | Waiting for user to approve/reject (5-minute window) |
| `APPROVED` | User approved, about to execute |
| `EXECUTING` | Currently executing write operations on WordPress |
| `COMPLETED` | All actions executed successfully |
| `FAILED` | One or more actions failed during execution |
| `EXPIRED` | User didn't respond within 5 minutes |
| `REJECTED` | User rejected the proposed actions |
| `ROLLED_BACK` | User triggered rollback, changes reversed |

### Timing Constants

```javascript
APPROVAL_TIMEOUT_MS = 5 * 60 * 1000   // 5 minutes total
WARNING_TIMEOUT_MS  = 2 * 60 * 1000   // Warning sent at 2 minutes remaining
```

---

## 7. Approval Manager (`lib/chat/approval-manager.js`)

### `createActionProposal({ conversationId, siteId, accountId, userId, type, plan, actions })`

Creates a `ChatAction` record:
```javascript
{
  conversationId, siteId, accountId, userId,
  type,                                    // ChatActionType enum
  status: 'PENDING_APPROVAL',
  plan,                                    // { title, description }
  actions,                                 // [{ tool, args, description }]
  rollbackData: [],
  warningSent: false,
  warningAt: new Date(Date.now() + WARNING_TIMEOUT_MS),   // +2 min
  expiresAt: new Date(Date.now() + APPROVAL_TIMEOUT_MS),  // +5 min
}
```

### `approveAction(actionId, userId)`

1. Find action, validate status is `PENDING_APPROVAL`
2. Check if expired → update to `EXPIRED`, throw error
3. Update status → `APPROVED`, set `approvedAt = now`
4. Fire `executeChatAction(actionId)` **in background** (non-awaited, error-caught)
5. Return `{ status: 'APPROVED', message: 'Action approved and execution started' }`

### `rejectAction(actionId, userId)`

1. Find action, validate status is `PENDING_APPROVAL`
2. Update status → `REJECTED`, set `rejectedAt = now`
3. Save translated rejection message to conversation (fallback: `'❌ Action plan was rejected...'`)
4. Return `{ status: 'REJECTED' }`

### `checkPendingActions(conversationId)`

Called at the start of every chat request. For each `PENDING_APPROVAL` action:
- If `now >= expiresAt` → update to `EXPIRED`, save expiry message
- Else if `!warningSent && now >= warningAt` → set `warningSent: true`, save warning message with remaining minutes

### `getActionStatus(actionId)`

Returns full action data plus computed timing fields:
```javascript
{
  id, status, type, plan, result, error,
  expiresAt, warningAt, warningSent,
  approvedAt, rejectedAt, executedAt, rolledBackAt, createdAt,
  remainingMs: Math.max(0, expiresAt - Date.now()),
  remainingSeconds: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  isExpired: Date.now() >= expiresAt,
}
```

### i18n Messages

All status messages are translated via `getActionMessage(key, replacements)` which reads from `dict.chat.actionCard[key]` and replaces `{placeholder}` tokens. Supports English and Hebrew.

---

## 8. Action Executor (`lib/chat/action-executor.js`)

### Read-Only Execution (`executeReadOnlyTool`)

```javascript
executeReadOnlyTool(toolName, args, { site, siteId, accountId })
```

| Tool | Implementation |
|------|---------------|
| `analyze_page` | If WP → `resolveAndGetPost(site, url)` via `wpApi.resolveUrl` + `wpApi.getPost`. Fallback → `fetchAndAnalyzePage(url)` (HTTP fetch + HTML parse). Returns headings, images, links, word count, SEO meta |
| `get_site_audit_results` | Queries `prisma.siteAudit` (latest COMPLETED for device), returns score, categoryScores, summary, top 20 issues |
| `get_agent_insights` | Queries `prisma.agentInsight`, filters by category/status, take limit (default 10) |
| `get_keywords` | Queries `prisma.gscKeywordCache`, filters by query string, sorts by `sortBy`, limits (default 20) |
| `get_content_entities` | Queries `prisma.siteEntity`, filters by type/query, take limit (default 20) |
| `get_competitors` | Queries `prisma.competitor`, take limit (default 10) |
| `wp_get_site_info` | `wpApi.getSiteInfo(site)` |
| `wp_get_post` | If URL → `resolveAndGetPost`. Else `wpApi.getPost(site, postType, postId)` |
| `wp_search_posts` | `wpApi.getPosts(site, postType, 1, limit)`, client-side filter by query |
| `wp_get_seo_data` | `wpApi.getSeoData(site, postId)` |
| `wp_get_redirects` | `wpApi.getRedirects(site)` |
| `wp_get_menus` | `wpApi.getMenus(site)` |
| `wp_get_media` | `wpApi.getMedia(site, { perPage })` |
| `wp_get_taxonomies` | `wpApi.getTaxonomies(site)` |

### Write Execution (`executeWriteAction`)

Called by `executeChatAction` for each action in the plan. Every write operation follows a **snapshot → execute → record rollback** pattern:

```javascript
// Returns:
{
  success: boolean,
  result: any,
  rollback: {
    tool: string,
    args: object,
    originalValue: any,
    executedAt: Date
  }
}
```

| Tool | Snapshot (Before) | Execute | Rollback Data |
|------|-------------------|---------|---------------|
| `wp_update_post` | Get current title, content, slug, status, excerpt | `wpApi.updatePost(site, postType, postId, data)` | Original field values |
| `wp_update_seo` | Get current SEO data | `wpApi.updateSeoData(site, postId, seoData)` | Original SEO object |
| `wp_update_acf` | Get current ACF fields | `wpApi.updateAcfFields(site, postId, fields)` | Original ACF object |
| `wp_create_redirect` | `{ created: true }` | `wpApi.createRedirect(site, ...)` | `redirectId` for deletion |
| `wp_delete_redirect` | Find redirect in list | `wpApi.deleteRedirect(site, redirectId)` | Full redirect data for re-creation |
| `wp_add_code_snippet` | `{ created: true }` | `wpApi.makePluginRequest(site, '/code-snippets', 'POST', ...)` | `snippetId` for deletion |
| `wp_bulk_update_posts` | Per-post snapshots array | Loop `wpApi.updatePost` per item | Array of `{ postId, postType, original }` |
| `wp_search_replace_links` | `{ oldUrl, newUrl }` | `wpApi.searchReplaceLinks(site, oldUrl, newUrl)` | Swapped URLs for reversal |
| `wp_upload_media` | `{ created: true }` | `wpApi.uploadMediaFromUrl(site, url, ...)` | `mediaId` for deletion |
| `wp_update_media` | Get current media item | `wpApi.updateMedia(site, mediaId, data)` | Original media data |
| `run_site_audit` | `{ auditIds: [desktopId, mobileId] }` | Creates 2 `siteAudit` records, fires `runSiteAudit` for both (fire-and-forget) | Audit IDs |
| `run_agent_scan` | `{ runId }` | Creates `agentRun` record, fires `runSiteAnalysis` (fire-and-forget) | Run ID |

### `executeChatAction(chatActionId)`

Orchestrates the full execution of an approved action:

1. Load `ChatAction` with `conversation.site`
2. Validate status is `APPROVED`
3. Update status → `EXECUTING`
4. Loop all `chatAction.actions`, call `executeWriteAction` for each
5. Collect results and rollbackData arrays
6. **On success:** Update status → `COMPLETED`, set `executedAt`, `result`, `rollbackData`; save assistant message with execution summary
7. **On error:** Update status → `FAILED`, set `error`, partial `result` and `rollbackData`; save assistant error message

### HTML Page Analysis (`fetchAndAnalyzePage`)

For non-WordPress sites or as fallback:
- 15-second timeout, `GhostSEOBot/1.0` user agent
- `analyzeHtml(html, url)` extracts: title, metaDescription, canonical, robots, OG tags, headings (H1/H2/H3), images with alt status, internal/external links, word count, JSON-LD structured data, hreflang tags, viewport meta

---

## 9. Rollback System (`lib/chat/action-rollback.js`)

### `rollbackChatAction(chatActionId)`

1. Load `ChatAction` with `conversation.site`
2. Validate status is `COMPLETED` or `FAILED`
3. Validate `rollbackData` exists and is non-empty
4. **Rollback in REVERSE order** (last-executed action rolled back first)
5. For each rollback entry, call `rollbackSingleAction(rb, site)`
6. Update status → `ROLLED_BACK`, set `rolledBackAt`
7. Save summary message with per-step results
8. Return: `{ success: boolean, rolledBack: number, failed: number, details: Array }`

### Per-Tool Rollback

| Tool | Rollback Action |
|------|----------------|
| `wp_update_post` | Restore original title/content/slug/status/excerpt via `wpApi.updatePost` |
| `wp_update_seo` | Restore original SEO data via `wpApi.updateSeoData` |
| `wp_update_acf` | Restore original ACF fields via `wpApi.updateAcfFields` |
| `wp_create_redirect` | Delete the created redirect via `wpApi.deleteRedirect` |
| `wp_delete_redirect` | Re-create the deleted redirect via `wpApi.createRedirect` |
| `wp_add_code_snippet` | Delete snippet via `wpApi.makePluginRequest(site, '/code-snippets/${id}', 'DELETE')` |
| `wp_bulk_update_posts` | Loop each item, restore original via `wpApi.updatePost` |
| `wp_search_replace_links` | Reverse the replacement: `oldUrl` ↔ `newUrl` via `wpApi.searchReplaceLinks` |
| `wp_upload_media` | Delete uploaded media via `wpApi.deleteMedia` |
| `wp_update_media` | Restore original metadata via `wpApi.updateMedia` |
| `run_site_audit`, `run_agent_scan` | No-op (nothing to reverse) |

---

## 10. API Routes

### Main Chat

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/chat` | Main streaming chat endpoint (see Section 5) |

### Conversations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/chat/conversations?siteId=xxx` | List conversations for a site, ordered by `updatedAt desc`. Includes `createdByUser` (id, firstName, lastName, email, image), `_count.messages` |
| POST | `/api/chat/conversations` | Create conversation. Body: `{ siteId, title? }` |
| PATCH | `/api/chat/conversations/[id]` | Rename conversation. Body: `{ title }` |
| DELETE | `/api/chat/conversations/[id]` | Delete conversation (creator or account owner only) |

### Messages

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/chat/conversations/[id]/messages` | Get all messages ordered `createdAt asc`. Includes `user` (id, firstName, lastName, email, image) |

### Active Users (Concurrent Usage Detection)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/chat/conversations/[id]/active-users` | Registers current user, prunes stale users (>30s), returns other active users |

`ACTIVE_TIMEOUT_MS = 30000` (30 seconds). Active users stored in `conversation.activeUsers` JSON field as `[{ userId, userName, lastSeen }]`.

### Generate Title

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/chat/generate-title` | Takes first 4 messages, generates 3-6 word title via Gemini Flash (`maxTokens: 30`, `temperature: 0.3`) |

### Action Status & Control

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/chat/actions/[id]/status` | Check action status. Runs `checkPendingActions` first (expire/warn), then returns `getActionStatus` with timing data |
| POST | `/api/chat/actions/[id]/approve` | Approve pending action. Triggers background execution |
| POST | `/api/chat/actions/[id]/reject` | Reject pending action |
| POST | `/api/chat/actions/[id]/rollback` | Rollback completed/failed action |

All action routes verify account-level access (`action.accountId === member.accountId` or superAdmin).

---

## 11. Frontend Component (`ghost-chat-popup.jsx`)

### Layout

3-column layout:
- **Left sidebar** (280px): Conversation list with search, create new, rename, delete
- **Center**: Chat area - message stream, action cards, thinking indicator, input bar
- **Right sidebar** (320px): Quick action buttons grid

### AI SDK v6 Integration

```javascript
const {
  messages: aiMessages,
  sendMessage,
  status,
  setMessages: setAiMessages,
} = useChat({
  api: '/api/chat',
  onFinish: () => {
    // Generate title if conversation has none
    // Refresh conversations list
  },
  onError: (error) => {
    // Show error toast
  },
});

const isAiLoading = status === 'submitted' || status === 'streaming';
```

- Local `input` state (not managed by AI SDK v6's `input`)
- `sendMessage({ text: messageText }, { body: { conversationId, siteId } })`

### Message Handling

**`handleSend()`:** If no active conversation, creates one first (POST to conversations endpoint), then calls `sendMessage`. Uses `skipNextLoadMessagesRef` to avoid overwriting the streaming response after inline conversation creation.

**`loadMessages(convId)`:** Fetches from `GET /api/chat/conversations/${convId}/messages`, maps to UIMessage format: `{ id, role, parts: [{ type: 'text', text }] }`, then sets via `setAiMessages`.

### Action Card Rendering

Detects `propose_action` tool parts in v6 message parts. Renders:

1. **Header**: Title + `ActionStatusBadge` (pill-shaped status indicator)
2. **Description**: Markdown via `ReactMarkdown`
3. **Steps**: Numbered list of planned actions
4. **Timer**: Countdown showing remaining time (switches to warning style at < 120 seconds)
5. **Buttons** (based on status):
   - `PENDING_APPROVAL`: Approve (purple gradient) + Reject
   - `EXECUTING`: Loading spinner
   - `COMPLETED`/`FAILED`: Rollback button (amber)

### Action Polling

```javascript
startActionPolling(actionId)
// Polls: GET /api/chat/actions/${actionId}/status every 3000ms
// Stops on terminal statuses: COMPLETED, FAILED, EXPIRED, REJECTED, ROLLED_BACK
// On terminal status → calls loadMessages() to refresh conversation
```

### Concurrent Users Polling

```javascript
// Every 15000ms → GET /api/chat/conversations/${id}/active-users
// Shows toast notification once per new concurrent user detected
```

### Quick Actions (8 Buttons)

| Key | Icon | Color | Purpose |
|-----|------|-------|---------|
| `generateContent` | Sparkles | purple | Generate content suggestions |
| `quickSeoAudit` | ShieldCheck | blue | Run quick SEO audit |
| `keywordResearch` | Target | green | Keyword research |
| `competitorAnalysis` | Users | orange | Competitor analysis |
| `fixSeoIssues` | Wrench | cyan | Fix SEO issues |
| `contentPlanner` | CalendarDays | pink | Content planning |
| `analyticsReport` | TrendingUp | blue | Analytics report |
| `linkBuilding` | Link2 | purple | Link building strategy |

### Thinking Indicator

Expandable UI (similar to ChatGPT's "thinking" display):
- Shows tool parts being processed during `streaming` status
- Loading spinner for in-progress tools, checkmark for completed
- Collects non-`propose_action` tool parts from the last streaming assistant message
- Collapsed by default, user can expand to see tool execution details

### Action Status Badge (`ActionStatusBadge`)

Pill-shaped indicator with icon, label, and color:

| Status | Label Key | Icon | CSS Class |
|--------|-----------|------|-----------|
| `PENDING_APPROVAL` | `pending` | `Clock` | `statusPending` (amber) |
| `APPROVED` | `approved` | `Check` | `statusApproved` (green) |
| `EXECUTING` | `executing` | `Loader2` (spinning) | `statusExecuting` (purple) |
| `COMPLETED` | `completed` | `CheckCircle` | `statusCompleted` (green) |
| `FAILED` | `failed` | `AlertTriangle` | `statusFailed` (red) |
| `EXPIRED` | `expired` | `Clock` | `statusExpired` (gray) |
| `REJECTED` | `rejected` | `XCircle` | `statusRejected` (light red) |
| `ROLLED_BACK` | `rolledBack` | `RotateCcw` | `statusRolledBack` (amber) |
| `ROLLING_BACK` | `rollingBack` | `Loader2` (spinning) | `statusExecuting` (purple) |
| `LOADING` | `creating` | `Loader2` (spinning) | `statusExecuting` (purple) |

---

## 12. Database Schema (Prisma)

### Enums

```prisma
enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  FUNCTION
}

enum ChatActionStatus {
  PENDING_APPROVAL
  APPROVED
  EXECUTING
  COMPLETED
  FAILED
  EXPIRED
  REJECTED
  ROLLED_BACK
}

enum ChatActionType {
  WORDPRESS_UPDATE
  CODE_SNIPPET
  PLATFORM_ACTION
  MULTI_STEP
}
```

### Models

```prisma
model ChatConversation {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  siteId          String        @db.ObjectId
  site            Site          @relation(...)
  accountId       String        @db.ObjectId
  account         Account       @relation(...)
  createdByUserId String        @db.ObjectId
  createdByUser   User          @relation("ChatConversationCreator", ...)
  title           String?
  messages        ChatMessage[]
  chatActions     ChatAction[]
  activeUsers     Json?         // [{userId, userName, lastSeen}]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([siteId])
  @@index([accountId])
  @@map("chat_conversations")
}

model ChatMessage {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String           @db.ObjectId
  conversation    ChatConversation @relation(...)
  role            MessageRole
  userId          String?          @db.ObjectId
  user            User?            @relation("ChatMessageSender", ...)
  content         String
  createdAt       DateTime         @default(now())

  @@index([conversationId])
  @@map("chat_messages")
}

model ChatAction {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String           @db.ObjectId
  conversation    ChatConversation @relation(...)
  siteId          String           @db.ObjectId
  site            Site             @relation(...)
  accountId       String           @db.ObjectId
  account         Account          @relation(...)
  userId          String           @db.ObjectId
  user            User             @relation("ChatActionUser", ...)
  type            ChatActionType
  status          ChatActionStatus @default(PENDING_APPROVAL)
  plan            Json             // { title, description }
  actions         Json[]           // [{ tool, args, description }]
  rollbackData    Json[]           // [{ tool, originalValue, newValue, executedAt }]
  result          Json?
  error           String?
  expiresAt       DateTime
  warningAt       DateTime
  warningSent     Boolean          @default(false)
  approvedAt      DateTime?
  rejectedAt      DateTime?
  executedAt      DateTime?
  rolledBackAt    DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@index([conversationId])
  @@index([status, expiresAt])
  @@map("chat_actions")
}
```

---

## 13. Connection to WordPress Plugin

The chat system connects to WordPress through the same HMAC-SHA256 authenticated REST API described in `WORDPRESS_PLUGIN_SYSTEM.md`. The flow:

```
1. User asks AI to change something (e.g., "Update the SEO title of my homepage")

2. AI calls propose_action with:
   { tool: 'wp_update_seo', args: { postId: '36', seoData: { title: 'New Title' } } }

3. ChatAction created with PENDING_APPROVAL, user sees action card

4. User clicks "Approve"

5. Backend calls executeChatAction():
   a. SNAPSHOT: wpApi.getSeoData(site, '36')  ← current SEO data saved
   b. EXECUTE:  wpApi.updateSeoData(site, '36', { title: 'New Title' })
      └→ lib/wp-api-client.js creates HMAC-signed request:
         PUT /wp-json/ghost-post/v1/seo/36
         Headers: X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
         Body: { title: 'New Title' }
      └→ WordPress plugin validates signature via GP_Request_Validator
      └→ GP_SEO_Manager updates Yoast/RankMath meta fields
   c. RECORD:   rollbackData = { tool: 'wp_update_seo', originalValue: { title: 'Old Title' } }

6. Status → COMPLETED, user sees success in action card

7. If user clicks "Rollback":
   wpApi.updateSeoData(site, '36', { title: 'Old Title' })  ← restores snapshot
   Status → ROLLED_BACK
```

### Platform API Client (`lib/wp-api-client.js`)

All WordPress calls flow through this client. Every request:
- Includes HMAC-SHA256 signed headers (`X-GP-Site-Key`, `X-GP-Timestamp`, `X-GP-Signature`)
- Has 30-second timeout
- Targets `{site.url}/wp-json/ghost-post/v1/{endpoint}`

See `WORDPRESS_PLUGIN_SYSTEM.md` Section 14 for the full method reference.

---

## 14. CSS Styling

### Action Card (from `ghost-chat-popup.module.css`)

| Class | Style |
|-------|-------|
| `.actionCard` | White card, border, 16px padding, hover → elevated shadow + primary border |
| `.actionCardHeader` | Flex row, space-between, title left + badge right |
| `.actionCardTitle` | Flex with `Zap` icon, 600 weight, 0.95em |
| `.actionCardDescription` | 0.88em, secondary color, 1.5 line-height, rendered via ReactMarkdown |
| `.actionCardSteps` | Column flex, 6px gap, subtle background, 8px radius |
| `.actionStepNumber` | 22px circle, primary (purple) background, white text |
| `.actionTimer` | Flex row, 0.8em, subtle background. Warning state (< 120s): amber color + amber background |
| `.actionBtn` | 8px 16px, 0.82em, 600 weight |
| `.actionBtnApprove` | Gradient primary background (purple), white text, purple shadow on hover |
| `.actionBtnReject` | Hover → danger red |
| `.actionBtnRollback` | Warning/amber themed |

### Status Badge

| CSS Class | Background | Text Color |
|-----------|-----------|------------|
| `.statusPending` | Amber | Amber |
| `.statusApproved` | Green | Green |
| `.statusExecuting` | Purple | Purple |
| `.statusCompleted` | Green | Green |
| `.statusFailed` | Red | Red |
| `.statusExpired` | Gray | Gray |
| `.statusRejected` | Light red | Gray |
| `.statusRolledBack` | Light amber | Amber |

### Thinking Container

- `.thinkingContainer` - Expandable section with chevron toggle
- `.toolLoading` - Flex row with spinner/checkmark + tool name
- Dots animation for typing indicator

---

## 15. Credit Tracking

Every chat message is tracked for billing:

```javascript
// In onFinish callback:
await logAIUsage(prisma, {
  accountId, siteId, userId,
  operation: AI_OPERATIONS.CHAT_MESSAGE,
  model: selectedModelName,
  tokensUsed: /* from steps */,
});

await trackAIUsage({
  accountId, siteId, userId,
  model: selectedModelName,
  conversationId,
  route: 'chat',
});
```

---

## 16. Error Handling & Edge Cases

### Auth & Access
- All endpoints require authenticated session via `getCurrentAccountMember()`
- Conversation access: account member or superAdmin
- Action access: `action.accountId === member.accountId` or superAdmin

### Concurrent Users
- Active user tracking with 30-second timeout
- Frontend polls every 15 seconds
- Shows toast notification when another user joins the same conversation

### Action Expiry
- `checkPendingActions` runs at the start of every chat request
- Warning message saved to conversation at 2-minute mark
- Auto-expire at 5-minute mark with translated expiry message

### Write Tool Safety
- If the AI calls a write tool directly (bypassing `propose_action`), the handler returns an error message instructing it to use `propose_action` instead
- `stepCountIs(5)` prevents infinite tool-calling loops
- `hasToolCall('propose_action')` stops the stream immediately so the user can review

### WordPress Connection Failure
- `wpApi.getSiteInfo()` is non-fatal - if it fails, chat continues without site context
- Write operations will fail at execution time if WordPress is unreachable
- Failed actions are marked `FAILED` with error details and can still be rolled back (partial rollback)
