# GhostSEO Platform - Complete System Documentation

> **Single-document reference** for the entire GhostSEO platform: architecture, data models, permissions, subscriptions, AI infrastructure, every page & feature, plugin system, background jobs, API routes, and workflows.

---

## Table of Contents

### Part I: Architecture & Foundation
1. [Platform Overview & Vision](#1-platform-overview--vision)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [AI Infrastructure](#4-ai-infrastructure)

### Part II: Data Model & Business Logic
5. [Organizational Hierarchy](#5-organizational-hierarchy)
6. [Subscription & Billing System](#6-subscription--billing-system)
7. [Permission System](#7-permission-system)
8. [Interview System](#8-interview-system)
9. [Entity & Content Models](#9-entity--content-models)
10. [Internationalization System](#10-internationalization-system)

### Part III: Page-by-Page Feature Guide
11. [Authentication & Registration](#11-authentication--registration)
12. [Dashboard Layout & Navigation](#12-dashboard-layout--navigation)
13. [Main Dashboard (Command Center)](#13-main-dashboard-command-center)
14. [AI Agent](#14-ai-agent)
15. [Strategy Section](#15-strategy-section)
16. [Technical SEO Tools](#16-technical-seo-tools)
17. [Automations](#17-automations)
18. [Entities Management](#18-entities-management)
19. [My Websites](#19-my-websites)
20. [Link Building & Backlinks](#20-link-building--backlinks)
21. [Notifications](#21-notifications)
22. [Settings](#22-settings)
23. [Admin Panel (SuperAdmin)](#23-admin-panel-superadmin)

### Part IV: Systems & Integration
24. [WordPress Plugin System](#24-wordpress-plugin-system)
25. [Background Jobs & Content Pipeline](#25-background-jobs--content-pipeline)
26. [Context Providers](#26-context-providers)
27. [Middleware](#27-middleware)
28. [Shared Dashboard Components](#28-shared-dashboard-components)
29. [API Routes Reference](#29-api-routes-reference)
30. [Lib Utilities Reference](#30-lib-utilities-reference)
31. [Key Workflows](#31-key-workflows)

---

# Part I: Architecture & Foundation

---

## 1. Platform Overview & Vision

**GhostSEO** is an AI-powered SEO automation platform for managing websites and content. It allows businesses to manage multiple sites, generate content intelligently, track keywords, analyze competitors, and perform SEO audits - all driven by artificial intelligence.

### Product Vision

The system is designed to be the "ultimate SEO platform" combining:

- **Full Automation** - From initial interview to content publication
- **AI as a Partner** - Not just a tool, but an active participant
- **Deep Integration** - Full WordPress plugin connection
- **Tracking & Analytics** - Every important SEO metric in one place

### System Scope

- **Multi-Tenancy**: Thousands of organizations in parallel
- **Scale**: From a single site to networks of hundreds
- **Multilingual**: 12 built-in languages + extensibility
- **Multi-Currency**: USD, ILS, EUR, GBP
- **Multi-Timezone**: Per-account timezone support

---

## 2. Technology Stack

### Frontend
- **Framework**: Next.js 15.0.0+ (App Router) - Server Components, Server Actions, Streaming SSR, Automatic Code Splitting, Image Optimization
- **React**: 19.0.0+ - Server Components, Suspense Boundaries, Error Boundaries, Context API
- **Styling**: CSS Modules with Nested Syntax
- **UI Libraries**:
  - `framer-motion` 12.0.0+ - Smooth animations
  - `lucide-react` 0.460.0+ - 1000+ icons
  - `@tiptap/react` 3.18.0+ - Advanced WYSIWYG editor
  - `@floating-ui/dom` 1.7.5+ - Tooltips and popovers

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Next.js API Routes
- **Database**: MongoDB 6.0+ (Atlas Cloud or on-premise, Replica Set for HA)
- **ORM**: Prisma 6.0.0+ - Type-safe client, schema management, migrations
- **Authentication**: Custom JWT + Sessions - bcryptjs (cost factor 10), OTP (SMS + Email), OAuth 2.0 (Google, GitHub, Facebook, Apple)

### AI
- **Provider**: Google AI (Gemini)
- **SDK**: Vercel AI SDK v6.0.50+
- **Models**: `gemini-2.5-pro` (text), `gemini-3-pro-image-preview` (images), `gemini-3.1-pro-preview` (complex semantic reasoning)
- **Capabilities**: `generateText`, `streamText`, `generateObject` (Zod v4 schemas), Function Calling

### Email & Notifications
- **Provider**: nodemailer 7.0.13+
- **Use Cases**: Registration OTP, Password reset, Team invitations, Billing, Audit reports

### Security
- **HMAC-SHA256** - Plugin authentication
- **JWT/Session** - User authentication
- **bcryptjs** - Password hashing
- **OTP** - Two-factor verification

---

## 3. Project Structure

```
gp-platform/
├── app/                           # Next.js App Router
│   ├── layout.jsx                # Root layout (providers, fonts)
│   ├── page.jsx                  # Homepage
│   ├── globals.css               # Global styles + CSS variables
│   │
│   ├── api/                      # API Routes
│   │   ├── auth/                # Authentication endpoints
│   │   ├── user/                # User management
│   │   ├── account/             # Account management
│   │   ├── sites/               # Sites CRUD + redirections + plugin download
│   │   ├── entities/            # Content from WordPress
│   │   ├── interview/           # Interview system (chat, actions, analyze)
│   │   ├── settings/            # Settings management
│   │   ├── subscription/        # Subscription & billing
│   │   ├── payment/             # CardCom payment gateway
│   │   ├── translations/        # i18n management
│   │   ├── plugin/              # WordPress plugin APIs (version, download)
│   │   ├── keywords/            # Keyword tracking
│   │   ├── competitors/         # Competitor analysis
│   │   ├── campaigns/           # Campaign management
│   │   ├── content/             # Content management
│   │   ├── agent/               # AI agent (insights, execute)
│   │   ├── audit/               # Site audit
│   │   ├── backlinks/           # Backlink tracking
│   │   ├── notifications/       # Notifications CRUD
│   │   ├── credits/             # AI credits
│   │   ├── sitemaps/            # Sitemap management
│   │   ├── cron/                # Cron dispatchers
│   │   │   ├── sync-entities/
│   │   │   ├── process-content/
│   │   │   ├── publish-content/
│   │   │   └── agent-analysis/
│   │   ├── worker/              # Worker executors
│   │   │   ├── generate-article/
│   │   │   └── publish-article/
│   │   ├── public/              # Public APIs (no auth)
│   │   │   ├── auth/
│   │   │   └── wp/             # WordPress webhooks
│   │   └── admin/               # Super admin APIs
│   │       ├── accounts/
│   │       ├── plans/
│   │       ├── addons/
│   │       ├── subscriptions/
│   │       ├── coupons/
│   │       ├── users/
│   │       ├── interview-flow/
│   │       ├── interview-questions/
│   │       ├── bot-actions/
│   │       └── push-questions/
│   │
│   ├── auth/                     # Auth pages
│   │   ├── login/
│   │   ├── register/
│   │   └── accept-invite/
│   │
│   ├── dashboard/                # Protected dashboard
│   │   ├── layout.jsx           # Dashboard layout + sidebar
│   │   ├── page.jsx             # Dashboard home
│   │   ├── agent/               # AI agent page
│   │   ├── strategy/            # Strategy section
│   │   │   ├── site-profile/
│   │   │   ├── keywords/
│   │   │   ├── competitors/
│   │   │   ├── content-planner/
│   │   │   └── ai-content-wizard/
│   │   ├── technical-seo/       # Technical SEO tools
│   │   │   ├── redirections/
│   │   │   ├── webp-converter/
│   │   │   └── site-audit/
│   │   ├── entities/            # WordPress content browsing
│   │   ├── automations/         # Automation workflows
│   │   ├── link-building/       # Link building
│   │   ├── backlinks/           # Backlink analytics
│   │   ├── my-websites/         # Multi-site management
│   │   ├── notifications/       # Notification center
│   │   ├── site-audit/          # Site audit (legacy path)
│   │   ├── seo-frontend/        # On-page SEO
│   │   ├── seo-backend/         # Technical SEO (legacy path)
│   │   ├── settings/            # Account & website settings
│   │   ├── components/          # Shared dashboard components
│   │   └── admin/               # Super admin UI
│   │       ├── accounts/
│   │       ├── users/
│   │       ├── plans/
│   │       ├── addons/
│   │       ├── subscriptions/
│   │       ├── coupons/
│   │       ├── interview-flow/
│   │       ├── interview-questions/
│   │       ├── bot-actions/
│   │       ├── push-questions/
│   │       ├── translations/
│   │       ├── backlinks/
│   │       └── website/
│   │
│   └── context/                  # React contexts (9 providers)
│       ├── user-context.jsx
│       ├── site-context.jsx
│       ├── locale-context.jsx
│       ├── theme-context.jsx
│       ├── auth-modal-context.jsx
│       ├── agent-context.jsx
│       ├── background-tasks-context.jsx
│       ├── limit-guard-context.jsx
│       └── notifications-context.jsx
│
├── lib/                          # Server-side utilities
│   ├── prisma.js                # Prisma client singleton
│   ├── permissions.js           # Permission system
│   ├── auth-permissions.js      # Auth permission helpers
│   ├── account-utils.js         # Account business logic
│   ├── account-limits.js        # Resource limits enforcement
│   ├── site-keys.js             # Site key generation & HMAC verification
│   ├── wp-api-client.js         # WordPress plugin client
│   ├── worker-auth.js           # Worker HMAC authentication
│   ├── mailer.js                # Email service
│   ├── notifications.js         # Notification creation & broadcast
│   ├── google-oauth.js          # Google OAuth
│   ├── google-integration.js    # GA4 + Search Console integration
│   ├── cloudinary-upload.js     # Image & media upload to Cloudinary
│   ├── cardcom.js               # CardCom payment gateway (Israeli)
│   ├── proration.js             # Subscription billing proration
│   ├── fetch-interceptor.js     # Global fetch wrapper (auto-logout on 401)
│   ├── domain-metrics.js        # SEO metrics & domain analysis
│   ├── agent-analysis.js        # AI agent analysis engine
│   ├── agent-fix.js             # AI agent fix execution (merge, redirect, re-index)
│   ├── competitor-scraper.js    # Competitor website scraping
│   ├── entity-sync.js           # WordPress entity synchronization
│   ├── cannibalization-engine.js # Content cannibalization detection
│   ├── urlDisplay.js            # URL formatting utilities
│   │
│   ├── ai/                      # AI services
│   │   ├── index.js            # Main exports
│   │   ├── gemini.js           # Gemini model config + helpers
│   │   ├── service.js          # Legacy AI service
│   │   └── interview-ai.js    # Interview-specific AI
│   │
│   ├── bot-actions/             # Bot action system
│   │   ├── index.js            # Registry
│   │   ├── executor.js         # Action executor
│   │   └── handlers/           # Individual action handlers
│   │
│   ├── interview/               # Interview system
│   │   ├── flow-engine.js      # Flow logic & conditions
│   │   └── functions/          # Interview functions
│   │
│   └── audit/                   # Site audit & crawling logic
│
├── prisma/
│   └── schema.prisma            # Complete data model
│
├── i18n/                         # Internationalization
│   ├── config.js               # i18n configuration (RTL, directions)
│   ├── get-dictionary.js       # Dictionary loader
│   ├── server.js               # Server-side i18n helpers
│   └── dictionaries/           # Language JSON files
│       ├── en.json
│       ├── he.json
│       └── ... (12 languages)
│
├── scripts/                      # Utility scripts
├── public/                       # Static assets
├── middleware.js                 # Locale detection middleware
├── next.config.mjs
├── prisma.config.ts
└── package.json
```

---

## 4. AI Infrastructure

### Architecture (`lib/ai/`)

Three layers:

#### Layer 1 - Base (`gemini.js`)

```javascript
export const MODELS = {
  TEXT: "gemini-2.5-pro",
  IMAGE: "gemini-3-pro-image-preview",
  PRO_PREVIEW: "gemini-3.1-pro-preview",  // Maximum reasoning for complex semantic tasks
};

export function getTextModel() {
  return google(MODELS.TEXT);
}

// Simple text generation (with AI credits logging)
export async function generateTextResponse({ system, prompt, messages, maxTokens, temperature = 0.7, operation, metadata }) {
  const model = getTextModel();
  const result = await generateText({ model, system, prompt, messages, maxTokens, temperature });
  if (operation) logAIUsage(operation, metadata);
  return result.text;
}

// Streaming response (for API routes)
export async function streamTextResponse({ system, prompt, messages, maxTokens, temperature }) {
  const model = getTextModel();
  const result = streamText({ model, system, prompt, messages, maxTokens, temperature });
  return result.toDataStreamResponse();
}

// Structured output with Zod v4 validation (supports modelOverride for PRO_PREVIEW)
export async function generateStructuredResponse({ system, prompt, schema, temperature, maxTokens, operation, metadata, modelOverride }) {
  const model = modelOverride ? google(modelOverride) : getTextModel();
  const result = await generateObject({ model, system, prompt, schema: toJSONSchema(schema) });
  if (operation) logAIUsage(operation, metadata);
  return result.object; // Type-safe!
}

// AI image generation (Nano Banana Pro with Picsum fallback)
export async function generateImage({ prompt, aspectRatio, n, operation, metadata }) { ... }
```

#### Layer 2 - Interview (`interview-ai.js`)
- Custom system prompts for interview context
- Function calling for bot actions
- Context management across questions
- Personality injection

#### Layer 3 - Legacy Service (`service.js`)
- Backward compatibility with OpenAI/Anthropic
- Abstraction layer

### Usage Example

```javascript
import { generateStructuredResponse } from "@/lib/ai/gemini";
import { z } from "zod";

const keywords = await generateStructuredResponse({
  system: "Extract SEO keywords from this website.",
  prompt: `Website: ${websiteUrl}`,
  schema: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
    longtail: z.array(z.string()),
  }),
});
```

---

# Part II: Data Model & Business Logic

---

## 5. Organizational Hierarchy

The system uses a 3-layer hierarchy with full separation:

### Account (Organization)

Represents a company, organization, or sole proprietorship.

```prisma
model Account {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  slug            String   @unique
  logo            String?
  website         String?
  industry        String?
  timezone        String   @default("UTC")
  defaultLanguage Language @default(EN)
  billingEmail    String
  generalEmail    String
  isActive        Boolean  @default(true)

  // AI Credits Economy
  aiCreditsBalance   Int   @default(0)
  aiCreditsUsedTotal Int   @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  members         AccountMember[]
  sites           Site[]
  subscription    Subscription?
  payments        Payment[]
  roles           Role[]
  aiCreditsLogs   AiCreditsLog[]
}
```

**Business Rules:**
- Created during registration by the first user
- First user automatically becomes Owner
- Can contain multiple Sites (per plan)
- Subscription is tied to Account, not User
- Only Owner or SuperAdmin can delete Account

**Use Cases:**
- Marketing agency with 20 clients → 20 Sites in one Account
- Freelancer with 5 clients → 5 Sites in one Account
- Organization with departments → each department a separate Site

### User

A person who can be a member of multiple Accounts.

```prisma
model User {
  id                    String             @id @default(auto()) @map("_id") @db.ObjectId
  email                 String             @unique
  firstName             String?
  lastName              String?
  phoneNumber           String?
  password              String?                    // Hashed with bcryptjs
  image                 String?
  emailVerified         DateTime?
  phoneVerified         DateTime?
  primaryAuthMethod     AuthMethod         @default(EMAIL)
  selectedLanguage      Language?
  preferredCurrency     Currency?
  lastSelectedAccountId String?            @db.ObjectId
  registrationStep      RegistrationStep   @default(VERIFY)
  consentGiven          Boolean            @default(false)
  consentDate           DateTime?
  isActive              Boolean            @default(true)
  isSuperAdmin          Boolean            @default(false)
  lastLoginAt           DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  authProviders      AuthProvider[]
  sessions           Session[]
  accountMemberships AccountMember[]
  otpCodes           OtpCode[]
  interviews         UserInterview[]
  sitePreferences    UserSitePreference[]
}
```

**Business Rules:**
- Can be Owner of only one Account
- Can be Member of multiple Accounts
- Supports OAuth (Google, GitHub, Facebook, Apple) or Email/Password
- `isSuperAdmin: true` grants access to admin area

**Auth Methods:** `EMAIL`, `GOOGLE`, `GITHUB`, `FACEBOOK`, `APPLE`

### AccountMember (Team Membership)

Links a User to an Account with a role and permissions.

```prisma
model AccountMember {
  id                 String            @id @default(auto()) @map("_id") @db.ObjectId
  accountId          String            @db.ObjectId
  userId             String?           @db.ObjectId       // null for pending invites
  roleId             String            @db.ObjectId
  isOwner            Boolean           @default(false)
  lastSelectedSiteId String?           @db.ObjectId
  invitedBy          String?           @db.ObjectId
  invitedAt          DateTime?
  inviteEmail        String?
  inviteToken        String?           @unique
  inviteLanguage     String?
  joinedAt           DateTime          @default(now())
  status             MemberStatus      @default(ACTIVE)

  @@unique([accountId, userId])
  @@unique([accountId, inviteEmail])
}

enum MemberStatus {
  PENDING    // Invited but not accepted
  ACTIVE     // Active member
  SUSPENDED  // Temporarily suspended
  REMOVED    // Removed from account
}
```

**Invite Flow (Detailed):**

1. **Owner/Admin sends invite** via `POST /api/settings/users/invite`
   - Requires `SETTINGS_USERS_EDIT` permission (or `isOwner`)
   - Payload: `{ email, roleId, language }`
   - Email is normalized (lowercase, trimmed)
   - Validates role exists in this account
   - **Prevents Owner role assignment** via invite (`role.name === 'Owner'` → rejected)
   - Checks for existing membership:
     - **PENDING** → Error: "An invite has already been sent"
     - **ACTIVE** → Error: "User is already a member"
     - **SUSPENDED** → Error: "User is suspended"
     - **REMOVED** → Reactivates with new token
2. **Unique `inviteToken` generated** - 32 random bytes (hex)
3. **Email sent** in `inviteLanguage` via `sendEmail()` with `emailTemplates.invitation()` - contains account name, inviter name, role, and accept link
4. **User clicks link** → redirected to `/auth/accept-invite?token={inviteToken}`
5. **Token verification** via `GET /api/auth/accept-invite/verify?token={token}` (public endpoint):
   - Validates token exists and status is PENDING
   - Checks expiration (7 days from `invitedAt`)
   - Returns: `{ email, accountName, roleName, inviterName, existingUser }`
6. **Acceptance** via `POST /api/auth/accept-invite`:
   - **Scenario A - New user** (no existing account): Creates a new `User` record with hashed password, sets `registrationStep: COMPLETED` (skips normal registration), links `userId` to the `AccountMember`
   - **Scenario B - Existing user**: Validates password against stored hash, links existing `userId` to the `AccountMember`
   - In both cases: status → `ACTIVE`, `joinedAt` set, session cookie created, `lastSelectedAccountId` set to the inviting account
7. **Resend** via `POST /api/settings/users/{memberId}/resend` - generates new token, resets `invitedAt`, resends email (only for PENDING members)

**Invitation Expiration:** Tokens expire 7 days after `invitedAt`. Expired invites return error code `EXPIRED` and can be reset by resending.

### Ownership Rules

- **Owner is set during registration**: When a user creates an account, an `Owner` system role is auto-created with ALL permissions, and the `AccountMember` is created with `isOwner: true`
- **Owner role is a system role** (`isSystemRole: true`) - cannot be deleted or modified
- **Cannot assign Owner via invite** - the invite API explicitly rejects `role.name === 'Owner'`
- **Cannot remove the owner** - `DELETE /api/settings/users/{memberId}` checks `isOwner` and rejects
- **Cannot modify owner's role** - `PATCH` rejects if target member has `isOwner: true`
- **One owner per account** - enforced via application-level validation in `lib/account-utils.js`

### Multi-Account Support & Account Switching

A user can belong to multiple accounts simultaneously:

- Each membership is a separate `AccountMember` record with its own role and permissions
- `User.lastSelectedAccountId` tracks the currently active account
- **Account context resolution** (via `getCurrentAccountMember()` in `lib/auth-permissions.js`):
  1. Get `userId` from session cookie
  2. Load user with all `accountMemberships`
  3. If `lastSelectedAccountId` exists and that membership is ACTIVE → use it
  4. Otherwise → select the first ACTIVE membership
  5. Load the membership's role and permissions
  6. Return full context: `{ userId, accountId, membership, role, permissions, isOwner, account }`
- All API calls and permission checks operate within the context of the currently selected account
- Users see an account switcher in the dashboard to change their active account
- Permissions are **per-account** - a user may be an Owner in one account and an Editor in another

### Site (Website)

A website managed by an Account.

```prisma
model Site {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String   @db.ObjectId
  name            String
  url             String
  isActive        Boolean  @default(true)
  maintenanceMode Boolean  @default(false)
  platform        String?                         // wordpress, shopify, custom
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // WordPress Plugin Connection
  siteKey              String?                    // Public: gp_site_abc123
  siteSecret           String?                    // Private: secret_xyz...
  connectionStatus     SiteConnectionStatus @default(PENDING)
  lastPingAt           DateTime?
  pluginVersion        String?
  wpVersion            String?
  phpVersion           String?
  wpTimezone           String?
  wpLocale             String?
  sitePermissions      SitePermission[]

  // Auto-install (temporary, deleted after install)
  wpAdminUrl           String?
  wpAdminUsername      String?                    // Encrypted
  wpAdminPassword      String?                    // Encrypted
  autoInstallExpiresAt DateTime?

  // Entity Sync Tracking
  entitySyncStatus     EntitySyncStatus @default(NEVER)
  entitySyncProgress   Int?                       // 0-100
  entitySyncMessage    String?
  lastEntitySyncAt     DateTime?
  entitySyncError      String?

  // Tool Settings
  toolSettings         Json?                      // { autoConvertToWebp: true }

  account         Account               @relation(...)
  keywords        Keyword[]
  contents        Content[]
  redirections    Redirection[]
  audits          SiteAudit[]
  entityTypes     SiteEntityType[]
  entities        SiteEntity[]
  menus           SiteMenu[]

  @@index([siteKey])
}

enum SiteConnectionStatus {
  PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR
}

enum SitePermission {
  CONTENT_READ, CONTENT_CREATE, CONTENT_UPDATE, CONTENT_DELETE, CONTENT_PUBLISH
  MEDIA_UPLOAD, MEDIA_DELETE
  SEO_UPDATE
  REDIRECTS_MANAGE
  SITE_INFO_READ
  CPT_READ, CPT_CREATE, CPT_UPDATE, CPT_DELETE
  ACF_READ, ACF_UPDATE
  TAXONOMY_READ, TAXONOMY_MANAGE
}
```

**Plugin Communication Flow:**
```
1. Platform creates Site → generates siteKey + siteSecret
2. User installs WordPress plugin (manual or auto)
3. User enters siteKey in plugin settings
4. Plugin calls /api/plugin/auth/verify with siteKey
5. Platform returns siteSecret + site info
6. Plugin stores siteSecret securely (encrypted in wp_options)
7. All future requests include HMAC signature:
   - Header: X-Site-Key: gp_site_abc123
   - Header: X-Signature: hmac_sha256_signature
8. Platform verifies signature before processing
```

---

## 6. Subscription & Billing System

### Plans

```prisma
model Plan {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  slug            String   @unique
  description     String?
  price           Float                    // Monthly price
  yearlyPrice     Float?                   // Yearly price
  features        Json                     // [{key, label}]
  limitations     Json                     // [{key, label, value, type}]
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  translations    PlanTranslation[]
  subscriptions   Subscription[]
}
```

**Common Limitations Keys:**
- `maxMembers` - Team members
- `maxSites` - Websites
- `aiCredits` - Monthly AI credits
- `maxKeywords` - Tracked keywords
- `maxContent` - Content items
- `maxAddOnSeats`, `maxAddOnSites` - Add-on purchase limits

### Add-Ons

```prisma
model AddOn {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  name            String        @unique
  slug            String        @unique
  description     String?
  type            AddOnType
  price           Float
  currency        String        @default("USD")
  billingType     AddOnBillingType @default(RECURRING)
  quantity        Int?          // e.g., 10000 credits
  isActive        Boolean       @default(true)
  sortOrder       Int           @default(0)
  purchases       AddOnPurchase[]
  translations    AddOnTranslation[]
}

enum AddOnType {
  SEATS, SITES, AI_CREDITS, STORAGE, KEYWORDS, CONTENT, SITE_AUDITS
}

enum AddOnBillingType {
  RECURRING    // Charged every billing period
  ONE_TIME     // One-time purchase (e.g., credit packs)
}

model AddOnPurchase {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId  String        @db.ObjectId
  addOnId         String        @db.ObjectId
  quantity        Int           @default(1)
  status          AddOnPurchaseStatus @default(ACTIVE)
  creditsRemaining Int?         // For one-time AI credit purchases
  purchasedAt     DateTime      @default(now())
  expiresAt       DateTime?
  canceledAt      DateTime?
}

enum AddOnPurchaseStatus {
  ACTIVE, EXPIRED, CANCELED, DEPLETED
}
```

### Subscription

```prisma
model Subscription {
  id              String             @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String             @unique @db.ObjectId
  planId          String             @db.ObjectId
  status          SubscriptionStatus @default(ACTIVE)
  billingInterval BillingInterval    @default(MONTHLY)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  canceledAt      DateTime?
  trialEnd        DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  account         Account            @relation(fields: [accountId])
  plan            Plan               @relation(fields: [planId])
  payments        Payment[]
  addOnPurchases  AddOnPurchase[]
}

enum SubscriptionStatus {
  ACTIVE       // Currently active
  CANCELED     // Canceled (runs until period end)
  PAST_DUE     // Payment failed
  TRIALING     // In trial period
  EXPIRED      // Period ended without renewal
}

enum BillingInterval {
  MONTHLY
  YEARLY
}
```

**Period Management:**
- All subscriptions align to the 1st of the month
- Auto-rolls forward monthly via cron job
- Mid-month signups are prorated (daily rate = monthlyPrice / daysInMonth)
- Plan upgrades/downgrades: credit remaining days on old plan, charge remaining days on new plan
- Proration logic in `lib/proration.js`

### Payment Integration (CardCom)

**Gateway**: CardCom - Israeli PCI-compliant payment processor
**Module**: `lib/cardcom.js`

**Currency Support**: ILS (1), USD (2), EUR (3), GBP (4)

**Main Functions**:
- `createLowProfile()` - Creates a payment deal, returns a `LowProfileId` (secure token for iframe)
- `getLowProfileResult()` - Verifies payment completion after user submits
- `buildDocument()` - Generates invoice/receipt document

**Payment Flow**:
1. User selects plan → `POST /api/subscription/init` calls `createLowProfile()` → returns iframe URL
2. User enters card details in CardCom's secure iframe (PCI-compliant - card data never touches our server)
3. CardCom processes payment → redirects back with result
4. `POST /api/subscription/confirm` calls `getLowProfileResult()` to verify
5. On success: Subscription created, Payment record stored, AI credits allocated
6. Invoice generated via `buildDocument()`

**Special Flows**:
- `POST /api/payment/free-with-coupon` - Coupon grants 100% discount, bypasses payment entirely
- `POST /api/subscription/prorate` - Calculates cost difference for plan changes

### Coupons System

```prisma
model Coupon {
  id               String              @id @default(auto()) @map("_id") @db.ObjectId
  code             String              @unique
  description      String?
  discountType     DiscountType                    // PERCENTAGE or FIXED_AMOUNT
  discountValue    Float                           // e.g., 50 (%) or 50 ($)
  maxRedemptions   Int?                            // Total uses allowed (null = unlimited)
  maxPerAccount    Int?                            // Uses per account
  validFrom        DateTime?
  validUntil       DateTime?
  durationMonths   Int?                            // How long discount applies
  applicablePlans  String[]            @db.ObjectId // Restrict to specific plans (empty = all)
  limitationOverrides Json?                        // Grant extra limits beyond plan (e.g., more sites, credits)
  extraFeatures    Json?                           // Grant premium features (e.g., prioritySupport)
  isActive         Boolean             @default(true)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  translations     CouponTranslation[]
  redemptions      CouponRedemption[]
}

model CouponRedemption {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  couponId    String   @db.ObjectId
  accountId   String   @db.ObjectId
  redeemedAt  DateTime @default(now())
  snapshot    Json                                 // Full benefit snapshot at redemption time
}
```

**Coupon Features**:
- **Discount types**: Percentage (e.g., 50% off) or fixed amount (e.g., $50 off)
- **Usage limits**: Max total redemptions + max per account
- **Validity window**: `validFrom`/`validUntil` date range
- **Plan restriction**: Optional - only applicable to specific plans
- **Limitation overrides**: Can grant more generous limits than the plan itself (e.g., +5 extra sites, +10,000 AI credits)
- **Extra features**: Grant premium capabilities not in the plan (e.g., priority support)
- **Duration**: `durationMonths` - how many billing cycles the discount applies
- **Redemption snapshot**: Full benefit details frozen at redemption time for auditing
- **Validation endpoint**: `POST /api/public/coupons/validate` - checkout-time validation
- **Multi-language**: Per-language descriptions via `CouponTranslation`

### AI Credits Economy

Every Account maintains a credit balance. All AI operations deduct credits; plan renewals and add-on purchases add credits.

**Two-Pool Model** (`lib/ai/credits-service.js`):
- **Period Pool**: Plan base allocation + recurring add-ons - resets to zero every billing period and re-allocates
- **One-Time Pool**: ONE_TIME add-on packs (`creditsRemaining` on `AddOnPurchase`) - persists across periods, consumed FIFO after the period pool is exhausted
- When an AI operation costs credits: period allocation is consumed first; when depleted, one-time packs drain oldest-first
- `AddOnPurchaseStatus.DEPLETED` marks a fully consumed one-time pack

**Operation Costs** (`lib/ai/credits.js`): Each AI operation (content generation, competitor scan, SEO audit, etc.) has a configured credit cost.

```prisma
model AiCreditsLog {
  id          String          @id @default(auto()) @map("_id") @db.ObjectId
  accountId   String          @db.ObjectId
  userId      String?         @db.ObjectId
  siteId      String?         @db.ObjectId
  type        AiCreditsLogType               // CREDIT or DEBIT
  amount      Int
  balance     Int                            // Balance after this operation
  source      String                         // "plan_renewal", "addon_purchase", "content_generation"
  sourceId    String?
  description String?
  metadata    Json?
  createdAt   DateTime        @default(now())

  @@index([accountId])
  @@index([createdAt])
}
```

**Credit Operations (`lib/account-utils.js`):**

```javascript
// Deduct credits (returns true or throws if insufficient)
export async function deductAiCredits({ accountId, amount, source, sourceId, userId, siteId, description }) {
  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { aiCreditsBalance: true } });
    if (account.aiCreditsBalance < amount) throw new Error("Insufficient AI credits");
    const newBalance = account.aiCreditsBalance - amount;
    await tx.account.update({ where: { id: accountId }, data: { aiCreditsBalance: newBalance, aiCreditsUsedTotal: { increment: amount } } });
    await tx.aiCreditsLog.create({ data: { accountId, userId, siteId, type: "DEBIT", amount, balance: newBalance, source, sourceId, description } });
    return true;
  });
}

// Add credits
export async function addAiCredits({ accountId, amount, source, sourceId, description }) {
  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { aiCreditsBalance: true } });
    const newBalance = account.aiCreditsBalance + amount;
    await tx.account.update({ where: { id: accountId }, data: { aiCreditsBalance: newBalance } });
    await tx.aiCreditsLog.create({ data: { accountId, type: "CREDIT", amount, balance: newBalance, source, sourceId, description } });
    return newBalance;
  });
}
```

### Account Limits & Usage Enforcement (`lib/account-limits.js`)

Unified resource tracking that combines plan limits + add-on bonuses + coupon overrides:
- Enforced resources: `maxSites`, `maxMembers`, `siteAudits`, `aiCredits`, `maxKeywords`, `maxContent`
- Every protected route checks limits before allowing resource creation
- Auto-rolls expired billing periods when checking limits

---

## 7. Permission System

Granular RBAC with 50+ built-in permissions.

### System Roles
- **Owner** - Full access (bypasses all permission checks)
- **Admin** - Full access except account deletion
- **Editor** - Content and entity management
- **Viewer** - Read-only access

### Custom Roles
Accounts can create custom roles with specific permission sets.

### Permission Format
`MODULE_CAPABILITY` - e.g., `SITES_VIEW`, `CONTENT_EDIT`, `KEYWORDS_DELETE`, `SETTINGS_AI_EDIT`

### Permission Categories
- View, Create, Edit, Delete, Publish per module
- 50+ individual permissions across all modules
- Checked on every protected route and UI element
- Items hidden from sidebar if user lacks access

---

## 8. Interview System

An AI-powered onboarding interview that guides new users through site setup.

### Architecture

4 core components:
1. **InterviewQuestion** - Question templates (admin-configured)
2. **UserInterview** - User session
3. **InterviewMessage** - Conversation history
4. **BotAction** - Actions the AI can execute

### 12 Question Types

```prisma
enum InterviewQuestionType {
  GREETING          // Welcome message, no input
  INPUT             // Single input field (text, url, email, number, textarea)
  INPUT_WITH_AI     // Input that triggers AI analysis
  CONFIRMATION      // Yes/No with data preview
  SELECTION         // Single choice (cards or dropdown)
  MULTI_SELECTION   // Multiple choices (checkboxes)
  DYNAMIC           // Options loaded from API
  EDITABLE_DATA     // Show & edit crawled data
  FILE_UPLOAD       // File upload
  SLIDER            // Number range
  AI_SUGGESTION     // AI generates suggestion, user can edit
  AUTO_ACTION       // Automatic action, no user input needed
}
```

**Example - INPUT_WITH_AI:**
```json
{
  "questionType": "INPUT_WITH_AI",
  "translationKey": "interview.competitors",
  "inputConfig": { "inputType": "textarea", "placeholder": "Enter competitor URLs", "fieldName": "competitors" },
  "autoActions": [{ "action": "analyzeCompetitors", "triggerOn": "submit", "parameters": { "competitors": "{{competitors}}" } }]
}
```

**Example - SELECTION:**
```json
{
  "questionType": "SELECTION",
  "translationKey": "interview.platform",
  "inputConfig": {
    "selectionMode": "cards", "fieldName": "platform",
    "options": [
      { "value": "wordpress", "label": "WordPress", "icon": "wordpress" },
      { "value": "shopify", "label": "Shopify", "icon": "shopify" },
      { "value": "custom", "label": "Custom", "icon": "code" }
    ]
  },
  "saveToField": "platform"
}
```

**Example - AUTO_ACTION:**
```json
{
  "questionType": "AUTO_ACTION",
  "translationKey": "interview.analyzingSite",
  "autoActions": [
    { "action": "crawlWebsite", "parameters": { "url": "{{websiteUrl}}" } },
    { "action": "detectPlatform", "parameters": { "url": "{{websiteUrl}}" } }
  ],
  "inputConfig": { "loadingMessage": "Analyzing your website...", "successMessage": "Analysis complete!" }
}
```

### Flow Engine (`lib/interview/flow-engine.js`)

Evaluates complex conditions with operators: `equals`, `notEquals`, `contains`, `notContains`, `exists`, `isEmpty`, `greaterThan`, `lessThan`, `in`, `and`, `or`.

```json
{
  "operator": "and",
  "conditions": [
    { "operator": "equals", "field": "platform", "value": "wordpress" },
    { "operator": "exists", "field": "websiteUrl" }
  ]
}
```

### Bot Actions

Actions the AI can trigger during the interview:

| Action | Description |
|--------|-------------|
| `crawlWebsite` | Crawl site, extract business info, meta tags, structure |
| `detectPlatform` | Detect CMS (WordPress, Shopify, Wix, custom) |
| `analyzeCompetitors` | Analyze competitor websites |
| `generateKeywords` | Suggest keywords based on site content |
| `fetchArticles` | Fetch articles from the site |
| `analyzeWritingStyle` | Analyze the brand's writing style |
| `analyzeInternalLinks` | Analyze internal link structure |
| `createSiteAccount` / `updateSiteAccount` | Manage site account |
| `completeInterview` | Finalize the interview |

Each bot action is defined in the database with JSON Schema for parameters and return values, and implemented as a handler in `lib/bot-actions/handlers/`.

---

## 9. Entity & Content Models

### Entity Types (from WordPress)

```prisma
model SiteEntityType {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  siteId      String   @db.ObjectId
  name        String                     // "Blog Posts", "Products"
  slug        String                     // "posts", "products"
  apiEndpoint String?                    // "posts", "shop-products"
  sitemaps    String[]
  isEnabled   Boolean  @default(true)
  sortOrder   Int      @default(0)
  entities    SiteEntity[]

  @@unique([siteId, slug])
}

model SiteEntity {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  siteId        String   @db.ObjectId
  entityTypeId  String   @db.ObjectId
  title         String
  slug          String
  url           String?
  excerpt       String?
  content       String?                  // Full HTML content
  status        EntityStatus @default(PUBLISHED)
  featuredImage String?
  metadata      Json?                    // author, date, categories, tags
  seoData       Json?                    // Yoast/RankMath: focusKeyword, score, readability
  acfData       Json?                    // ACF fields
  externalId    String?                  // WordPress post ID
  publishedAt   DateTime?

  @@unique([siteId, entityTypeId, slug])
  @@index([siteId, externalId])
}

enum EntityStatus {
  PUBLISHED, DRAFT, PENDING, SCHEDULED, PRIVATE, ARCHIVED, TRASH
}
```

### Content (AI-Generated)

Content items flow through a multi-stage pipeline:

```
DRAFT → SCHEDULED → PROCESSING → READY_TO_PUBLISH → PUBLISHED
                         ↓
                       FAILED (with error message)
```

**Content Types:** `BLOG_POST`, `PAGE`, `PRODUCT`, `LANDING_PAGE`

**Article Types (for AI Wizard):** SEO Article, Blog Post, Guide, How-To, Listicle, Comparison, Review, News, Tutorial, Case Study

### Keywords

```prisma
model Keyword {
  // Search volume, difficulty, CPC, intent detection
  // Statuses: TRACKING, TARGETING, RANKING, ARCHIVED
  // Intent: INFORMATIONAL, NAVIGATIONAL, TRANSACTIONAL, COMMERCIAL
  // Tags for grouping
}
```

### Redirections

```prisma
model Redirection {
  // Types: PERMANENT (301), TEMPORARY (302), FOUND (307)
  // hitCount tracking, lastHitAt, active/inactive toggle
  // URL normalization: percent-decode + trailing-slash stripping
}
```

### Site Audit

```prisma
model SiteAudit {
  // Statuses: PENDING, RUNNING, COMPLETED, FAILED
  // Score (0-100), Core Web Vitals, recommendations
  // Severity levels: Warning, Info, Suggestion
}
```

### Campaign (AI Content Wizard)

Stores all wizard state for topic-cluster content campaigns.

```prisma
model Campaign {
  id                String         @id @default(auto()) @map("_id") @db.ObjectId
  siteId            String         @db.ObjectId
  name              String
  color             String         @default("#6366f1")          // Hex color for calendar
  status            CampaignStatus @default(DRAFT)              // DRAFT | ACTIVE | PAUSED | COMPLETED

  // Schedule
  startDate         DateTime
  endDate           DateTime
  publishDays       String[]                                     // ["sun","mon","tue",...]
  publishTimeMode   String         @default("random")           // "random" | "fixed"
  publishTimeStart  String?                                      // e.g. "09:00"
  publishTimeEnd    String?                                      // e.g. "18:00"

  // Topic Cluster / Pillar Page
  pillarPageUrl     String?                                      // URL of selected pillar page
  mainKeyword       String?                                      // Anchor/seed keyword for the cluster
  pillarEntityId    String?        @db.ObjectId                 // Optional ref to SiteEntity

  // Content Planning
  postsCount        Int                                          // Number of posts to generate
  articleTypes      Json                                         // [{id: string, count: number}]
  contentSettings   Json                                         // {wordCounts, featuredImage, contentImages, ...}
  subjects          String[]       @default([])                 // Selected subject titles
  subjectSuggestions Json?                                       // All AI-generated suggestions [{title, explanation, articleType, intent}]
  keywordIds        String[]       @db.ObjectId @default([])   // DEPRECATED - was keyword-based flow

  // AI Prompts
  textPrompt        String?        @default("")                 // Custom text generation prompt
  imagePrompt       String?        @default("")                 // Custom image generation prompt

  // Generated Content Plan
  generatedPlan     Json?                                        // [{index, title, type, subject, scheduledAt}]
  lastCompletedStep Int?           @default(1)                 // Wizard progress tracker (1-9)

  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  site     Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  contents Content[]

  @@index([siteId])
}

enum CampaignStatus {
  DRAFT      // Wizard in progress
  ACTIVE     // Content being generated/published
  PAUSED     // Manually paused
  COMPLETED  // All content published
}
```

### AI Cache

Locale-aware cache for AI recommendation results (e.g., subject recommendations).

```prisma
model AiCache {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  key       String                          // SHA256 hash of cache identifier
  locale    String                          // Language code ("en", "he")
  content   Json                            // Cached AI output (flexible structure)
  createdAt DateTime @default(now())

  @@unique([key, locale])                   // Same key cached separately per locale
  @@map("ai_cache")
}
```

**Cache Key Format:** `SHA256(recommend:${mainKeyword}:${postsCount}:${sortedSubjectTitles})`
**Usage:** The `recommend-subjects` API checks this cache before calling AI. On cache hit, returns stored recommendation instantly. On miss, generates and stores for future requests.

---

## 10. Internationalization System

### Supported Languages (12)

| Code | Language | Direction |
|------|----------|-----------|
| `en` | English | LTR (default) |
| `he` | Hebrew | RTL |
| `ar` | Arabic | RTL |
| `es` | Spanish | LTR |
| `fr` | French | LTR |
| `de` | German | LTR |
| `pt` | Portuguese | LTR |
| `it` | Italian | LTR |
| `ru` | Russian | LTR |
| `zh` | Chinese | LTR |
| `ja` | Japanese | LTR |
| `ko` | Korean | LTR |

### Data Model

```prisma
model I18nLanguage {
  id       String   @id @default(auto()) @map("_id") @db.ObjectId
  locale   String   @unique         // "en", "he"
  name     String                   // "English", "עברית"
  isRTL    Boolean  @default(false)
  fallback String[] @default([])    // Fallback chain
}

model I18nKey {
  id          String          @id @default(auto()) @map("_id") @db.ObjectId
  key         String          @unique            // "auth.login.title"
  namespace   String                             // "auth", "dashboard", "admin"
  application I18nApplication @default(PLATFORM) // PLATFORM or WEBSITE
  description String?
}

model I18nTranslation {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  keyId       String            @db.ObjectId
  languageId  String            @db.ObjectId
  key         String            // Denormalized for performance
  namespace   String
  locale      String
  value       String            // The actual translation
  status      TranslationStatus @default(APPROVED) // DRAFT or APPROVED
  version     Int               @default(1)
  isLatest    Boolean           @default(true)
}
```

### Implementation

- **Dictionary files**: `i18n/dictionaries/{locale}.json` - Full key/value translation maps
- **Server-side**: `getDictionary(locale)` loads cached dictionary; used in Server Components
- **Client-side**: `useLocale()` hook from `LocaleContext` provides `t()` function, current locale, and text direction
- **Config**: `i18n/config.js` - RTL locale detection, direction helpers
- **Locale detection**: Domain-based (`.co.il` → Hebrew) set via middleware cookie

### Database Translations
Plans, add-ons, coupons, and interview questions support per-language translations stored in the database, managed via admin translation modals.

---

# Part III: Page-by-Page Feature Guide

---

## 11. Authentication & Registration

### Login Page (`app/auth/login/page.jsx`)

- Email and password input fields
- "Login with Google" OAuth button
- Forgot password link
- Redirect to `/dashboard` on successful login
- Session stored as `user_session` cookie

### Registration Flow (`app/auth/register/page.jsx`)

A **7-step progressive registration** process with a visual stepper UI:

#### Step 1 - Registration Form
- Fields: first name, last name, phone, email, password
- Terms of service and privacy policy consent checkbox
- Google OAuth option as an alternative
- Real-time validation on all fields

#### Step 2 - OTP Verification
- User chooses verification method: SMS or email
- 6-digit code entry form
- Resend timer with cooldown
- Dev mode support for testing (auto-fills code)

#### Step 3 - Account Setup
- Create organization/business name
- Generate unique URL slug (subdomain-style)
- Real-time slug availability checking
- Auto-suggestion based on business name

#### Step 4 - Site Interview
- Questionnaire loaded from admin-configured interview flow
- Collects information about the site's purpose, niche, audience, and goals
- Helps the AI agent understand the business for personalized SEO strategy
- Dynamic question types: text, multiple-choice, rating, select, conditional logic

#### Step 5 - Plan Selection
- 3-tier pricing display: Basic, Pro, Enterprise
- Feature comparison table per plan
- Billing period toggle (Monthly / Yearly)
- Coupon code input (if applicable)
- Highlights recommended plan

#### Step 6 - Payment
- CardCom payment gateway integration (supports Israeli Shekel)
- Fields: card number, expiry date, CVV, cardholder name
- Order summary with plan details and total
- Proration calculation for mid-cycle changes
- Free plan option (with coupon) bypasses payment

#### Step 7 - Success
- Confirmation screen with chosen plan details
- "Go to Dashboard" button redirects to the main app

### Accept Invite (`app/accept-invite/`)
- Dedicated page for users accepting team invitations
- Reads `token` from URL query parameter
- Calls verification endpoint to validate token and check expiration (7-day window)
- Displays: account name, inviter name, and assigned role
- **New user path**: Shows registration form (first name, last name, password) - user is created with `registrationStep: COMPLETED`, skipping the normal multi-step registration
- **Existing user path**: Shows login form (password only) - validates credentials, then links existing user to the account
- On success: creates session, sets `lastSelectedAccountId` to the inviting account, redirects to dashboard
- Handles error states: expired token, already accepted, invalid token, suspended membership

---

## 12. Dashboard Layout & Navigation

### Layout (`app/dashboard/layout.jsx`)

Sidebar + header layout:

#### Top Header Bar
- **Logo & Branding** - GhostSEO logo/icon
- **Site Selector Dropdown** - Switch between connected websites (multi-site support)
- **Breadcrumb Navigation** - Shows current section path
- **Global Search Bar** - Quick search across the platform
- **Notifications Bell** - Badge with unread count, opens notifications panel
- **User Menu Dropdown** - Profile, Settings, Help, Logout
- **Theme Toggle** - Dark / light mode
- **Language Selector** - i18n dropdown for UI language

#### Sidebar Navigation

**Always Visible:**
- **Dashboard** - Main command center
- **Agent** - AI insights and actions

**Collapsible Accordion Menus** (only one open at a time):

**Strategy:**
- Site Profile
- Keywords
- Competitor Analysis
- Content Planner
- AI Content Wizard

**Tools (Technical SEO):**
- Redirections
- WebP Converter
- Site Audit

**Entities** (dynamically loaded from discovered entity types):
- Browse Posts / Pages / Products / etc.
- Sitemaps management

**Admin** (SuperAdmin only - hidden for regular users):
- Accounts, Users, Subscriptions, Plans, Addons, Coupons
- Interview Flow, Push Questions, Bot Actions
- Translations, Backlinks, Website Settings

#### Navigation Features
- Accordion behavior - only one section expanded at a time
- Active section highlighting with visual indicator
- Icon per menu item
- Permission-based filtering - items hidden if user lacks access
- Page transition animations (fade effect)
- Ghost Chat popup integration for help/support

---

## 13. Main Dashboard (Command Center)

**Path:** `app/dashboard/page.jsx` → `app/dashboard/components/DashboardContent.jsx`

### Welcome Section
- Site logo (with fallback icon)
- Welcome greeting with site name
- Site URL as clickable link

### KPI Cards (Slider)
Animated metric cards with comparison deltas against the previous period:
- **Visitors** - Total unique visitors
- **Page Views** - Total page views
- **Sessions** - Total sessions
- **New Users** - First-time visitors
- **Engaged Sessions** - Sessions with meaningful engagement (>10s, 2+ pages, or conversion)

Each card shows: current value, trend arrow (↑/↓), percentage change, color-coded indicator (green = positive, red = negative).

### Traffic Chart
Custom SVG multi-line area chart:
- 5 toggleable metrics (each legend item clickable)
- Date presets: 7d, 30d, 90d, 180d, 365d, custom range
- Automatic comparison period calculation
- Hover tooltip with crosshair showing exact values
- Animated sine-wave loading state while fetching

**Data Sources:** Google Analytics 4 (GA4) via OAuth, Google Search Console (GSC) - clicks, impressions, average position (3-day data lag)

### Agent Insights Section
- AI-generated recommendations displayed inline
- Approve/reject buttons per insight
- Quick-execute for automated actions

### Quick Actions
- Generate content from top-performing keywords
- Launch AI Content Wizard
- Run site audit

### Top Keywords Table
- Keywords from GSC sorted by clicks
- "Add to Keywords" action to start tracking
- Position, clicks, impressions per keyword

---

## 14. AI Agent

**Path:** `app/dashboard/agent/page.jsx`
**Engine:** `lib/agent-analysis.js`

The AI Agent is an automated analysis system that monitors every connected site and generates actionable insights. It operates in two phases:
- **Phase 1 (Current):** Automated analysis + read-only insights with human-approved actions
- **Phase 2 (Planned):** Automated fixes with direct WordPress integration

### Data Models

```prisma
model AgentInsight {
  id              String          @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String          @db.ObjectId
  siteId          String          @db.ObjectId
  runId           String?         @db.ObjectId       // Which AgentRun generated this
  batchId         String?                            // Groups insights from the same run
  source          String                             // "cron", "manual", "realtime"
  category        InsightCategory                     // CONTENT, TRAFFIC, KEYWORDS, COMPETITORS, TECHNICAL
  type            InsightType                         // DISCOVERY, SUGGESTION, ACTION, ANALYSIS, ALERT
  title           String
  titleKey        String                              // Translation key for short title (e.g. "cannibalization.title")
  description     String
  descriptionKey  String                              // Translation key for description
  priority        Priority        @default(MEDIUM)    // HIGH, MEDIUM, LOW
  status          InsightStatus   @default(PENDING)   // PENDING, APPROVED, REJECTED, EXECUTED, FAILED, EXPIRED, RESOLVED
  actionType      String?                             // e.g. "update_meta", "add_internal_link", "push_to_wp"
  actionPayload   Json?                               // Data needed to execute an ACTION-type insight
  metadata        Json?                               // Additional context (metrics, URLs, entity IDs)
  executionResult Json?                               // Result from executing the action (fixStatus, actions, etc.)
  approvedAt      DateTime?                           // When user approved
  approvedBy      String?         @db.ObjectId        // Who approved
  rejectedAt      DateTime?                           // When rejected
  executedAt      DateTime?                           // When the action was executed
  resolvedAt      DateTime?                           // Auto-resolve when issue no longer detected
  expiresAt       DateTime?                           // Auto-expire stale insights (30 days)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

model AgentRun {
  id              String          @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String          @db.ObjectId
  siteId          String          @db.ObjectId
  status          RunStatus       @default(RUNNING)   // RUNNING, COMPLETED, FAILED
  insightsCount   Int             @default(0)
  summary         Json?                               // Run summary with per-module results
  startedAt       DateTime        @default(now())
  completedAt     DateTime?
  error           String?
}
```

### 15 Analysis Modules

All 15 modules run in parallel via `Promise.allSettled()` within `runSiteAnalysis()`:

| # | Module | Function | Data Source | Key Thresholds | Insights Generated |
|---|--------|----------|-------------|-----------------|-------------------|
| 1 | **Keywords** | `analyzeKeywords()` | Tracked keywords | Position 4–20, Volume > 10 | `keywordStrikeZone`, `unlinkedKeywords` |
| 2 | **Content** | `analyzeContent()` | Site entities | 120 days since last update | `staleContent`, `missingSeo`, `noindexDetected` |
| 3 | **GSC** | `analyzeGSCData()` | Google Search Console | -10% clicks vs previous period | `trafficDrop`, `lowCtrQueries`, `decliningPages` |
| 4 | **GA** | `analyzeGAData()` | Google Analytics | ±10% visitors | `visitorsDrop`, `trafficGrowth` |
| 5 | **Competitors** | `analyzeCompetitors()` | Competitor scans | Last scan > 30 days | `contentGaps`, `staleCompetitorScans` |
| 6 | **Cannibalization** | `analyzeCannibalization()` | Entities + GSC | 3-layer hybrid detection | Proactive, Reactive, Semantic insights |
| 7 | **Keyword Gaps** | `analyzeNewKeywordOpportunities()` | GSC queries | Impressions ≥ 20, not tracked | `newKeywordOpportunities` |
| 8 | **CTR by Position** | `analyzeCtrByPosition()` | GSC | CTR < 50% of expected for position | `lowCtrForPosition` |
| 9 | **No Traffic** | `analyzeContentWithoutTraffic()` | Entities + GSC | Published 30+ days, zero GSC clicks | `contentWithoutTraffic` |
| 10 | **Weekday/Weekend** | `analyzeWeekendPattern()` | GSC daily data | 40% traffic difference | `weekendTrafficPattern` |
| 11 | **Traffic Spikes** | `analyzeTrafficSpikes()` | GSC daily data | > 2.5 standard deviations from mean | `trafficSpike` |
| 12 | **Impression Gap** | `analyzeImpressionClickGap()` | GSC | Impressions 10%+, gap 15%+ | `impressionClickGap` |
| 13 | **AI Traffic** | `analyzeAITrafficTrend()` | GA referral data | ±30% change | `aiTrafficGrowth`, `aiTrafficDrop` |
| 14 | **Concentration** | `analyzeTrafficConcentration()` | GSC | Top 3 pages = 70%+ of clicks | `trafficConcentration` |
| 15 | **SGE Traffic Theft** | `analyzeSgeTrafficTheft()` | GSC + GA | Position ≤ 5, CTR drop ≥ 35%, stable impressions, GA4 cross-ref | `sgeTrafficTheft` |

### Insight Categories & Types

**Categories:**
| Category | What it monitors |
|----------|-----------------|
| `CONTENT` | Stale content, missing SEO metadata, noindex issues, content gaps |
| `TRAFFIC` | Traffic drops/spikes, declining pages, visitor trends, weekend patterns |
| `KEYWORDS` | Strike zone opportunities (positions 4–20), low CTR, cannibalization, keyword gaps |
| `COMPETITORS` | Content gaps, stale competitor scans, new competitor activity |
| `TECHNICAL` | Missing SEO tags, noindex detection, broken links, Core Web Vitals |

**Types:**
| Type | Behavior |
|------|----------|
| `DISCOVERY` | Found something noteworthy - informational, no action needed |
| `SUGGESTION` | Recommends a specific action for the user to consider |
| `ACTION` | Agent can execute this automatically - requires user approval first |
| `ANALYSIS` | Detailed report with data and comparison metrics |
| `ALERT` | Urgent issue requiring immediate attention (e.g., >50% traffic drop) |

**Priority Classification:**
| Priority | Typical Triggers |
|----------|-----------------|
| `HIGH` / `CRITICAL` | >50% traffic drop, cannibalization, noindex on important pages, missing SEO on 3+ pages |
| `MEDIUM` | Normal traffic declines, content gaps, stale competitor scans, new opportunities |
| `LOW` | Traffic growth, traffic spikes, informational patterns |

### Insight Lifecycle & Status Flow

```
PENDING (default, 30-day expiry)
  ├── → APPROVED (user approves) → EXECUTED (action applied) or FAILED (execution error)
  ├── → REJECTED (user rejects)
  ├── → RESOLVED (auto: issue no longer detected in next run)
  └── → EXPIRED (auto: > 30 days old without action)
```

- **Auto-expire**: Cron job marks all PENDING insights past 30 days as `EXPIRED`
- **Auto-resolve**: When a new analysis run no longer finds the issue, the old insight's status changes to `RESOLVED` with `resolvedAt` timestamp
- **Data refresh**: If an EXECUTED/APPROVED/FAILED insight's dedup key is found again, its data is updated (e.g., keyword position changed)

### Deduplication Algorithm

Each insight has a **dedup key** that prevents duplicate insights across runs:

```
buildDedupKey(titleKey, data):
  - Per-keyword insights → "keywordStrikeZone:{keyword}" (tracked individually)
  - Cannibalization insights → "{titleKey}:{sortedUrls.join('|')}" (sorted URL paths)
  - Aggregate insights → "{titleKey}" (e.g., "staleContent" - one per site)
```

**Per-run deduplication flow:**
1. Generate all new insights from current analysis
2. Build `currentDedupKeys` set from new insights
3. Fetch existing non-terminal insights (PENDING, EXECUTED, APPROVED, FAILED)
4. **Still relevant** (key found in both) → update data if status allows
5. **Stale** (old key not in current) → mark as `RESOLVED`
6. **New** (key not in existing) → insert new insight

**Cannibalization-specific deduplication:**

`cannibalizationKeysOverlap(keyA, keyB)` - Extracts URLs from dedup keys. Returns `true` if **any** URL in keyB exists in keyA's URL set. This handles partial fixes where a 4-URL group becomes a 2-URL group after merging.

**EXECUTED → PENDING reset logic:** When an EXECUTED cannibalization insight overlaps with a newly-detected cluster but the URL set has changed (e.g., partial fix), the existing insight is updated with the new URL set, `status` is reset from `EXECUTED` → `PENDING`, and `executedAt`/`executionResult` are cleared. If no overlap → old insight is marked `RESOLVED`.

### Cannibalization Engine (3-Layer Hybrid + N-URL Groups)

**Path:** `lib/cannibalization-engine.js`

A specialized multi-layer detection system that identifies pages competing for the same search intent. Supports **N-URL groups** (not just pairs) via Union-Find transitive grouping.

#### Constants & Thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| `PROACTIVE_SIMILARITY_THRESHOLD` | `0.60` | Min combined Jaccard similarity to flag a pair |
| `GROUP_MERGE_THRESHOLD` | `50` | Min score for Union-Find transitive grouping |
| `MAX_GROUP_SIZE` | `6` | Safety cap - groups exceeding this are split |
| `HIGH_CONFIDENCE_SCORE` | `60` | Score threshold to bypass AI verification |
| `HIGH_CONFIDENCE_URLS` | `3` | URL count threshold to bypass AI verification |
| `GSC_ROW_LIMIT` | `5000` | Max GSC rows fetched (paginated) |
| `IMPRESSION_SPLIT_THRESHOLD` | `0.25` | Min secondary/primary impression ratio |
| `POSITION_DANCE_THRESHOLD` | `10` | Max position difference between competing pages |
| `AI_VERIFICATION_BATCH_SIZE` | `10` | Max groups sent to AI per batch |

#### Hebrew-Aware Text Normalization

`normalizeText(text)` → `string[]`:
1. NFD normalize + strip diacritics `[\u0300-\u036f]`
2. Lowercase, remove punctuation/specials `[^\p{L}\p{N}\s]`
3. Hebrew plural stemming (≥3 char stems): strip `ים` (masc.) and `ות` (fem.)
4. Filter tokens with length ≤ 1 and stop words

**STOP_WORDS:** 38 Hebrew words + 7 Hebrew prefix letters + 52 English words = ~97 total

#### Similarity Functions

| Function | Formula | Use |
|----------|---------|-----|
| `jaccardSimilarity(A, B)` | `intersection / union` | Title/H1 overall similarity |
| `containmentSimilarity(A, B)` | `intersection / min(|A|, |B|)` | How much shorter text is contained in longer |
| `bigramOverlap(A, B)` | `intersection / min(|A|, |B|)` | Adjacent token-pair overlap |
| `extractBigrams(tokens)` | Adjacent pairs joined with `\|` | Input for bigramOverlap |
| `hasPrefixMatch(A, B)` | First 2 normalized tokens match | Title/H1 prefix detection |

#### Layer 1 - Proactive Detection (no GSC needed)

Compares all published entities pairwise. A pair is flagged if **ANY** condition is true:

| # | Condition | Score Bonus |
|---|-----------|-------------|
| 1 | `combinedSimilarity > 0.60` (avg title+H1 Jaccard) | Base: `similarity × 100` |
| 2 | Title prefix match (first 2 tokens) | +20 |
| 3 | H1 prefix match (first 2 tokens) | +15 |
| 4 | `combinedContainment > 0.40` (avg title+H1) | +15 |
| 5 | `combinedBigram > 0` (any title/H1 bigram overlap) | +20 |
| 6 | Focus keyword match (identical normalized) | +25 |

**Score formula:** `rawScore = combinedSimilarity × 100 + bonuses`, capped at 100.

#### Layer 2 - Reactive GSC Detection

Analyzes GSC query data to find queries where multiple site pages rank:

- **Impression Split:** `secondaryImpressions / primaryImpressions >= 0.25` → score contribution: `min(ratio × 100, 50)`
- **Position Dance:** `|primaryPosition - secondaryPosition| <= 10` → score contribution: `50 - (diff × 5)`
- Pages grouped by query, sorted by impressions descending (primary = most impressions)

#### Deduplication Across Tracks

`deduplicateCandidates(proactive, reactive)`: keyed by sorted normalized URLs. If found by BOTH tracks: score = `avg(scores) + 15`, capped at 100. Merged data includes `gscData`.

#### Union-Find Grouping

Transitively merges pairs into multi-URL groups:
1. **High-score pairs** (score ≥ `GROUP_MERGE_THRESHOLD` = 50) are union-ed
2. **Low-score pairs** become standalone 2-URL groups
3. Groups exceeding `MAX_GROUP_SIZE` = 6 are split by re-grouping using only top-scoring pairs

#### AI Verification & High-Confidence Bypass

Groups with `score >= 60` OR `urls.length >= 3` **bypass AI verification entirely** and are converted directly to issues. High-confidence action: `score >= 70 → MERGE`, else `DIFFERENTIATE`.

Borderline groups (score < 60 AND < 3 URLs) go through `verifyGroupsWithAI()` using `gemini-3.1-pro-preview` model with structured Zod schema, `temperature: 0.3`.

Additional score bonuses: multi-track detection → +10 confidence, 3+ URLs → +5 per extra URL.

#### Orchestrator: `runCannibalizationEngine(site, getValidAccessToken, options)`

1. **Track 1 - Proactive:** Fetch all PUBLISHED entities with enabled types → `detectProactive(entities)`
2. **Track 2 - Reactive GSC:** If GSC connected, fetch 30-day data (paginated up to 5000 rows) → `detectReactiveGsc(gscData)` → scope-filter against enabled entity URLs
3. **Track 3 - Deduplication:** `deduplicateCandidates(proactive, reactive)`
4. **Track 4 - Grouping:** `groupCandidates(deduplicated)` via Union-Find
5. **AI Verification:** Split into high-confidence (bypass) + borderline (AI-verified)
6. **Return:** `{ issues: [...highConfidence, ...aiVerified], stats: { proactive, reactive, deduplicated, grouped, verified } }`

### AI Integration (Gemini)

The agent uses Gemini AI in two specific places:

1. **SEO Relevance Assessment** (`assessSeoRelevance()`):
   - Input: batch of page titles/slugs/URLs
   - Output: per-page `seoPriority` rating (`high` / `medium` / `low` / `skip`)
   - Filters out system pages (privacy, terms, login, etc.) as `skip`
   - Used to prioritize which "missing SEO" pages actually matter

2. **Cannibalization AI Verification** (`verifyWithAI()`):
   - Input: pairs/groups of potential cannibalization issues
   - Output: confidence scores, recommended action, detection signals
   - Validates whether pages truly compete for the same search intent

### Cron Job: `/api/cron/agent-analysis`

**Authentication:** Requires `CRON_SECRET` header

**Run Frequency (by plan):**
- **Basic plan:** Weekly (168 hours between runs)
- **Pro / Business / Enterprise:** Daily (24 hours between runs)

**Execution Flow:**
1. **Expire stale insights**: All PENDING insights past 30 days → `EXPIRED`
2. **Fetch eligible sites**:
   - Account subscription must be `ACTIVE` or `TRIALING`
   - `site.toolSettings.agentConfig.enabled !== false`
   - Last run older than the plan's frequency threshold
3. **Per-site analysis**:
   - Attempt entity sync (with lock mechanism to prevent concurrent syncs)
   - Run all 15 analysis modules in parallel
   - Deduplicate against existing insights
   - Insert only new insights; resolve stale ones
   - Notify account members if `agentConfig.notifyInsights` is enabled
4. **Return**: `{ success, expired, sitesProcessed, results: [{ siteId, insightsCount, error? }] }`

### Manual Trigger: `POST /api/agent/runs`

Users can trigger analysis on-demand from the dashboard:

1. Check if analysis already `RUNNING` for this site → return existing `runId`
2. Create `AgentRun` record (status: `RUNNING`)
3. Fire `runSiteAnalysis()` asynchronously
4. Return immediately: `{ runId, status: "RUNNING" }`
5. Client polls `GET /api/agent/runs?siteId=xxx` every 2 seconds until `COMPLETED`

### Site-Level Configuration

Per-site settings stored in `site.toolSettings.agentConfig`:

```javascript
{
  enabled: true,              // Master enable/disable toggle
  notifyInsights: true,       // Send notifications to account members
  modules: {                  // Per-module enable/disable
    content: true,            // staleContent, missingSeo, noindex
    traffic: true,            // trafficDrop, spikes, concentration, patterns
    keywords: true,           // keywordStrikeZone, lowCtr, gaps
    competitors: true,        // contentGaps, staleScans
    technical: true           // technical issues
  }
}
```

### Insight Data Payloads (Examples)

**`staleContent` (SUGGESTION):**
```json
{
  "category": "CONTENT", "type": "SUGGESTION", "priority": "HIGH",
  "data": {
    "count": 12,
    "oldestPages": [{ "title": "Article A", "slug": "article-a", "updatedAt": "2024-01-01" }]
  }
}
```

**`missingSeo` (ACTION - can be auto-fixed):**
```json
{
  "category": "TECHNICAL", "type": "ACTION", "priority": "HIGH",
  "data": {
    "count": 5,
    "pages": [{ "title": "Service Page", "slug": "service-x", "seoPriority": "high" }]
  },
  "actionType": "generate_meta",
  "actionPayload": { "entityIds": ["entId1", "entId2"] }
}
```

**`cannibalization` (ALERT):**
```json
{
  "category": "CONTENT", "type": "ALERT", "priority": "HIGH",
  "data": {
    "count": 3,
    "issues": [{
      "urls": ["https://example.com/page-a", "https://example.com/page-b"],
      "entities": [{ "title": "Page A", "focusKeyword": "keyword x" }, { "title": "Page B", "focusKeyword": "keyword y" }],
      "confidence": 85,
      "action": "CANONICAL",
      "reason": "Both pages target the same search intent",
      "verification": { "checks": [{ "name": "SHARED_KEYWORDS", "severity": "critical" }] }
    }]
  }
}
```

### ACTION Insight Execution Flow

1. User views insight (type: `ACTION`, status: `PENDING`)
2. User clicks "Fix with AI" → opens FixPreviewModal
3. Modal calls `/api/agent/insights/{id}/fix` with `mode: 'preview'` to generate fix proposals
4. User reviews generated proposals (e.g., meta titles/descriptions, merge instructions)
5. For MERGE: user clicks "Generate Content" → `mode: 'generate'` (background, polls for GENERATED status)
6. User reviews generated content in ContentPreview editor (3 modes: preview, parallel block editor, free TipTap editor)
7. User approves → `mode: 'apply-generated'` (background, polls for COMPLETED status)
8. `MergeActionsSummary` displays results with rich details per action type
9. Status transitions: `PENDING` → `APPROVED` → `EXECUTED`

#### FixPreviewModal (`app/dashboard/components/FixPreviewModal.jsx`)

**ContentPreview** - 3 edit modes:

| Mode | Key | UI |
|------|-----|----|
| Preview | `'preview'` | Raw HTML rendered via `dangerouslySetInnerHTML` |
| Block Editor | `'parallel'` | Parsed HTML into blocks (headings, figures, content). Drag-and-drop reordering. Inline editing per block. |
| Full Editor | `'free'` | TipTap WYSIWYG rich text editor |

**MergeActionsSummary** - Renders 8 action types with icons and rich meta details:

| Action Type | Icon | Rich Detail |
|-------------|------|-------------|
| `post_updated` | ✏️ | Clickable link to updated URL |
| `seo_updated` | 🔍 | Old → new title and description diffs (strikethrough old, green new) |
| `featured_image` | 🖼️ | Thumbnail image preview |
| `redirect_wp` | ↪️ | From → to path as clickable links |
| `redirect_platform` | 📌 | From → to path as clickable links |
| `post_trashed` | 🗑️ | Post title + path |
| `link_healing` | 🔗 | Count of updated links + target URL |
| `gsc_reindex` | 📡 | Clickable URL link |

**Proposals list visibility:** When all proposals are applied (`allApplied === true`), the proposals list is hidden and replaced by MergeActionsSummary + "All changes applied!" + Done button.

**Polling mechanism:** `fixPollingStatus` state (`'GENERATING'` | `'APPLYING'` | `null`). `setInterval(3000)` polls GET `/api/agent/insights/{id}/fix`. On `GENERATED`: shows ContentPreview. On `COMPLETED`: shows MergeActionsSummary, calls `onApplied()`. On `FAILED`: shows error message.

### Cannibalization Fix Execution Flow

**Path:** `lib/agent-fix.js` + `app/api/agent/insights/[id]/fix/route.js`

The fix API (`/api/agent/insights/{id}/fix`) supports a full pipeline for cannibalization resolution, from AI proposal generation through WordPress application.

#### Fix API Modes

| Mode | Sync/Background | Status Transition | Description |
|------|-----------------|-------------------|-------------|
| `preview` | Sync → returns proposals | None | Generate AI fix proposals (action type, SEO changes, merge instructions) |
| `regenerate` | Sync → returns single proposal | None | Regenerate a single item's proposal |
| `generate` | Background (fire & forget) | `→ GENERATING → GENERATED` | Generate full merged content for a MERGE proposal |
| `apply-generated` | Background | `→ APPLYING → COMPLETED` | Apply previously generated merged content to WordPress |
| `apply` | Background (cannib) / Sync (others) | `→ APPLYING → COMPLETED` | Apply approved proposals directly (DIFFERENTIATE, CANONICAL, etc.) |

#### Fix Status Lifecycle

```
null → GENERATING → GENERATED → APPLYING → COMPLETED
                  ↘ FAILED      ↘ FAILED
```

**Concurrency guard:** If `fixStatus` is `GENERATING` or `APPLYING`, returns **409** ("Fix already in progress").

**Polling:** GET handler returns `{ fixStatus, executionResult, insightStatus }`. Client polls every 3 seconds.

#### `runFixInBackground(insightId, mode, executeFn)`
- Executes `executeFn()` asynchronously
- On `generate` success: stores `fixStatus: 'GENERATED'`, `generatedContent: result.post`
- On `apply`/`apply-generated` success: merges results by `postId`, sets `fixStatus: 'COMPLETED'`, `actions: result.actions`. For cannibalization: also sets `insight.status = 'EXECUTED'`
- On error: sets `fixStatus: 'FAILED'`, `fixError: error.message`

#### Fix Types & Actions

| Action | Description | WordPress Effects |
|--------|-------------|-------------------|
| `MERGE` | Combine N pages into one comprehensive post | Update primary post content/SEO, create 301 redirects from all secondaries, trash secondaries, heal internal links, request GSC re-index |
| `CANONICAL` | Set canonical tag on secondary page | Update canonical URL on secondary post via plugin |
| `301_REDIRECT` | Redirect redundant page to authoritative one | Create 301 redirect via plugin, trash secondary post |
| `DIFFERENTIATE` | Give each page distinct focus keywords/angles | Update SEO meta (title, description, focus keyword) on all posts |

#### `generateCannibalizationFix({pages, originalAction, reason, locale})`

Builds a detailed AI prompt with:
- Full content, GSC metrics (top queries), GA4 metrics (sessions, engagement, conversions, top traffic sources)
- Commercial signal detection (affiliate links, sponsored rel) per page
- Protected page detection (`isProtected`)
- **Weighted primary score:** Conversions (5x) > Sessions×Engagement (2x) > GSC clicks+impressions (1x)

**Safety nets:** Protected page always becomes primary. Highest weighted-score page enforced as `primaryPostId`. `pagesChanges` padded to exact page count.

Returns `CannibalizationFixSchema`: `{ recommendedAction, reasoning, pagesChanges[], primaryPostId, mergedPageChanges?, canonicalTarget?, mergeInstructions? }`

#### `generateMergedContent(insight, site, proposal, options)`

1. Fetch full HTML content from WordPress for primary + all secondary posts
2. Build structured AI prompt with merge instructions, article type, word count, language
3. Call `generateStructuredResponse` → `MergedArticleSchema` → `{ title, html, seoTitle, seoDescription, excerpt, contentImageDescriptions[] }`
4. Post-process: truncate SEO fields (60/155 chars), replace stale years
5. If `generateFeaturedImages`: generate image via `generateSingleImage()`, upload to WP
6. If `contentImagesCount > 0`: generate N content images, insert into HTML via `insertContentImages()` (section-aware positioning at intro/H2 boundaries)
7. Return `{ success, post: { title, html, seoTitle, seoDescription, excerpt, focusKeyword, featuredImage, featuredImageAlt, contentImages[], wordCount } }`

#### `applyMergedContent()` - 7-Step Apply Flow (N-Page Support)

Each step produces an entry in the `actions[]` array with `{ type, status, detail, meta }`:

| Step | Action Type | What It Does | Meta Object |
|------|-------------|--------------|-------------|
| 1 | `post_updated` | `updatePost()` with title, HTML content, excerpt on primary | `{ url, title }` |
| 2 | `seo_updated` | `updateSeoData()` with seoTitle, seoDescription, focusKeyword on primary | `{ oldTitle, newTitle, oldDescription, newDescription }` |
| 3 | `featured_image` | Generate AI image + upload + set as featured (if opted in) | `{ imageUrl }` |
| 4 | `redirect_wp` | `createRedirect(site, { source, target, type:'301' })` for **each** secondary → primary | `{ fromUrl, toUrl, fromPath, toPath }` |
| 4b | `redirect_platform` | `prisma.redirection.upsert()` to save redirect in platform DB | `{ fromUrl, toUrl, fromPath, toPath }` |
| 5 | `post_trashed` | `updatePost(site, type, id, { status: 'trash' })` for **each** secondary | `{ url, title }` |
| 6 | `link_healing` | `healInternalLinks()` → `searchReplaceLinks(site, oldPath, newPath)` per trashed URL | `{ count, targetUrl }` |
| 7 | `gsc_reindex` | `requestGscReindex()` → POST to Google Indexing API with `URL_UPDATED` | `{ url }` |

Steps 4–6 iterate over **all** secondary pages (not just one pair).

#### `healInternalLinks(site, trashedUrls, primaryUrl)`
For each trashed URL: extracts pathname, calls `searchReplaceLinks(site, trashedPath, primaryPath)` which bulk-replaces all internal links across the entire WordPress site. Non-fatal - the 301 redirect serves as fallback.

#### `requestGscReindex(accessToken, pageUrl)`
POST to `https://indexing.googleapis.com/v3/urlNotifications:publish` with `{ url, type: 'URL_UPDATED' }`. Returns `{ success, detail }`. 403 = Indexing API scope not available, suggests manual re-indexing.

**Credit Cost:** `CANNIBALIZATION_FIX` = 50 credits per fix execution

### Content Differentiation Engine (Asynchronous AI Resolving)

**Path:** `lib/actions/content-differentiation.js`

A specialized asynchronous engine that resolves cannibalization by giving each page a unique focus intent. Unlike the synchronous MERGE/CANONICAL/301 flows, Content Differentiation runs as a background job, enabling the user to continue working while AI processes N pages.

#### Architecture: Asynchronous Non-Blocking Flow

```
User selects N pages → POST /api/content-differentiation
  ↓
BackgroundJob created (status: PENDING → PROCESSING)
  ↓
processDifferentiationJob() runs async (fire-and-forget Promise)
  ↓
Client polls GET /api/background-jobs/{id} every 3 seconds
  ↓
BackgroundJobWidget shows progress (0% → 100%)
  ↓
On COMPLETED → DifferentiationModal opens with surgical diff viewer
  ↓
User reviews Alpha Page + supporting page diffs
  ↓
"Approve & Execute" → POST /api/content-differentiation/execute
  ↓
Deduct credits (25/page) → Update SiteEntity → Push to WordPress
```

#### BackgroundJob Model

```prisma
model BackgroundJob {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  accountId   String   @db.ObjectId
  siteId      String?  @db.ObjectId
  type        String                         // "CONTENT_DIFFERENTIATION"
  status      String   @default("PENDING")   // PENDING → PROCESSING → COMPLETED / FAILED
  progress    Int      @default(0)           // 0–100 percentage
  message     String?                        // Human-readable status message
  inputData   Json?                          // Original request payload
  resultData  Json?                          // Full result (alpha page, supporting pages, diffs)
  error       String?                        // Error message on FAILED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, status])
  @@index([accountId, status])
  @@index([status, createdAt])
}
```

#### Alpha Page Algorithm

Selects the authoritative page that keeps its current focus intent. All other pages are re-differentiated around it.

**Selection Hierarchy (first valid wins):**

| Priority | Signal | Source | Logic |
|----------|--------|--------|-------|
| 1 | **GSC Clicks** | Google Search Console | Page with most clicks in last 28 days |
| 2 | **GA Traffic** | Google Analytics | Page with most sessions |
| 3 | **Internal Links** | SiteEntity metadata | Highest `internalLinksCount` |
| 4 | **Content Length** | SiteEntity metadata | Longest `contentLength` |

If all signals are equal, the first page in the input list wins.

#### 3-Layer Anti-Cannibalization Safety Net

Ensures every newly generated intent is unique across the entire site, not just the current group.

| Layer | Name | Mechanism | When |
|-------|------|-----------|------|
| 1 | **Pre-Check Against DB** | `preCheckIntent()` - queries all SiteEntity records for the site, checks if any existing page's `seoTitle`, `focusKeyword`, or `slug` matches the proposed new intent (normalized word overlap) | Before AI generation |
| 2 | **Negative Prompting** | Injects a `BLACKLIST` of all existing focus intents into the AI prompt. AI is instructed: "Do NOT use or rephrase any blacklisted intent" | During AI generation |
| 3 | **Post-Generation Validation** | `validateNoOverlap()` - tokenizes the generated H1 and compares against every blacklisted intent using word overlap. Threshold: >50% overlap = rejection → retry with higher temperature | After AI generation |

**Retry Logic:** Max 2 retries (`MAX_AI_RETRIES`). Temperature increases on each retry (+0.1) to encourage more creative differentiation. If all retries fail, the page result includes `error: "Could not generate unique intent"`.

#### AI Generation Pipeline

For each supporting page (not the alpha):

1. **Build Blacklist:** All existing focus intents from SiteEntity DB + all already-generated intents from previous pages in this batch
2. **Call Gemini AI** (`gemini-3.1-pro-preview`, structured output via Zod):
   - Input: supporting page content, alpha page content, blacklist, site language
   - Output: `DifferentiationOutputSchema` →
     - `newFocusIntent` - unique keyword/angle
     - `newH1` - rewritten H1 reflecting new intent
     - `contentDiffs[]` - array of `{ location, oldSnippet, newSnippet }` paragraph-level changes
     - `internalLinkSentence` - suggested sentence linking back to alpha page
3. **Validate:** Layer 3 overlap check against blacklist
4. **Update Progress:** Job progress incremented per page (30% → 80% range)

**Credit Cost:** `CREDITS_PER_PAGE` = 25 credits per supporting page

#### Surgical Diff Modal (`DifferentiationModal.jsx`)

An 80vw × 80vh modal rendered via `createPortal` showing the full differentiation result:

| Section | Visual Treatment |
|---------|-----------------|
| **Alpha Page Box** | 👑 Crown icon, golden `#f59e0b` border, displays current H1 and focus intent - unchanged |
| **Supporting Pages** | Accordion (expand/collapse per page) |
| **H1 Diff** | Old H1 in red strikethrough → New H1 in green |
| **Content Diffs** | Per-paragraph: "Old" badge (red bg) + "New" badge (green bg) with location label |
| **Internal Link** | Preview of suggested linking sentence to alpha page |
| **Footer** | "Approve & Execute Fixes (X Credits)" button - calculates total from supporting page count × 25 |

**States:**
- **Processing:** Centered spinner + progress bar + status message (mirrors BackgroundJobWidget)
- **Completed:** Full diff view with approve button
- **Failed:** Error message with dismiss option
- **Already Executed:** Green banner replacing the approve button

#### Background Job Widget (`BackgroundJobWidget.jsx`)

Sticky sidebar widget displayed in the AI Agent dashboard area:

| State | Visual |
|-------|--------|
| **Running** | Spinner animation + purple gradient progress bar + status message |
| **Completed** | ✅ checkmark + "Review Results" button (opens DifferentiationModal) |
| **Failed** | ❌ icon + error message |

#### Completion Toast (`DifferentiationToast.jsx`)

Global toast notification (fixed bottom-right, RTL: bottom-left):
- Triggers when background job transitions to `COMPLETED`
- Auto-dismisses after 10 seconds
- Click opens the DifferentiationModal for review
- Slide-in animation via CSS keyframes

#### Execution Flow (`executeDifferentiationFixes`)

1. **Validate:** Fetch job, verify `COMPLETED` status, verify user authorization
2. **Deduct Credits:** `deductAiCredits({ amount: supportingPages × 25, source: 'CONTENT_DIFFERENTIATION' })`
3. **Per Supporting Page:**
   - Update `SiteEntity` in DB: `focusKeyword`, `seoTitle` (from new H1)
   - Push to WordPress: `updateSeoData(site, type, wpId, { seo_title, focus_keyword })`
4. **Mark Job:** `resultData.executed = true`, `resultData.executedAt = timestamp`

#### Polling Hook (`useBackgroundJobPolling`)

```javascript
const { job, isLoading, error, refetch } = useBackgroundJobPolling(jobId);
// Polls GET /api/background-jobs/{id} every 3 seconds
// Auto-stops when status is COMPLETED or FAILED
// Returns null job if no jobId provided
```

### Entity Check Before Analysis

Before running analysis, the system checks that the site has synced entities (content types from WordPress). If no entities exist:
1. `runAnalysis()` triggers entity count check via API
2. If count is 0, `EntitiesRequiredModal` appears guiding the user to:
   - Step 1: Navigate to My Websites to verify plugin connection
   - Step 2: Navigate to Entities page to sync content types
3. Analysis is blocked until entities are available

### API Endpoints

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/api/agent/insights` | List insights (paginated, filterable by category/status/priority) | `{ items, hasMore, totalCount, pendingCount, nextCursor }` |
| PATCH | `/api/agent/insights/[id]` | Update insight status (approve/reject/dismiss) | Updated insight |
| POST | `/api/agent/insights/[id]/fix` | Generate fix proposals for ACTION insight | Fix preview data |
| POST | `/api/agent/execute` | Execute an approved ACTION insight | `{ success, result }` |
| GET | `/api/agent/runs` | List recent analysis runs for a site | `{ runs: [] }` |
| POST | `/api/agent/runs` | Trigger manual analysis | `{ runId, status: "RUNNING" }` |
| POST | `/api/agent/entity-lookup` | Map URLs to entity records (resolve URLs to entity IDs/titles) | `{ urlMap: { ... } }` |

### Dashboard UI

**Stats Bar:** Total insights generated, pending review count, recent analysis runs.

**Insight Cards:** Collapsible rows with expandable detail views. Each card shows: title, description, source, relative timestamp, priority badge (High/Medium/Low), category icon, approval state.

**Detail View Types:**
- **Single-item insights:** Tables (keyword position, page metrics, competitor data)
- **Cannibalization:** Multi-panel competing pages with confidence badges and recommended actions
- **Stat summaries:** Change percentages, comparison period data
- **Entity integration:** URLs resolved to entity IDs/titles with click-through edit links

**Filtering:**
- **By category:** All, Technical, Content, Link Building, Competitor
- **By status:** Pending, Approved, Rejected, Executed
- **By priority:** High, Medium, Low

**Actions per Insight:**
- **Approve** - Accept the AI recommendation
- **Reject** - Discard the recommendation
- **Execute** / **Fix with AI** - Generate and apply fixes (triggers FixPreviewModal)

**Run Analysis Button:** Manual trigger with loading state; polls for completion every 2 seconds.

### Internationalization

All user-visible strings use i18n translation keys:
- `agent.insights.{insightType}.title` - Insight titles (e.g., "Stale Content Found")
- `agent.insights.{insightType}.description` - Insight descriptions
- `agent.categories.{CATEGORY}` - Category labels
- `agent.types.{TYPE}` - Type labels
- `agent.priorities.{PRIORITY}` - Priority labels
- `agent.detailLabels.{field}` - Detail field labels (e.g., "Search Volume")

---

## 15. Strategy Section

**Path:** `app/dashboard/strategy/`

### Strategy Hub (`page.jsx`)
Central overview page with 5 feature cards linking to sub-sections.

### 15a. Site Profile (`strategy/site-profile/`)
- Multi-step interview form
- Collects niche, audience, goals, business context
- Progress indicator showing completion percentage
- Status: Pending → In Progress → Complete
- Feeds the AI agent's analysis engine

### 15b. Keywords (`strategy/keywords/`)
- **Manual addition** + **GSC import** (bulk)
- Per-keyword: position, search volume, difficulty, CTR, impressions
- Rank tracking over time (historical chart)
- "Add to Content Planner" action
- AI-powered keyword suggestions

### 15c. Competitor Analysis (`strategy/competitors/`)
- Manual entry + AI discovery (via SERP)
- Per-competitor: word count, page speed (ms), image count, last scan
- Shared keywords, content gap identification
- Actions: Scan, Rescan, Remove
- Scanning status indicators

### 15d. Content Planner (`strategy/content-planner/`)

**Views:** Calendar view (monthly/weekly) and List view (tabular with sorting/filtering)

**Campaign Management:** Named campaigns with date ranges, publishing schedule (days, time), content assignment.

**Content Pipeline:**
```
DRAFT → SCHEDULED → PROCESSING → READY_TO_PUBLISH → PUBLISHED
                         ↓
                       FAILED
```

**Filtering:** By campaign, date range, status, content type.
**Bulk Actions:** Batch reschedule, delete, reassign.

### 15e. AI Content Wizard (`strategy/ai-content-wizard/`)

A **9-step topic-cluster wizard** for bulk AI content generation built around a pillar page strategy.

**Architecture:** Server component (`page.jsx`) loads translations via `getTranslations()` + `getLocaleInfo()` and passes them to the `WizardContent` client component. Step components live in `components/steps/`. Configuration constants are in `wizardConfig.js`.

**File Structure:**
```
ai-content-wizard/
  ├── page.jsx                  // Server component - loads i18n, passes translations
  ├── page.module.css
  ├── wizardConfig.js           // WIZARD_STEPS, INITIAL_WIZARD_STATE, ARTICLE_TYPES, translateIntent()
  ├── loading.jsx
  └── components/
      ├── WizardContent.jsx     // Client orchestrator - manages wizard state, step navigation
      └── steps/
          ├── CampaignStep.jsx      (Step 1)
          ├── PillarPageStep.jsx    (Step 2)
          ├── MainKeywordStep.jsx   (Step 3)
          ├── PostCountStep.jsx     (Step 4)
          ├── ArticleTypesStep.jsx  (Step 5 - merged article types + content settings)
          ├── SubjectsStep.jsx      (Step 6)
          ├── PromptsStep.jsx       (Step 7)
          ├── ScheduleStep.jsx      (Step 8)
          └── SummaryStep.jsx       (Step 9)
```

#### Wizard Steps

| Step | Key | Icon | Component | Description |
|------|-----|------|-----------|-------------|
| 1 | `campaign` | FolderOpen | CampaignStep | Create new or select existing campaign |
| 2 | `pillarPage` | Globe | PillarPageStep | Select anchor/pillar page from ALL entity types (posts, pages, products, etc.) or enter a custom URL. Entity type badges, decoded Hebrew URLs (via `decodeUrl()`) |
| 3 | `mainKeyword` | Search | MainKeywordStep | Enter main keyword for the topic cluster. AI auto-suggests 3 keywords based on pillar page analysis (title, slug, excerpt, SEO data) via `/api/campaigns/suggest-keyword` |
| 4 | `postCount` | Hash | PostCountStep | Number of articles to generate |
| 5 | `articleTypes` | FileText | ArticleTypesStep | Merged step - mix of content types (SEO Article, Blog Post, Guide, How-To, Listicle, Comparison, Review, News, Tutorial, Case Study) + word count range, featured image toggle, content images toggle, custom prompt |
| 6 | `subjects` | BookOpen | SubjectsStep | AI generates 3× `postsCount` subject suggestions via **SSE streaming**. AI auto-recommends the best combination and auto-selects them. Shows translated intent badges. Explanation banner with AI reasoning |
| 7 | `prompts` | MessageSquare | PromptsStep | Custom text and image generation prompts for the AI |
| 8 | `schedule` | Calendar | ScheduleStep | Start/end dates, publishing days (checkboxes), publish time mode (fixed time or random range) |
| 9 | `summary` | Sparkles | SummaryStep | Review all settings - decoded Hebrew URLs, translated intent badges, article type distribution, schedule preview |

#### Topic Cluster Architecture

The wizard is built around the **pillar page → topic cluster** strategy:
1. User selects an existing content piece (from any entity type) or enters a custom URL as the **pillar page**
2. AI suggests **main keywords** based on the pillar page's title, slug, excerpt, and SEO metadata
3. AI generates **subject ideas** that form a content cluster around the pillar page, ensuring each piece targets a distinct search intent
4. **3-layer anti-cannibalization** prevents overlap with existing site content and other campaigns

#### Key Features

**AI Keyword Suggestions (Step 3):**
- On mount, calls `POST /api/campaigns/suggest-keyword` with pillar page context
- Returns 3 ranked keyword suggestions with explanations
- User can click a suggestion to auto-fill or type manually

**SSE Streaming Subject Generation (Step 6):**
- Calls `POST /api/campaigns/generate-subjects` which uses Vercel AI SDK `streamText()` + `Output.object()`
- Subjects stream incrementally via Server-Sent Events - each suggestion appears in the UI as soon as all 4 fields are complete (title, explanation, articleType, intent)
- Generates 3× `postsCount` options for user to choose from
- Sends `[DONE]` signal on completion

**AI Auto-Recommendation (Step 6):**
- After streaming completes, automatically calls `POST /api/campaigns/recommend-subjects`
- AI picks the best `postsCount` subjects from the full list and explains why
- Recommended subjects are auto-selected with checkmarks
- Explanation displayed in a banner with AI icon
- Results cached per locale in `AiCache` (SHA256 key + locale) - re-fetches on locale change

**Anti-Cannibalization (3 Layers in generate-subjects):**
1. **Data Fetching Layer** - Fetches all published entities on the site + all active/draft campaign subjects to build existing content context
2. **Prompt Engineering Layer** - Strict rules: no semantic overlap with existing/planned content, intra-cluster intent separation, relevance to pillar page
3. **Output Verification Layer** - Each suggestion includes an `intent` field (e.g., "Informational - How-to", "Transactional - Comparison") for separation verification

**Intent Translation System:**
- `translateIntent(intentStr, intentsMap)` in `wizardConfig.js` splits intent strings by `' - '` and translates each part using the locale's intents map (30 terms in EN/HE)
- Used in SubjectsStep (3 display points) and SummaryStep (2 display points)
- Intent maps loaded from `dictionary.aiWizard.subjects.intents` via `getLocaleInfo()`

**Hebrew URL Decoding:**
- `decodeUrl()` helper decodes percent-encoded Hebrew URLs throughout the wizard
- Applied in PillarPageStep dropdown, SubjectsStep, and SummaryStep

#### Wizard State (`INITIAL_WIZARD_STATE`)

```javascript
{
  campaignId: null, campaignName: '', campaignColor: '#6366f1',
  campaignStatus: 'DRAFT', isNewCampaign: true,
  pillarPageUrl: '', pillarEntityId: null,
  mainKeyword: '',
  postsCount: 4,
  articleTypes: [{ id: 'SEO', count: 4 }],
  contentSettings: {},
  subjects: [], subjectSuggestions: [],
  textPrompt: '', imagePrompt: '',
  startDate: '', endDate: '',
  publishDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
  publishTimeMode: 'random', publishTimeStart: '09:00', publishTimeEnd: '18:00',
  generatedPlan: null, planNeedsRegeneration: false,
  selectedKeywordIds: [], manualKeywords: [],  // DEPRECATED - backward compat
}
```

#### Article Types Configuration

| Type | Min Words | Max Words |
|------|-----------|-----------|
| SEO Article | 1,500 | 3,000 |
| Blog Post | 800 | 2,000 |
| Guide | 2,000 | 5,000 |
| How-To | 1,000 | 2,500 |
| Listicle | 800 | 2,000 |
| Comparison | 1,200 | 3,000 |
| Review | 1,000 | 2,500 |
| News | 400 | 1,000 |
| Tutorial | 1,500 | 4,000 |
| Case Study | 1,200 | 3,000 |

---

## 16. Technical SEO Tools

**Path:** `app/dashboard/technical-seo/`

### 16a. Redirections (`technical-seo/redirections/`)

Full redirect management with WordPress plugin sync.

**Redirect Form:** Source URL, Target URL, type (301/302/307), CRUD actions.

**Redirect Table:** Source, target, status code, hit count, active/inactive toggle, edit/delete.

**Stats:** Total redirects, active redirects, total hits.

**Plugin Integration:**
- Auto-detects existing WP redirect plugins (Redirection, Yoast Premium, Rank Math, Safe Redirect Manager, Simple 301 Redirects)
- Import from detected plugins
- Bidirectional sync (WP admin ↔ platform via webhooks)

**URL Normalization:**
- Percent-encoded URLs auto-decoded to Unicode (e.g., Hebrew)
- Trailing slashes stripped for consistent matching
- Duplicate detection is trailing-slash agnostic

### 16b. WebP Converter (`technical-seo/webp-converter/`)

**Stats:** Total images, non-WebP count, converted count, queue status.

**Auto-Conversion Toggle:** Enable/disable for all new uploads.

**Batch Conversion:** Checkboxes, select all, options (keep backups, flush cache, replace URLs in content), progress bar.

**Conversion History:** Past conversions, revert capability, date and count.

**AI Image Optimizer:** Auto-generate alt text, optimize meta descriptions, image redirect tracking.

### 16c. Site Audit (`technical-seo/site-audit/`)

**Performance Score:** Circular animated SVG gauge (0–100), color gradient red → yellow → green.

**Core Web Vitals (6 Metrics):**

| Metric | Target | Description |
|--------|--------|-------------|
| LCP | ≤ 2.5s | Largest Contentful Paint |
| FID | ≤ 100ms | First Input Delay |
| CLS | ≤ 0.1 | Cumulative Layout Shift |
| FCP | ≤ 1.8s | First Contentful Paint |
| TTI | ≤ 3.8s | Time to Interactive |
| TBT | ≤ 200ms | Total Blocking Time |

**Performance Trend:** 4-week line chart with trending badge.

**Recommendations:** Three severity levels - Warning (auto-fixable with "Apply Fix" button), Info (should-fix), Suggestion (nice-to-have).

---

## 17. Automations

**Path:** `app/dashboard/automations/page.jsx`

### Stats Grid (4 KPIs)
| KPI | Description |
|-----|-------------|
| Active Automations | Currently active count |
| Tasks Completed | Total tasks executed |
| Running Today | Tasks executed today |
| Success Rate | Percentage without errors |

### 4 Pre-Configured Automations
1. **Content Publishing** - Auto-publishes scheduled content to WordPress
2. **Internal Linking** - Auto-adds relevant internal links to content
3. **Image Optimization** - Compresses and optimizes images
4. **Meta Updates** - Auto-updates meta tags using AI

Each has: tasks completed count, last run time, active/inactive toggle.

### Activity Log
Timestamped entries with success/error status, action description, relative time.

---

## 18. Entities Management

**Path:** `app/dashboard/entities/page.jsx`

### Platform Detection Card
- Auto-detects WordPress or other CMS
- Shows platform name, version, plugin version, last ping

### Entity Type Discovery Card
- Discover from sitemap (auto or manual URL)
- Custom crawling for non-standard sites
- Toggle checkboxes per type, custom label editing
- Conflict warnings for reserved names

### Populate & Sync Card
- **"Save and Populate"** - Sync from WordPress
- **"Discover by Crawling"** - Find new entity types
- Real-time progress (percentage bar, current message, stop button)
- Sync lock (prevents concurrent syncs)
- Population report: created / updated / unchanged

### Browse Entities
- Navigate by type (Posts, Pages, Products, etc.)
- List, edit, delete, bulk actions

### Sitemaps Management
- Discovered sitemaps, item count, manage custom URLs

---

## 19. My Websites

**Path:** `app/dashboard/my-websites/page.jsx`

### Website Grid
Each card: site name, domain, connection status (Connected/Disconnected/Error), platform icon, quick-settings, content count, last update, plan limit indicators, last sync.

### Actions
- Add New Website, Site Connection Setup, Plan Switching, Site Deletion (with confirmation)

---

## 20. Link Building & Backlinks Marketplace

### Link Building (`app/dashboard/link-building/page.jsx`)

**Stats Cards (4):** Total Backlinks, Referring Domains, Domain Authority, New Opportunities - each with trend indicator.

**Link Opportunities:** Domain list with category tags, match score (0–100%), level badges, "Contact" button, sortable.

**Recent Backlinks Table:** Source domain, DA, link type (guest post/mention/listicle/review), date acquired.

### Backlinks Marketplace (`app/dashboard/backlinks/page.jsx`)

A marketplace where users can **buy** external backlinks from other sites and **sell** link placements on their own connected sites.

#### Data Models

```prisma
model BacklinkListing {
  id                String             @id @default(auto()) @map("_id") @db.ObjectId
  siteId            String?            @db.ObjectId       // Source site (null = platform listing)
  accountId         String?            @db.ObjectId
  publisherType     PublisherType                          // PLATFORM or USER
  domain            String
  domainAuthority   Float?                                 // DA score
  domainRating      Float?                                 // DR score
  estimatedTraffic  Int?                                   // Monthly organic traffic
  categories        String[]                               // Niche categories
  linkType          LinkType           @default(DOFOLLOW)  // DOFOLLOW or NOFOLLOW
  price             Float?                                 // USD price (null = free with plan)
  aiCreditsPrice    Int?                                   // Alternative: pay with AI credits
  maxSlots          Int?                                   // Inventory limit (null = unlimited)
  usedSlots         Int                @default(0)
  status            ListingStatus      @default(ACTIVE)    // ACTIVE, PAUSED, SOLD_OUT, DRAFT, ARCHIVED
  description       String?
  guidelines        String?                                // Content requirements for buyers
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  purchases         BacklinkPurchase[]
}

model BacklinkPurchase {
  id              String              @id @default(auto()) @map("_id") @db.ObjectId
  listingId       String              @db.ObjectId
  buyerAccountId  String              @db.ObjectId
  buyerSiteId     String              @db.ObjectId
  targetUrl       String                                   // Page to receive the backlink
  anchorText      String?                                  // Preferred anchor text
  paymentMethod   BacklinkPaymentMethod                    // PLAN_ALLOCATION, DIRECT, AI_CREDITS
  amountPaid      Float?                                   // Amount in currency (if DIRECT)
  creditsPaid     Int?                                     // Credits deducted (if AI_CREDITS)
  status          PurchaseStatus      @default(PENDING)    // PENDING → APPROVED → PUBLISHED (or REJECTED)
  rejectionReason String?                                  // If rejected by seller/admin
  publishedUrl    String?                                  // Final live URL of the backlink
  publishedAt     DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}
```

#### Publisher Types
- **PLATFORM**: Listings created by GhostSEO admins (curated marketplace)
- **USER**: Listings created by users from their own connected sites (peer-to-peer marketplace)

#### Payment Methods
- **PLAN_ALLOCATION**: Monthly backlink quota included in the user's subscription plan
- **DIRECT**: Direct payment via CardCom (standard checkout)
- **AI_CREDITS**: Pay with AI credits instead of money

#### Fulfillment Workflow
1. **PENDING** - Buyer places order (selects listing, target URL, anchor text)
2. **APPROVED** - Seller/admin reviews and approves the request
3. **PUBLISHED** - Link is live on the seller's site (verified URL stored)
4. **REJECTED** - Seller/admin declines with reason; refund capability

#### SEO Metrics
Each listing displays: Domain Authority (DA), Domain Rating (DR), Estimated Monthly Traffic - fetched via `GET /api/backlinks/domain-metrics`

#### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backlinks` | Browse marketplace listings |
| POST | `/api/backlinks` | Create a listing (user's site) |
| GET | `/api/backlinks/my-sites` | User's own site listings |
| GET | `/api/backlinks/domain-metrics` | SEO metrics for a domain |
| POST | `/api/backlinks/purchase` | Purchase a backlink |

#### Admin Side (`admin/backlinks/`)
- Manage all listings (platform + user-created)
- Review and approve/reject purchases
- Monitor fulfillment pipeline

---

## 21. Notifications

**Path:** `app/dashboard/notifications/page.jsx`

### Notification Types
| Type | Icon | Description |
|------|------|-------------|
| `audit_complete` | Activity | Site audit finished |
| `audit_failed` | AlertCircle | Audit error |
| `content` | FileText | Content published/created/failed |
| `ai` | Sparkles | AI operation status |
| `alert` | AlertCircle | System alerts |
| `success` | TrendingUp | Success confirmations |

### Features
- Type icon with color coding, title, description, relative time, read/unread indicator
- Actions: Mark read, delete, mark all read, delete all
- Filtering: All, Unread, Read
- Pagination: 20 per page, load more
- Real-time updates via context provider (header bell badge)

---

## 22. Settings

**Path:** `app/dashboard/settings/page.jsx`

Split into **Website Settings** (per-site) and **Account Settings** (per-account).

### Website Settings (8 Tabs)

| Tab | Fields |
|-----|--------|
| **General** | Site URL, name, language, timezone, plugin status, maintenance mode |
| **AI Configuration** | Model selection, max tokens/month, temperature slider, custom prompts (text + image), auto-optimization, content safety |
| **Scheduling** | Cron toggle, concurrent workers (default: 3), retry attempts (default: 3), job frequency |
| **Notifications** | Email toggles (new content, weekly reports, errors, marketing), Slack webhook URL + toggle |
| **SEO Settings** | Site title (meta), meta description, OG image, toggles (sitemap, robots.txt, schema markup) |
| **Integrations** | Third-party API keys, connection status, Google Analytics + Search Console OAuth |
| **Agent Config** | Frequency (basic=weekly, pro/enterprise=daily), enabled toggle, analysis depth |
| **Team** | Members table (name, email, role, status), invite new member |

### Account Settings (8 Tabs)

| Tab | Fields |
|-----|--------|
| **Profile** | Name, email, phone, profile picture, timezone, language |
| **Users** | Full team CRUD, role assignment, activate/deactivate |
| **Roles** | Create/edit/delete custom roles with permission sets |
| **Permissions** | Fine-grained per-role management (View, Create, Edit, Delete, Publish) |
| **Subscription** | Current plan, billing cycle, auto-renewal, upgrade/downgrade |
| **Credits** | Balance, monthly allotment, overage pricing, usage history |
| **Addons** | Available add-ons, pricing, purchase, active purchases |
| **Account** | Org name, contact info, timezone, data export, account deletion |

---

## 23. Admin Panel (SuperAdmin)

**Path:** `app/dashboard/admin/` - Only visible to `isSuperAdmin` users.

### 23a. Users (`admin/users/`)

**Stats:** Total users, Active users, Super admins count.

**Table:** Searchable by name/email. Columns: avatar, name, email, auth method, super admin badge, status, last login, actions. Paginated.

**View Modal:** Read-only details, verification status, language/currency, associated accounts.

**Edit Modal:** All fields editable, password reset, auth method dropdown, language/currency, registration step override, super admin checkbox, active/verified toggles, account association.

**Protection:** Critical admin accounts cannot be deleted.

### 23b. Plans (`admin/plans/`)

**Stats:** Total plans, Active plans, Popular plans.

**Table:** Name, price, billing period, feature count, status. Actions: edit, duplicate, delete, translate.

**Edit Modal:** Name, price, billing period, description, features list (add/remove/reorder), limitations list (predefined keys with values), active/inactive toggle.

**Translation Modal:** Per-language translation of plan name, description, each feature.

### 23c. Subscriptions (`admin/subscriptions/`)

**Stats (7):** Total, Active, Trialing, Canceled, Past Due, MRR, ARR.

**Table:** Account name, plan, status, start date, next billing, MRR. Actions: view, edit, cancel/reactivate.

**View Modal:** Full details, plan features/limitations, billing dates, usage stats.

**Edit Modal:** Change plan, effective date, proration checkbox.

**Cancel/Reactivate:** Cancellation with reason/refund options; reactivation with plan selection.

### 23d. Coupons (`admin/coupons/`)

**Stats:** Total, Active, Total redemptions, Active redemptions.

**Table:** Code, description, discount type/value, max redemptions, used count, expiry, status.

**Edit Modal:** Code, description, discount type (percentage/fixed), value, max redemptions, max per account, valid from/until, duration months, applicable plans, **limitation overrides** (grant extra sites/members/credits), **extra features**, active checkbox.

**Translation Modal:** Per-language description, override labels, feature labels.

### 23e. Interview Flow (`admin/interview-flow/`)

**Stats:** Total questions, Active questions, Total bot actions, Preset action count.

**Question Table:** Drag-reorderable. Columns: order, question text, type, status, bot action count, actions.

**Edit Modal (3 Tabs):**
- **Basic:** Question text, type, description, active, custom styling
- **Actions:** Bot actions triggered after answer (add/remove/reorder)
- **Options:** Answer choices for multiple-choice, conditional logic per option

### 23f. Other Admin Pages
- **Accounts** - Manage business accounts
- **Addons** - Manage add-on products with pricing/features
- **Bot Actions** - Configure AI agent action templates
- **Push Questions** - Distribute interview questions
- **Translations** - Manage UI translation strings across languages
- **Website Settings** - Site-specific admin configuration
- **Backlinks** - Admin backlink management

---

# Part IV: Systems & Integration

---

## 24. WordPress Plugin System

The GhostSEO platform integrates with WordPress via a **custom plugin that is dynamically generated per-site**. Each downloaded plugin ZIP is unique - it contains site-specific credentials (Site ID, Site Key, Site Secret) baked directly into the code. The plugin enables bidirectional communication: the platform pushes content to WordPress, and WordPress pushes real-time entity/redirect changes back to the platform.

### 24a. Plugin Architecture Overview

**11 PHP classes** working together via WordPress hooks and a REST API namespace (`ghost-post/v1`):

| Class | File | Purpose |
|-------|------|---------|
| `Ghost_Post` | `class-ghost-post.php` | Main orchestrator - initializes all managers, registers REST routes, admin menu |
| `GP_API_Handler` | `class-gp-api-handler.php` | Registers 30+ REST API endpoints, routes requests to appropriate managers |
| `GP_Request_Validator` | `class-gp-request-validator.php` | HMAC-SHA256 signature validation with timestamp replay protection |
| `GP_Content_Manager` | `class-gp-content-manager.php` | Posts/Pages CRUD - get_items, get_item, create, update, delete |
| `GP_Media_Manager` | `class-gp-media-manager.php` | Image upload, WebP/AVIF auto-conversion, AI image optimization, queue processing |
| `GP_SEO_Manager` | `class-gp-seo-manager.php` | Yoast + RankMath meta extraction and updates (title, description, OG, Twitter, keywords) |
| `GP_CPT_Manager` | `class-gp-cpt-manager.php` | Custom Post Types CRUD - get_post_types, create/read/update/delete |
| `GP_ACF_Manager` | `class-gp-acf-manager.php` | Advanced Custom Fields read/write - detects ACF, reads field groups and values |
| `GP_Entity_Sync` | `class-gp-entity-sync.php` | Real-time webhook push on post create/update/trash/delete to platform |
| `GP_Redirections_Manager` | `class-gp-redirections-manager.php` | Native redirect management + 3rd-party plugin detection and import |
| `GP_Updater` | `class-gp-updater.php` | WordPress-native auto-update checking against the GhostSEO platform |
| `GP_I18n` | `class-gp-i18n.php` | Internationalization - English + Hebrew (RTL) without .po/.mo files |

### 24b. Dynamic Plugin Generation (Per-Site)

The plugin is **not a static download** - it is **generated dynamically** from JavaScript template files for each site.

**Template Location:** `app/api/sites/[id]/download-plugin/plugin-templates/`

Each template is a JavaScript function that returns PHP source code, with site-specific values injected at generation time.

**21 Template Files → Generated Files Mapping:**

| Template (JS) | Export Function | Generated File (PHP/Other) |
|----------------|----------------|---------------------------|
| `main.js` | `getPluginMainFile()` | `ghost-post-connector.php` |
| `config.js` | `getPluginConfigFile()` | `includes/config.php` |
| `class-ghost-post.js` | `getClassGhostSEO()` | `includes/class-ghost-post.php` |
| `class-api-handler.js` | `getClassApiHandler()` | `includes/class-gp-api-handler.php` |
| `class-request-validator.js` | `getClassRequestValidator()` | `includes/class-gp-request-validator.php` |
| `class-content-manager.js` | `getClassContentManager()` | `includes/class-gp-content-manager.php` |
| `class-media-manager.js` | `getClassMediaManager()` | `includes/class-gp-media-manager.php` |
| `class-seo-manager.js` | `getClassSeoManager()` | `includes/class-gp-seo-manager.php` |
| `class-cpt-manager.js` | `getClassCptManager()` | `includes/class-gp-cpt-manager.php` |
| `class-acf-manager.js` | `getClassAcfManager()` | `includes/class-gp-acf-manager.php` |
| `class-updater.js` | `getClassUpdater()` | `includes/class-gp-updater.php` |
| `class-entity-sync.js` | `getClassEntitySync()` | `includes/class-gp-entity-sync.php` |
| `class-redirections-manager.js` | `getClassRedirectionsManager()` | `includes/class-gp-redirections-manager.php` |
| `class-gp-i18n.js` | `getClassI18n()` | `includes/class-gp-i18n.php` |
| `admin-page.js` | `getAdminPage()` | `admin/views/dashboard-page.php` |
| `settings-page.js` | `getSettingsPage()` | `admin/views/settings-page.php` |
| `redirections-page.js` | `getRedirectionsPage()` | `admin/views/redirections-page.php` |
| `admin-css.js` | `getAdminCss()` | `admin/css/admin.css` |
| `admin-js.js` | `getAdminJs()` | `admin/js/admin.js` |
| `readme.js` | `getPluginReadme()` | `readme.txt` |
| `uninstall.js` | `getPluginUninstall()` | `uninstall.php` |

**Site-Specific Injections (in `config.php`):**
```php
define('GP_SITE_ID', '{mongodb_site_id}');
define('GP_SITE_KEY', 'gp_site_{32_hex_chars}');
define('GP_SITE_SECRET', '{64_char_hex_secret}');
define('GP_API_URL', 'https://app.ghostpost.co.il');
define('GP_PERMISSIONS', serialize(array(
  'CONTENT_READ', 'CONTENT_CREATE', 'CONTENT_UPDATE', 'CONTENT_DELETE', 'CONTENT_PUBLISH',
  'MEDIA_UPLOAD', 'MEDIA_DELETE',
  'SEO_UPDATE', 'REDIRECTS_MANAGE', 'SITE_INFO_READ',
  'CPT_READ', 'CPT_CREATE', 'CPT_UPDATE', 'CPT_DELETE',
  'ACF_READ', 'ACF_UPDATE',
  'TAXONOMY_READ', 'TAXONOMY_MANAGE'
)));

function gp_has_permission($permission) {
  $permissions = unserialize(GP_PERMISSIONS);
  return in_array($permission, $permissions, true);
}
```

### 24c. Download Plugin API (`GET /api/sites/[id]/download-plugin`)

**Authentication:** User session cookie + account membership verification

**Process:**
1. Verify user has access to the site
2. Generate `siteKey` + `siteSecret` if not already set (for pre-v2.4 sites)
3. Update site record with new keys and default permissions if needed
4. Call each of the 21 template functions to generate PHP source code
5. Inject site-specific values into `config.php` (Site ID, Site Key, Site Secret, API URL, permissions)
6. Build ZIP using JSZip with DEFLATE compression (level 9)
7. Add `assets/icon.svg` (ghost icon)
8. Return ZIP with filename: `ghost-post-connector-{short-key}.zip`

**API URL Resolution:** `GP_PLUGIN_API_URL` env → `NEXT_PUBLIC_BASE_URL` env → default `https://app.ghostpost.co.il`

### 24d. Generated ZIP Structure

```
ghost-post-connector/
├── ghost-post-connector.php              // Main plugin entry point (WordPress header, hooks, init)
├── readme.txt                            // WordPress plugin readme with changelog
├── uninstall.php                         // Cleanup on uninstall (deletes options/transients)
├── includes/
│   ├── config.php                        // Site-specific: GP_SITE_ID, GP_SITE_KEY, GP_SITE_SECRET, GP_API_URL, GP_PERMISSIONS
│   ├── class-ghost-post.php              // Main orchestrator class
│   ├── class-gp-api-handler.php          // REST API routing (30+ endpoints)
│   ├── class-gp-request-validator.php    // HMAC-SHA256 validation
│   ├── class-gp-content-manager.php      // Post/page CRUD
│   ├── class-gp-media-manager.php        // Media upload + WebP conversion
│   ├── class-gp-seo-manager.php          // Yoast + Rank Math meta
│   ├── class-gp-cpt-manager.php          // Custom Post Types
│   ├── class-gp-acf-manager.php          // Advanced Custom Fields
│   ├── class-gp-updater.php              // Auto-update from platform
│   ├── class-gp-entity-sync.php          // Real-time webhook push
│   ├── class-gp-redirections-manager.php // Redirect management + import
│   └── class-gp-i18n.php                // English + Hebrew translations
├── admin/
│   ├── views/
│   │   ├── dashboard-page.php            // Connection status, site info, permissions
│   │   ├── settings-page.php             // Language, connection, last ping, errors
│   │   └── redirections-page.php         // Redirect plugin detection, import, CRUD
│   ├── css/
│   │   └── admin.css                     // Cards, status indicators, forms, tables
│   └── js/
│       └── admin.js                      // Redirect CRUD, form handling, AJAX
└── assets/
    └── icon.svg                          // Ghost icon
```

### 24e. Plugin Initialization

```php
// ghost-post-connector.php (main entry point)

// Plugin Header
Plugin Name: GhostSEO Connector
Plugin URI: https://ghostpost.co.il
Version: 2.4.9
Requires at least: 5.6
Requires PHP: 7.4

// Constants
define('GP_CONNECTOR_VERSION', '2.4.9');
define('GP_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GP_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));

// Load config.php → site credentials
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/config.php';

// Load all class files
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghost-post.php';
// ... (all other class files)

// Initialize on plugins_loaded
add_action('plugins_loaded', 'gp_connector_init');
function gp_connector_init() {
    $ghost_post = new Ghost_Post();
    $ghost_post->init();
}

// Activation → verify connection with platform
register_activation_hook(__FILE__, 'gp_connector_activate');

// Deactivation → notify platform of disconnection
register_deactivation_hook(__FILE__, 'gp_connector_deactivate');
```

### 24f. HMAC-SHA256 Authentication

Every request between the platform and WordPress plugin is cryptographically signed.

**Request Headers:**
```
X-GP-Site-Key:   gp_site_abc123def456...     (public identifier)
X-GP-Timestamp:  1706450000                   (unix epoch seconds)
X-GP-Signature:  {HMAC-SHA256 hex digest}     (signature of timestamp.body)
Content-Type:    application/json
```

**Validation Process (both sides):**
1. Extract `siteKey` → look up `siteSecret` from config (plugin) or database (platform)
2. Verify timestamp within ±5 minutes (replay protection) with ±60 seconds clock skew tolerance
3. Recalculate signature: `HMAC-SHA256(timestamp + '.' + requestBody, siteSecret)`
4. Compare using **timing-safe comparison** (`hash_equals` in PHP, `crypto.timingSafeEqual` in Node.js)
5. Reject if any check fails (401 Unauthorized)

**Platform-Side Key Functions (`lib/site-keys.js`):**

| Function | Purpose |
|----------|---------|
| `generateSiteKey()` | Creates `gp_site_{32-hex-chars}` via `crypto.randomBytes(16)` |
| `generateSiteSecret()` | Creates 64-char hex via `crypto.randomBytes(32)` |
| `createSignature(payload, timestamp, secret)` | HMAC-SHA256 of `{timestamp}.{payload}` |
| `verifySignature(payload, timestamp, signature, secret, maxAge=300)` | Validates timestamp + verifies signature |
| `encryptCredential(text, key)` | AES-256-GCM encryption (for auto-install credentials) |
| `decryptCredential(encryptedBase64, key)` | Decrypts AES-256-GCM |
| `clearSiteCredentials(prisma, siteId)` | Removes temporary auto-install credentials |
| `generateConnectionToken(siteId, siteKey)` | Base64url JWT with 30-min expiration |
| `validateConnectionToken(token)` | Decodes and validates expiration |

### 24g. Plugin REST Endpoints (WordPress Side - `ghost-post/v1` namespace)

30+ REST API endpoints registered via `register_rest_route()`:

**Content (Posts/Pages):**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/posts` | List / create posts |
| GET/PUT/DELETE | `/posts/{id}` | Read / update / delete post |
| GET/POST | `/pages` | List / create pages |
| GET/PUT/DELETE | `/pages/{id}` | Read / update / delete page |

**Custom Post Types:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/cpt/{type}` | List / create CPT items |
| GET/PUT/DELETE | `/cpt/{type}/{id}` | Read / update / delete CPT item |

**Media (Images):**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/media` | List / upload media |
| GET/PUT/DELETE | `/media/{id}` | Read / update / delete media |
| POST | `/media/convert-to-webp` | Batch WebP conversion |
| POST | `/media/convert-image-format` | Multi-format conversion (WebP/AVIF) |
| POST | `/media/ai-optimize` | AI image enhancement |
| POST | `/media/apply-ai-optimization` | Apply platform AI suggestions (filename, alt text) |
| GET | `/media/queue-status` | Conversion queue progress |
| POST | `/media/process-queue-item` | Process platform-driven conversion queue item |
| GET | `/media/stats` | WebP conversion statistics |
| GET/DELETE | `/media/redirects` | Image URL redirect tracking (old→new) |

**SEO & Metadata:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/seo/{id}` | Get/update SEO meta (resolves Yoast/RankMath templates) |
| GET/PUT | `/acf/{id}` | Get/update Advanced Custom Fields |
| GET | `/taxonomies` | List registered taxonomies |
| GET/POST | `/taxonomies/{tax}/terms` | List / create taxonomy terms |
| GET | `/menus` | List WordPress menus |

**Redirects:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/redirects` | List / create redirects |
| PUT/DELETE | `/redirects/{id}` | Update / delete redirect |

**System:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/verify` | Connection verification (activation hook) |
| GET | `/site-info` | WordPress/plugin/PHP version info |

### 24h. Connection Protocol & Lifecycle

```
1. CREATE SITE
   User creates site → POST /api/sites
   Platform generates unique siteKey (gp_site_{32-hex}) + siteSecret (64-hex)
   Site record created with connectionStatus: PENDING

2. DOWNLOAD PLUGIN
   User downloads plugin → GET /api/sites/[id]/download-plugin
   Platform generates ZIP with site-specific config.php (credentials baked in)
   User installs ZIP in WordPress (wp-admin → Plugins → Upload)

3. ACTIVATE PLUGIN
   WordPress activation hook fires → gp_connector_activate()
   Plugin sends: POST /api/public/wp/verify
     Headers: X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
     Body: { wpVersion, phpVersion, pluginVersion, wpTimezone, wpLocale, siteUrl, adminEmail }
   Platform validates signature → sets connectionStatus: CONNECTED
   Returns: permissions array + shouldSync flag (true if first connection)

4. RUNTIME (Ongoing)
   a. Heartbeat: WordPress cron fires hourly
      → POST /api/public/wp/ping { pluginVersion, wpVersion }
      → Platform updates lastPingAt, confirms CONNECTED status
   
   b. Entity Sync: WordPress post create/update/trash/delete triggers webhook
      → POST /api/public/wp/entity-updated { action, post_type, post: {...full data...} }
      → Platform syncs entity via syncSingleEntity()
   
   c. Redirect Sync: WordPress redirect changes trigger webhook
      → POST /api/public/wp/redirect-updated { action, redirect: {...}, source }
      → Platform upserts/deletes in Redirection model
   
   d. Platform → WordPress: Content publishing, media upload, SEO updates
      → Platform calls /wp-json/ghost-post/v1/{endpoint} with HMAC signature
   
   e. Auto-Update: Plugin checks for updates
      → GET /api/plugin/update-check?site_key=xxx&current_version=2.4.8
      → WordPress-native update notice if new version available

5. DEACTIVATE PLUGIN
   WordPress deactivation hook fires → gp_connector_deactivate()
   Plugin sends: POST /api/public/wp/disconnect
   Platform sets connectionStatus: DISCONNECTED
```

### 24i. Auto-Install Feature (`POST /api/sites/[id]/auto-install`)

Alternative to manual plugin installation:

1. User provides WordPress admin URL + credentials on the platform Connect page
2. Platform encrypts credentials with AES-256-GCM (5-minute TTL)
3. Platform checks REST API reachability (`GET /wp-json/` with 15s timeout)
4. Authenticates via Basic Auth (`GET /wp-json/wp/v2/users/me`)
5. Verifies `activate_plugins` capability
6. Searches for existing `ghost-post-connector` plugin
7. If found → activates it; if not found → returns `MANUAL_INSTALL_REQUIRED`
8. Credentials cleared immediately after attempt

**Error Codes:** `REST_API_UNREACHABLE`, `AUTH_FAILED`, `INSUFFICIENT_PERMISSIONS`, `MANUAL_INSTALL_REQUIRED`, `ACTIVATION_FAILED`

### 24j. Real-Time Entity Sync (Bidirectional)

**WordPress → Platform (Webhooks):**
1. `on_post_saved()` / `on_post_trashed()` / `on_post_deleted()` hook fires in `GP_Entity_Sync`
2. Skips if: autosave, revision, excluded post type, or **originated from gp-platform** (`is_gp_api_request` flag)
3. Builds complete entity payload: title, content, slug, status, SEO data, ACF fields, taxonomies, featured image, author
4. Creates HMAC signature
5. Non-blocking webhook `POST /api/public/wp/entity-updated` with full data
6. Platform routes to `syncSingleEntity()` or `deleteSingleEntity()`

**Platform → WordPress (REST API):**
- Content publishing: `POST /wp-json/ghost-post/v1/posts`
- Media upload: `POST /wp-json/ghost-post/v1/media`
- SEO updates: `PUT /wp-json/ghost-post/v1/seo/{id}`
- All requests signed with HMAC; plugin sets `is_gp_api_request = true` to prevent echo-back

**Conflict Prevention:**
- `GP_Entity_Sync::$is_gp_api_request` flag prevents webhook loops on platform-originated changes
- Redirect sync checks `source` field - skips webhook if `source === 'gp-platform'`
- Platform uses sync locks to prevent concurrent syncs:
  ```
  acquireSyncLock(siteId, 'cron'|'manual'|'webhook')
  releaseSyncLock(siteId, 'COMPLETED'|'ERROR', error)
  // 10-minute max timeout on stale locks
  // Progress tracked: entitySyncProgress (0-100), entitySyncMessage
  ```

### 24k. Platform Public Plugin API Routes

All routes under `app/api/public/wp/` - require HMAC-SHA256 signature validation:

| Method | Route | When | Updates |
|--------|-------|------|---------|
| POST | `/api/public/wp/verify` | Plugin activation | connectionStatus→CONNECTED, stores WP/PHP/plugin versions, returns permissions + shouldSync |
| POST | `/api/public/wp/ping` | Hourly WordPress cron | lastPingAt, connectionStatus→CONNECTED |
| POST | `/api/public/wp/disconnect` | Plugin deactivation | connectionStatus→DISCONNECTED |
| POST | `/api/public/wp/entity-updated` | Post create/update/trash/delete | Syncs entity to platform database via syncSingleEntity() |
| POST | `/api/public/wp/redirect-updated` | Redirect create/update/delete | Upserts/deletes in Redirection model, URL normalization |

### 24l. SEO Plugin Compatibility

The plugin auto-detects and supports multiple SEO plugins:

**Yoast SEO:**
- Meta fields: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`
- Open Graph: `_yoast_wpseo_opengraph-title`, `_yoast_wpseo_opengraph-description`, `_yoast_wpseo_opengraph-image`
- Twitter: `_yoast_wpseo_twitter-title`, `_yoast_wpseo_twitter-description`, `_yoast_wpseo_twitter-image`
- Resolves Yoast variable templates (e.g., `%%title%%`, `%%sitename%%`) with actual values

**Rank Math:**
- Meta fields: `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`
- Open Graph: `rank_math_facebook_title`, `rank_math_facebook_description`, `rank_math_facebook_image`
- Twitter: `rank_math_twitter_title`, `rank_math_twitter_description`
- Schema: `rank_math_schema_Article`, `rank_math_rich_snippet`

### 24m. Redirect Management (Plugin-Side)

**URL Processing:**
- `sanitize_redirect_url()` - Decodes percent-encoded URLs to Unicode (Hebrew support)
- `normalize_path()` - Strips trailing slashes for consistent matching
- `maybe_redirect()` - Hooks into `template_redirect`, matches with trailing-slash tolerance + Unicode decode

**3rd-Party Plugin Detection:** Detects and recommends importing from:
- Redirection, Yoast Premium Redirects, Rank Math Redirects, Safe Redirect Manager, Simple 301 Redirects

**Bidirectional Sync:**
- `push_redirect_webhook()` - Pushes changes back to platform via `POST /api/public/wp/redirect-updated`
- Platform pushes redirects via `POST /wp-json/ghost-post/v1/redirects`
- Source field prevents infinite loops

### 24n. Media Conversion Pipeline

**WebP Auto-Conversion:**
1. Image uploaded via `wp_handle_upload` filter
2. Check if auto-convert enabled in settings
3. Use Imagick or GD to convert to WebP
4. Generate WebP thumbnail versions
5. Store original alongside WebP
6. Track in conversion history

**Platform-Driven Queue (for batch operations):**
- Platform batches images for conversion
- Calls `/media/process-queue-item` one-at-a-time (reliable - no WP-Cron dependency)
- Progress tracked via `/media/queue-status` endpoint

**AI Image Optimization:**
- Platform analyzes images → suggests optimized filenames + alt text
- Calls `/media/apply-ai-optimization` with suggestions
- Plugin updates attachment metadata

### 24o. Version Management & Auto-Updates

**Single Source of Truth:** `app/api/plugin/version.js`
```javascript
export const PLUGIN_VERSION = "2.4.9";
export const PLUGIN_CHANGELOG = `= 2.4.9 =\n* FIX: Scheduling published posts...`;
```

**Update Workflow:**
1. Modify plugin template files in `plugin-templates/` directory
2. Increment `PLUGIN_VERSION` in `app/api/plugin/version.js` (by 0.0.1)
3. Add changelog entry to `PLUGIN_CHANGELOG`
4. Run: `node scripts/sync-plugin-version.mjs` (syncs version to main.php template header + constant)
5. Deploy platform - all new plugin downloads automatically get the new version

**WordPress Auto-Update:**
- `GP_Updater` hooks into WordPress `pre_set_site_transient_update_plugins`
- Checks: `GET /api/plugin/update-check?site_key=xxx&current_version=X.Y.Z`
- Platform compares versions (splits by `.`, compares numeric parts left-to-right)
- Returns WordPress-compatible update response with download URL, changelog, requirements
- WordPress displays native update notice in Plugins screen

**Current Version:** 2.4.9

### 24p. Database Schema (Site Model - Plugin-Related Fields)

```prisma
model Site {
  // Plugin Authentication
  siteKey              String?              // gp_site_{32-hex} - public identifier
  siteSecret           String?              // 64-hex - HMAC signing key (never returned from API)
  connectionStatus     SiteConnectionStatus // PENDING | CONNECTING | CONNECTED | DISCONNECTED | ERROR
  lastPingAt           DateTime?            // Last successful heartbeat
  sitePermissions      SitePermission[]     // Array of allowed operations (18 permissions)

  // WordPress Environment
  pluginVersion        String?              // Currently installed plugin version
  wpVersion            String?              // WordPress version
  phpVersion           String?              // PHP version
  wpTimezone           String?              // e.g. "Asia/Jerusalem"
  wpLocale             String?              // e.g. "he_IL"

  // Auto-Install (temporary, encrypted)
  wpAdminUrl           String?
  wpAdminUsername       String?              // AES-256-GCM encrypted
  wpAdminPassword      String?              // AES-256-GCM encrypted
  autoInstallExpiresAt DateTime?            // 5-minute TTL

  // Entity Sync Tracking
  entitySyncStatus     EntitySyncStatus     // NEVER | SYNCING | COMPLETED | ERROR
  entitySyncProgress   Int?                 // 0-100%
  entitySyncMessage    String?              // Current action description
  lastEntitySyncAt     DateTime?
  entitySyncError      String?
}

enum SiteConnectionStatus {
  PENDING        // Created, awaiting plugin installation
  CONNECTING     // Auto-install in progress
  CONNECTED      // Verified & operational (heartbeat active)
  DISCONNECTED   // Was connected, plugin deactivated or unreachable
  ERROR          // Connection failed
}

enum SitePermission {
  CONTENT_READ, CONTENT_CREATE, CONTENT_UPDATE, CONTENT_DELETE, CONTENT_PUBLISH,
  MEDIA_UPLOAD, MEDIA_DELETE,
  SEO_UPDATE, REDIRECTS_MANAGE, SITE_INFO_READ,
  CPT_READ, CPT_CREATE, CPT_UPDATE, CPT_DELETE,
  ACF_READ, ACF_UPDATE,
  TAXONOMY_READ, TAXONOMY_MANAGE
}
```

### 24q. Security Layers Summary

1. **HTTPS Only** - All communication encrypted in transit
2. **siteSecret Never Transmitted** - Only embedded in downloaded `config.php`, never returned from any API
3. **HMAC-SHA256 + Timestamp** - Each request uniquely signed, prevents tampering
4. **5-Minute Replay Window** - With ±60s clock skew tolerance
5. **Timing-Safe Comparison** - `crypto.timingSafeEqual()` / `hash_equals()` prevents timing attacks
6. **Permission Scoping** - Platform enforces what operations are allowed per site
7. **Connection Status Tracking** - Alerts if plugin goes silent (missed heartbeats)
8. **Auto-Install Credential Encryption** - AES-256-GCM with 5-minute TTL, cleared after use
9. **Conflict Prevention** - Source flags and sync locks prevent bidirectional echo loops

---

## 25. Background Jobs & Content Pipeline

### Asynchronous Background Jobs Architecture

The platform uses a **BackgroundJob** model for long-running AI operations that would exceed typical HTTP timeout limits. This pattern enables fire-and-forget async processing with client-side polling.

**Pattern:**
1. Client sends POST to start the job → receives `jobId` immediately
2. Server creates `BackgroundJob` record (status: `PENDING`) and fires async processor via detached Promise
3. Processor updates `progress` (0–100) and `message` as it works
4. Client polls `GET /api/background-jobs/{id}` every 3 seconds via `useBackgroundJobPolling` hook
5. On `COMPLETED`: `resultData` contains the full output; on `FAILED`: `error` contains the message

**Currently used by:**
- **Content Differentiation Engine** (`type: "CONTENT_DIFFERENTIATION"`) - processes N-page differentiation with Alpha Page selection and AI generation

**Hook:** `useBackgroundJobPolling(jobId)` - returns `{ job, isLoading, error, refetch }`. Auto-starts/stops polling based on job status.

### Content Lifecycle

```
Campaign Created (via AI Content Wizard)
    ↓
Content items set to SCHEDULED with target dates
    ↓
[Cron: process-content] - Picks up due SCHEDULED items
    ↓
Status: SCHEDULED → PROCESSING → dispatches generate-article worker
    ↓
[Worker: generate-article] - AI generates the article
    ↓
Status: PROCESSING → READY_TO_PUBLISH
    ↓
[Cron: publish-content] - Picks up READY_TO_PUBLISH items
    ↓
Dispatches publish-article worker (max 1 per site per run)
    ↓
[Worker: publish-article] - Publishes to WordPress
    ↓
Status: READY_TO_PUBLISH → PUBLISHED
```

### Cron Jobs (Dispatchers)

#### `sync-entities` - `/api/cron/sync-entities`
- **Frequency:** Hourly
- **Purpose:** Sync entities from all connected websites
- **Process:** Find active sites with `connectionStatus=CONNECTED` → acquire sync lock → execute sync → release lock. Skips WP sites with plugin (real-time webhooks handle those).
- **Output:** Per-site stats (created/updated/unchanged)

#### `process-content` - `/api/cron/process-content`
- **Frequency:** Hourly
- **Purpose:** Move scheduled content into AI generation
- **Process:** Atomically acquire batch of due SCHEDULED items → flip to PROCESSING → recover stale locks (>10 min stuck) → dispatch up to 50 `generate-article` workers in parallel
- **Smart locking:** WHERE guard prevents concurrent processing

#### `publish-content` - `/api/cron/publish-content`
- **Frequency:** Hourly
- **Purpose:** Publish ready content to WordPress
- **Process:** Fetch READY_TO_PUBLISH items → tenant throttle (max 1 per site per run) → dispatch `publish-article` per item → auto-complete campaigns when all done
- **Retry:** Max 3 publish attempts per item

#### `agent-analysis` - `/api/cron/agent-analysis`
- **Frequency:** Plan-based (Basic: weekly, Pro/Enterprise: daily)
- **Purpose:** Run AI analysis for actionable insights
- **Process:** Expire old insights (>14 days) → find eligible sites → check cooldown → run analysis → store insights

### Worker Jobs (Executors)

#### `generate-article` - `/api/worker/generate-article`
- **Triggered by:** `process-content` cron
- **Input:** Content ID via HMAC-signed request
- **Process:**
  1. Fetch content + campaign settings
  2. Build AI prompt (word count, article type, keyword, image requirements, SEO metadata, slug rules)
  3. Call Gemini API (max 8192 tokens, temperature 0.7)
  4. Parse JSON response, validate, clean
  5. Update content: HTML body, featured image alt, SEO metadata, word count
  6. Status: PROCESSING → READY_TO_PUBLISH

#### `publish-article` - `/api/worker/publish-article`
- **Triggered by:** `publish-content` cron
- **Input:** Content ID via HMAC-signed request
- **Process:**
  1. Fetch content + WordPress credentials
  2. Upload featured image to WP media library
  3. Upload content images to WP media library
  4. Create WP post via HMAC-signed request to `/wp-json/ghost-post/v1/posts`
  5. Set post status to `publish`
  6. Populate SEO metadata (Yoast + Rank Math fields)
  7. Update OG/Twitter metadata
  8. Log to SystemLog
  9. Status: READY_TO_PUBLISH → PUBLISHED
- **Error handling:** Max 3 attempts, detailed error logging

---

## 26. Context Providers

**Path:** `app/context/`

| Context | Purpose |
|---------|---------|
| **UserContext** | Auth state, auto-logout on 401, AI credits tracking |
| **SiteContext** | Selected site, available sites, localStorage caching, site switching |
| **LocaleContext** | Current language/locale, `t()` function, RTL detection |
| **ThemeContext** | Dark/light preference, system detection, toggle |
| **AuthModalContext** | Login/register modal state |
| **AgentContext** | AI agent insights, pending approvals, execution history |
| **BackgroundTasksContext** | Long-running task progress (entity syncs, audits, content gen) |
| **LimitGuardContext** | Resource limits enforcement - blocks actions when limits exceeded |
| **NotificationsContext** | Notification list, unread count, read status, filtering, real-time updates |

---

## 27. Middleware

**Path:** `middleware.js`

- **Locale detection:** Sets `locale` cookie based on request domain (`.co.il` → `he`, all others → `en`)
- **Cookie:** 1-year expiry, `SameSite=Lax`, path `/`
- **Scope:** All routes except `_next`, `api`, static assets
- **No authentication checks** - Auth handled by individual API routes

---

## 28. Shared Dashboard Components

**Path:** `app/dashboard/components/`

### UI Components
| Component | Purpose |
|-----------|---------|
| `Button.jsx` | Styled button (primary, secondary, outline, ghost, danger) |
| `Form.jsx` | Form wrapper with consistent styling |
| `PageHeader.jsx` | Page title + subtitle |
| `PrimaryActionButton.jsx` | CTA button with icon |
| `DashboardCard.jsx` | Card container with glow effect |
| `DashboardHeader.jsx` | Top nav bar with site selector, search, notifications |
| `StatsCard.jsx` | KPI display: value, label, trend, icon |
| `StatsGrid.jsx` | Responsive grid of StatsCards |
| `StatusBadge.jsx` | Color-coded status indicator |
| `Table.jsx` | Data table with sorting, pagination, row actions |
| `EmptyState.jsx` | Placeholder for empty data |
| `LoadingState.jsx` | Loading skeleton screens |
| `Skeleton.jsx` | Generic skeleton loader |
| `ProgressBar.jsx` | Visual progress bar |

### Feature Components
| Component | Purpose |
|-----------|---------|
| `ActivityItem.jsx` | Activity log entry with timestamp |
| `AgentActivity.jsx` | AI agent activity feed |
| `AiSuggestModal.jsx` | AI suggestion modal |
| `ContentPipelineWorker.jsx` | Content pipeline status |
| `DashboardContent.jsx` | Main dashboard: charts, KPIs, tables, agent section |
| `FailedPublishModal.jsx` | Failed publish error details |
| `FixPreviewModal.jsx` | WYSIWYG preview for AI fixes with merge/apply |
| `BackgroundJobWidget.jsx` | Sticky sidebar widget for async job progress (spinner, progress bar, completion state) |
| `DifferentiationModal.jsx` | 80vw×80vh surgical diff viewer for content differentiation results (Alpha Page box, accordion diffs) |
| `DifferentiationToast.jsx` | Global completion toast - auto-dismisses after 10s, click opens modal |
| `KpiSlider.jsx` | Horizontal scrollable KPI slider |
| `QuickActions.jsx` | Quick action toolbar |
| `MediaModal/` | Media selection and management |

---

## 29. API Routes Reference

### Authentication
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Email/password + OAuth login |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/otp` | OTP verification |
| POST | `/api/auth/account` | Account creation |
| GET/POST | `/api/auth/accept-invite` | Team invite acceptance |
| GET/POST | `/api/auth/google` | Google OAuth callback |

### Sites
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sites` | List user's sites |
| POST | `/api/sites` | Create new site |
| GET/PUT | `/api/sites/[id]` | Get/update site |
| POST | `/api/sites/select` | Update selected site |
| POST | `/api/sites/validate` | Validate site URL |
| POST | `/api/sites/suggest-name` | AI name suggestion |
| POST | `/api/sites/[id]/verify-plugin` | Verify plugin connection |
| GET | `/api/sites/[id]/download-plugin` | Download site-specific plugin ZIP |

### Entities
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/entities` | List entities by type |
| GET/PUT | `/api/entities/[id]` | Get/update entity |
| POST | `/api/entities/detect-platform` | Auto-detect CMS |
| POST | `/api/entities/discover` | Discover entity types |
| POST | `/api/entities/populate` | Sync from WordPress |
| POST | `/api/entities/scan` | Crawl for entities |
| POST | `/api/entities/refresh` | Refresh entity data |
| POST | `/api/entities/sync` | Full sync operation |
| GET | `/api/entities/types` | Get entity type config |

### Keywords
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/keywords` | List tracked keywords |
| POST | `/api/keywords` | Create/import keywords |
| GET/PUT/DELETE | `/api/keywords/[id]` | CRUD single keyword |
| POST | `/api/keywords/suggest-related` | AI suggestions |

### Competitors
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/competitors` | List competitors |
| POST | `/api/competitors/discover` | Find via SERP |
| POST | `/api/competitors/compare` | Compare metrics |
| POST | `/api/competitors/scan` | Analyze competitor |

### Campaigns & Content
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| POST | `/api/campaigns/[id]` | Update campaign |
| POST | `/api/campaigns/generate-subjects` | AI subject generation (SSE streaming via `streamText`) |
| POST | `/api/campaigns/suggest-keyword` | AI keyword suggestions for pillar page (returns 3 ranked keywords) |
| POST | `/api/campaigns/recommend-subjects` | AI recommends best subjects from generated list (cached per locale in AiCache) |
| POST | `/api/campaigns/[id]/generate-plan` | Generate publishing schedule & article distribution for campaign |
| GET | `/api/content` | List content items |

### Audit
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/audit` | Audit history |
| POST | `/api/audit/rescan` | Run new audit |
| POST | `/api/audit/translate-summary` | Translate summary |
| POST | `/api/audit/[action]` | Apply fix actions |

### Agent
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agent/runs` | Execution history |
| POST | `/api/agent/execute` | Execute action |
| GET | `/api/agent/insights` | AI insights |
| GET | `/api/agent/entity-lookup` | Entity data lookup |

### Interview
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/interview` | Get interview data + next question |
| POST | `/api/interview` | Submit answer |
| POST | `/api/interview/actions` | Execute bot action |
| POST | `/api/interview/analyze` | AI analysis |
| POST | `/api/interview/chat` | AI chat (streaming) |
| POST | `/api/interview/fetch-blog-articles` | Fetch for analysis |

### Dashboard
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/stats` | Main dashboard metrics (GA4 + GSC) |

### Redirections
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sites/[id]/redirections` | List redirections |
| POST | `/api/sites/[id]/redirections` | Create redirection |
| PUT | `/api/sites/[id]/redirections/[rid]` | Update redirection |
| DELETE | `/api/sites/[id]/redirections/[rid]` | Delete redirection |
| POST | `/api/sites/[id]/redirections/sync` | Sync with WordPress |

### Payment
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/payment/init` | Initiate CardCom payment |
| POST | `/api/payment/confirm` | Confirm payment |
| POST | `/api/payment/webhook` | Payment webhook |
| POST | `/api/payment/downgrade` | Downgrade plan |
| POST | `/api/payment/free-with-coupon` | Apply free coupon |
| POST | `/api/payment/prorate` | Calculate proration |

### User
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/user/me` | Current user profile |
| PUT | `/api/user/password` | Change password |
| GET | `/api/user/permissions` | User permissions |
| GET | `/api/user/preferences` | User preferences |
| GET | `/api/user/addon-purchases` | Add-on purchases |
| GET | `/api/user/auth-providers` | Connected OAuth |
| GET | `/api/user/profile` | Get/update profile |

### Settings
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings` | Get site settings |
| PUT | `/api/settings` | Update settings |
| POST | `/api/settings/validate-integration` | Validate Google OAuth |

### Subscription & Account
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/subscription` | Current subscription |
| GET | `/api/account` | Account info |
| PATCH | `/api/account` | Update account |
| DELETE | `/api/account/delete` | Delete account |
| GET | `/api/account/resources` | Resource limits |

### Admin (SuperAdmin)
| Method | Route | Description |
|--------|-------|-------------|
| CRUD | `/api/admin/users` | User management |
| CRUD | `/api/admin/plans` | Plan management |
| CRUD | `/api/admin/subscriptions` | Subscription management |
| CRUD | `/api/admin/coupons` | Coupon management |
| CRUD | `/api/admin/addons` | Add-on management |
| CRUD | `/api/admin/accounts` | Account management |
| CRUD | `/api/admin/bot-actions` | Bot action management |
| CRUD | `/api/admin/interview-flow` | Interview question management |
| CRUD | `/api/admin/interview-questions` | Interview question CRUD |
| CRUD | `/api/admin/push-questions` | Push question management |

### Plugin
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/plugin/version` | Plugin version check |
| GET | `/api/sites/[id]/download-plugin` | Site-specific ZIP download |

### Background Jobs
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/background-jobs/[id]` | Poll job status, progress, and results |
| POST | `/api/content-differentiation` | Start content differentiation background job |
| POST | `/api/content-differentiation/execute` | Execute approved differentiation fixes |
| POST | `/api/cron/sync-entities` | Entity sync dispatcher |
| POST | `/api/cron/process-content` | Content generation dispatcher |
| POST | `/api/cron/publish-content` | Content publishing dispatcher |
| POST | `/api/cron/agent-analysis` | AI analysis dispatcher |
| POST | `/api/worker/generate-article` | AI article generation |
| POST | `/api/worker/publish-article` | WordPress publishing |

### Public / Webhook
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/public/wp/redirect-updated` | WordPress redirect webhook |
| Various | `/api/public/auth/*` | Public auth endpoints |
| GET | `/api/public/plans` | Available plans (no auth) |

---

## 30. Lib Utilities Reference

| File | Purpose |
|------|---------|
| `prisma.js` | Prisma ORM singleton with optimized MongoDB connection pooling |
| `permissions.js` | RBAC - module/capability checking system |
| `auth-permissions.js` | Permission checking helper functions |
| `account-utils.js` | Account ownership, limits, add-on management, AI credit operations |
| `account-limits.js` | Resource usage tracking vs. plan limits (sites, members, credits, audits) |
| `site-keys.js` | Site key/secret generation, HMAC-SHA256 signature creation & verification |
| `wp-api-client.js` | WordPress REST API client - CRUD via HMAC-signed requests. All functions normalize plural post types (`'posts'`→`'post'`, `'pages'`→`'page'`). Key functions: `getPost()`, `getPosts()`, `getPostBySlug()`, `createPost()`, `updatePost()`, `getSeoData()`, `updateSeoData()`, `createRedirect()`, `searchReplaceLinks()` (bulk internal link replacement), `resolveUrl()`, `resolveMediaUrls()` |
| `worker-auth.js` | Background worker authentication via HMAC signatures |
| `cloudinary-upload.js` | Image & media upload to Cloudinary CDN |
| `cardcom.js` | CardCom payment gateway integration |
| `proration.js` | Subscription billing proration calculations |
| `mailer.js` | Email service (registration, invites, notifications) |
| `notifications.js` | Notification creation and broadcasting |
| `google-integration.js` | Google Analytics 4 + Search Console OAuth integration |
| `google-oauth.js` | Google authentication flow management |
| `fetch-interceptor.js` | Global fetch wrapper - auto-logout on 401 |
| `domain-metrics.js` | SEO metrics calculation and domain analysis |
| `agent-analysis.js` | AI agent analysis engine - generates insights from site data |
| `agent-fix.js` | AI agent fix execution - content merging (N-page support), redirect creation, link healing, GSC re-indexing. Produces enriched `actions[]` with `{type, status, detail, meta}` per step |
| `competitor-scraper.js` | Competitor website scraping and analysis |
| `entity-sync.js` | WordPress entity synchronization (posts, pages, custom types) |
| `cannibalization-engine.js` | Content cannibalization detection - 3-layer hybrid (proactive/reactive/AI), Union-Find N-URL grouping, Hebrew-aware text normalization, high-confidence AI bypass |
| `actions/content-differentiation.js` | Content Differentiation Engine - Alpha Page Algorithm, 3-Layer Anti-Cannibalization Safety Net, async background job processing, surgical diff generation, WordPress execution |
| `urlDisplay.js` | URL formatting and display utilities |
| `ai/gemini.js` | Gemini model config, `generateTextResponse`, `streamTextResponse`, `generateStructuredResponse` |
| `ai/interview-ai.js` | Interview-specific AI prompts and function calling |
| `ai/service.js` | Legacy AI service (backward compat) |
| `bot-actions/executor.js` | Bot action execution engine |
| `bot-actions/handlers/` | Individual handler implementations (crawl, detect, analyze, generate, etc.) |
| `interview/flow-engine.js` | Interview condition evaluation engine |
| `audit/` | Site audit and crawling logic |

---

## 31. Key Workflows

### Complete Registration Flow

```
1. User visits /auth/register → form
2. Submits form → POST /api/auth/register
   ├── Validate input (Zod)
   ├── Check email exists
   ├── Hash password (bcryptjs, rounds: 10)
   ├── Create TempRegistration (status: FORM)
   ├── Generate OTP (6 digits, 10 min expiry)
   ├── Send verification email
   └── Return tempRegId

3. OTP verification → POST /api/auth/verification/otp
   ├── Validate code, check expiry, max 3 attempts
   ├── Mark emailVerified
   └── Status: VERIFY → ACCOUNT_SETUP

4. Account setup → POST /api/auth/registration/account-setup
   ├── Validate name, generate slug, check uniqueness
   └── Status: ACCOUNT_SETUP → INTERVIEW

5. Interview → POST /api/interview (multiple times)
   ├── AI guides through questions
   ├── Execute auto-actions (crawl, analyze)
   └── Build externalData

6. Plan selection → POST /api/auth/registration/select-plan
   └── Status: INTERVIEW → PLAN

7. Finalize → POST /api/auth/registration/finalize
   └── Inside $transaction:
       ├── Create User (hashed password, emailVerified, step: COMPLETED)
       ├── Create Account (name, slug, emails, timezone, aiCreditsBalance: 0)
       ├── Create Owner Role (isSystemRole: true)
       ├── Create AccountMember (isOwner: true, ACTIVE)
       ├── Create Subscription (planId, ACTIVE, billing period)
       ├── Add AI Credits from plan
       ├── Create Session (UUID token, 30-day expiry)
       ├── Delete TempRegistration
       └── Return user + account + session

8. Set cookie → gp_session=token (HttpOnly, Secure)
9. Redirect to /dashboard
```

### WordPress Plugin Connection Flow

```
1. Create Site → POST /api/sites → siteKey + siteSecret generated, connectionStatus: PENDING
2. Download plugin → GET /api/sites/[id]/download-plugin → custom ZIP with credentials in config.php
3. Install plugin in WordPress → wp-admin → Plugins → Upload Plugin
4. Activate plugin → activation hook fires:
   → POST /api/public/wp/verify { wpVersion, phpVersion, pluginVersion, wpTimezone, wpLocale }
   → Platform validates HMAC signature → connectionStatus: CONNECTED
   → Returns permissions array + shouldSync flag
5. Hourly heartbeat → WordPress cron → POST /api/public/wp/ping
   → Platform updates lastPingAt, confirms CONNECTED
6. Bidirectional sync active:
   → WordPress entity changes → POST /api/public/wp/entity-updated (webhooks)
   → Platform content publishing → POST /wp-json/ghost-post/v1/posts (HMAC-signed)
   → Conflict prevention via source flags + sync locks
7. (Optional) Auto-install: POST /api/sites/[id]/auto-install
   → Platform checks REST API, authenticates, activates existing plugin
   → Credentials encrypted (AES-256-GCM) with 5-minute TTL
```

### Content Generation with AI Flow

```
1. User creates campaign via AI Content Wizard (9-step topic cluster flow):
   a. Select/create campaign
   b. Choose pillar page (from all entity types or custom URL)
   c. Set main keyword (with AI suggestions from pillar page analysis)
   d. Configure post count, article types, content settings
   e. AI generates 3× subject suggestions via SSE streaming
   f. AI auto-recommends best subjects (cached per locale in AiCache)
   g. Set custom prompts, schedule (dates, days, time mode)
   h. Review summary → generate plan
2. Content items created as SCHEDULED with target dates
3. [Cron: process-content] picks up due items
   ├── SCHEDULED → PROCESSING
   └── Dispatches generate-article workers
4. [Worker: generate-article]
   ├── Build AI prompt (word count, type, keyword, images, SEO)
   ├── Call Gemini API (8192 tokens, temp 0.7)
   ├── Parse response, validate, clean
   ├── Update content record
   └── PROCESSING → READY_TO_PUBLISH
5. [Cron: publish-content] picks up ready items
   └── Dispatches publish-article workers (max 1/site/run)
6. [Worker: publish-article]
   ├── Upload images to WP media library
   ├── Create WP post via HMAC-signed request
   ├── Set SEO metadata (Yoast + Rank Math)
   ├── Deduct AI credits
   └── READY_TO_PUBLISH → PUBLISHED
7. Campaign auto-completes when all items published
```

---

## Summary

**GhostSEO Platform** is a comprehensive AI-powered SEO and content management system combining:

1. **Modern Architecture** - Next.js 15, React 19, MongoDB, Prisma
2. **Advanced AI** - Gemini 2.0 with function calling and structured output
3. **Full Multi-Tenancy** - Accounts, Users, Sites with complete separation
4. **Granular Permissions** - 50+ permissions, custom roles
5. **Dynamic Subscriptions** - Plans + Add-Ons with no hardcoded logic
6. **Deep WordPress Integration** - Custom plugin with HMAC authentication
7. **AI-Powered Interview** - 12 question types, bot actions, flow engine
8. **Full i18n** - 12 languages, RTL support
9. **AI Credits Economy** - Precise tracking, logging, refills
10. **Automated Content Pipeline** - Cron dispatchers + worker executors + async background jobs
11. **Complete Technical SEO** - Redirections, WebP conversion, site audits, content differentiation
12. **Competitor Intelligence** - Discovery, scanning, gap analysis
13. **Scalability** - Ready for thousands of accounts and millions of entities
