# Ghost Post Platform — Complete System Documentation

> **Single-document reference** for the entire Ghost Post platform: architecture, data models, permissions, subscriptions, AI infrastructure, every page & feature, plugin system, background jobs, API routes, and workflows.

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

**Ghost Post** is an AI-powered SEO automation platform for managing websites and content. It allows businesses to manage multiple sites, generate content intelligently, track keywords, analyze competitors, and perform SEO audits — all driven by artificial intelligence.

### Product Vision

The system is designed to be the "ultimate SEO platform" combining:

- **Full Automation** — From initial interview to content publication
- **AI as a Partner** — Not just a tool, but an active participant
- **Deep Integration** — Full WordPress plugin connection
- **Tracking & Analytics** — Every important SEO metric in one place

### System Scope

- **Multi-Tenancy**: Thousands of organizations in parallel
- **Scale**: From a single site to networks of hundreds
- **Multilingual**: 12 built-in languages + extensibility
- **Multi-Currency**: USD, ILS, EUR, GBP
- **Multi-Timezone**: Per-account timezone support

---

## 2. Technology Stack

### Frontend
- **Framework**: Next.js 15.0.0+ (App Router) — Server Components, Server Actions, Streaming SSR, Automatic Code Splitting, Image Optimization
- **React**: 19.0.0+ — Server Components, Suspense Boundaries, Error Boundaries, Context API
- **Styling**: CSS Modules with Nested Syntax
- **UI Libraries**:
  - `framer-motion` 12.0.0+ — Smooth animations
  - `lucide-react` 0.460.0+ — 1000+ icons
  - `@tiptap/react` 3.18.0+ — Advanced WYSIWYG editor
  - `@floating-ui/dom` 1.7.5+ — Tooltips and popovers

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Next.js API Routes
- **Database**: MongoDB 6.0+ (Atlas Cloud or on-premise, Replica Set for HA)
- **ORM**: Prisma 6.0.0+ — Type-safe client, schema management, migrations
- **Authentication**: Custom JWT + Sessions — bcryptjs (cost factor 10), OTP (SMS + Email), OAuth 2.0 (Google, GitHub, Facebook, Apple)

### AI
- **Provider**: Google AI (Gemini)
- **SDK**: Vercel AI SDK v6.0.50+
- **Models**: `gemini-2.0-flash` (text), `imagen-3.0-generate-002` (images)
- **Capabilities**: `generateText`, `streamText`, `generateObject` (Zod schemas), Function Calling

### Email & Notifications
- **Provider**: nodemailer 7.0.13+
- **Use Cases**: Registration OTP, Password reset, Team invitations, Billing, Audit reports

### Security
- **HMAC-SHA256** — Plugin authentication
- **JWT/Session** — User authentication
- **bcryptjs** — Password hashing
- **OTP** — Two-factor verification

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

#### Layer 1 — Base (`gemini.js`)

```javascript
export const MODELS = {
  TEXT: "gemini-2.0-flash",
  IMAGE: "imagen-3.0-generate-002",
};

export function getTextModel() {
  return google(MODELS.TEXT);
}

// Simple text generation
export async function generateTextResponse({ system, prompt, temperature = 0.7 }) {
  const model = getTextModel();
  const result = await generateText({ model, system, prompt, temperature });
  return result.text;
}

// Streaming response (for API routes)
export async function streamTextResponse({ system, prompt }) {
  const model = getTextModel();
  const result = streamText({ model, system, prompt });
  return result.toDataStreamResponse();
}

// Structured output with Zod validation
export async function generateStructuredResponse({ system, prompt, schema }) {
  const model = getTextModel();
  const result = await generateObject({ model, system, prompt, schema });
  return result.object; // Type-safe!
}
```

#### Layer 2 — Interview (`interview-ai.js`)
- Custom system prompts for interview context
- Function calling for bot actions
- Context management across questions
- Personality injection

#### Layer 3 — Legacy Service (`service.js`)
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
2. **Unique `inviteToken` generated** — 32 random bytes (hex)
3. **Email sent** in `inviteLanguage` via `sendEmail()` with `emailTemplates.invitation()` — contains account name, inviter name, role, and accept link
4. **User clicks link** → redirected to `/auth/accept-invite?token={inviteToken}`
5. **Token verification** via `GET /api/auth/accept-invite/verify?token={token}` (public endpoint):
   - Validates token exists and status is PENDING
   - Checks expiration (7 days from `invitedAt`)
   - Returns: `{ email, accountName, roleName, inviterName, existingUser }`
6. **Acceptance** via `POST /api/auth/accept-invite`:
   - **Scenario A — New user** (no existing account): Creates a new `User` record with hashed password, sets `registrationStep: COMPLETED` (skips normal registration), links `userId` to the `AccountMember`
   - **Scenario B — Existing user**: Validates password against stored hash, links existing `userId` to the `AccountMember`
   - In both cases: status → `ACTIVE`, `joinedAt` set, session cookie created, `lastSelectedAccountId` set to the inviting account
7. **Resend** via `POST /api/settings/users/{memberId}/resend` — generates new token, resets `invitedAt`, resends email (only for PENDING members)

**Invitation Expiration:** Tokens expire 7 days after `invitedAt`. Expired invites return error code `EXPIRED` and can be reset by resending.

### Ownership Rules

- **Owner is set during registration**: When a user creates an account, an `Owner` system role is auto-created with ALL permissions, and the `AccountMember` is created with `isOwner: true`
- **Owner role is a system role** (`isSystemRole: true`) — cannot be deleted or modified
- **Cannot assign Owner via invite** — the invite API explicitly rejects `role.name === 'Owner'`
- **Cannot remove the owner** — `DELETE /api/settings/users/{memberId}` checks `isOwner` and rejects
- **Cannot modify owner's role** — `PATCH` rejects if target member has `isOwner: true`
- **One owner per account** — enforced via application-level validation in `lib/account-utils.js`

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
- Permissions are **per-account** — a user may be an Owner in one account and an Editor in another

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
- `maxMembers` — Team members
- `maxSites` — Websites
- `aiCredits` — Monthly AI credits
- `maxKeywords` — Tracked keywords
- `maxContent` — Content items
- `maxAddOnSeats`, `maxAddOnSites` — Add-on purchase limits

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

**Gateway**: CardCom — Israeli PCI-compliant payment processor
**Module**: `lib/cardcom.js`

**Currency Support**: ILS (1), USD (2), EUR (3), GBP (4)

**Main Functions**:
- `createLowProfile()` — Creates a payment deal, returns a `LowProfileId` (secure token for iframe)
- `getLowProfileResult()` — Verifies payment completion after user submits
- `buildDocument()` — Generates invoice/receipt document

**Payment Flow**:
1. User selects plan → `POST /api/subscription/init` calls `createLowProfile()` → returns iframe URL
2. User enters card details in CardCom's secure iframe (PCI-compliant — card data never touches our server)
3. CardCom processes payment → redirects back with result
4. `POST /api/subscription/confirm` calls `getLowProfileResult()` to verify
5. On success: Subscription created, Payment record stored, AI credits allocated
6. Invoice generated via `buildDocument()`

**Special Flows**:
- `POST /api/payment/free-with-coupon` — Coupon grants 100% discount, bypasses payment entirely
- `POST /api/subscription/prorate` — Calculates cost difference for plan changes

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
- **Plan restriction**: Optional — only applicable to specific plans
- **Limitation overrides**: Can grant more generous limits than the plan itself (e.g., +5 extra sites, +10,000 AI credits)
- **Extra features**: Grant premium capabilities not in the plan (e.g., priority support)
- **Duration**: `durationMonths` — how many billing cycles the discount applies
- **Redemption snapshot**: Full benefit details frozen at redemption time for auditing
- **Validation endpoint**: `POST /api/public/coupons/validate` — checkout-time validation
- **Multi-language**: Per-language descriptions via `CouponTranslation`

### AI Credits Economy

Every Account maintains a credit balance. All AI operations deduct credits; plan renewals and add-on purchases add credits.

**Two-Pool Model** (`lib/ai/credits-service.js`):
- **Period Pool**: Plan base allocation + recurring add-ons — resets to zero every billing period and re-allocates
- **One-Time Pool**: ONE_TIME add-on packs (`creditsRemaining` on `AddOnPurchase`) — persists across periods, consumed FIFO after the period pool is exhausted
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
- **Owner** — Full access (bypasses all permission checks)
- **Admin** — Full access except account deletion
- **Editor** — Content and entity management
- **Viewer** — Read-only access

### Custom Roles
Accounts can create custom roles with specific permission sets.

### Permission Format
`MODULE_CAPABILITY` — e.g., `SITES_VIEW`, `CONTENT_EDIT`, `KEYWORDS_DELETE`, `SETTINGS_AI_EDIT`

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
1. **InterviewQuestion** — Question templates (admin-configured)
2. **UserInterview** — User session
3. **InterviewMessage** — Conversation history
4. **BotAction** — Actions the AI can execute

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

**Example — INPUT_WITH_AI:**
```json
{
  "questionType": "INPUT_WITH_AI",
  "translationKey": "interview.competitors",
  "inputConfig": { "inputType": "textarea", "placeholder": "Enter competitor URLs", "fieldName": "competitors" },
  "autoActions": [{ "action": "analyzeCompetitors", "triggerOn": "submit", "parameters": { "competitors": "{{competitors}}" } }]
}
```

**Example — SELECTION:**
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

**Example — AUTO_ACTION:**
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

- **Dictionary files**: `i18n/dictionaries/{locale}.json` — Full key/value translation maps
- **Server-side**: `getDictionary(locale)` loads cached dictionary; used in Server Components
- **Client-side**: `useLocale()` hook from `LocaleContext` provides `t()` function, current locale, and text direction
- **Config**: `i18n/config.js` — RTL locale detection, direction helpers
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

#### Step 1 — Registration Form
- Fields: first name, last name, phone, email, password
- Terms of service and privacy policy consent checkbox
- Google OAuth option as an alternative
- Real-time validation on all fields

#### Step 2 — OTP Verification
- User chooses verification method: SMS or email
- 6-digit code entry form
- Resend timer with cooldown
- Dev mode support for testing (auto-fills code)

#### Step 3 — Account Setup
- Create organization/business name
- Generate unique URL slug (subdomain-style)
- Real-time slug availability checking
- Auto-suggestion based on business name

#### Step 4 — Site Interview
- Questionnaire loaded from admin-configured interview flow
- Collects information about the site's purpose, niche, audience, and goals
- Helps the AI agent understand the business for personalized SEO strategy
- Dynamic question types: text, multiple-choice, rating, select, conditional logic

#### Step 5 — Plan Selection
- 3-tier pricing display: Basic, Pro, Enterprise
- Feature comparison table per plan
- Billing period toggle (Monthly / Yearly)
- Coupon code input (if applicable)
- Highlights recommended plan

#### Step 6 — Payment
- CardCom payment gateway integration (supports Israeli Shekel)
- Fields: card number, expiry date, CVV, cardholder name
- Order summary with plan details and total
- Proration calculation for mid-cycle changes
- Free plan option (with coupon) bypasses payment

#### Step 7 — Success
- Confirmation screen with chosen plan details
- "Go to Dashboard" button redirects to the main app

### Accept Invite (`app/accept-invite/`)
- Dedicated page for users accepting team invitations
- Reads `token` from URL query parameter
- Calls verification endpoint to validate token and check expiration (7-day window)
- Displays: account name, inviter name, and assigned role
- **New user path**: Shows registration form (first name, last name, password) — user is created with `registrationStep: COMPLETED`, skipping the normal multi-step registration
- **Existing user path**: Shows login form (password only) — validates credentials, then links existing user to the account
- On success: creates session, sets `lastSelectedAccountId` to the inviting account, redirects to dashboard
- Handles error states: expired token, already accepted, invalid token, suspended membership

---

## 12. Dashboard Layout & Navigation

### Layout (`app/dashboard/layout.jsx`)

Sidebar + header layout:

#### Top Header Bar
- **Logo & Branding** — Ghost Post logo/icon
- **Site Selector Dropdown** — Switch between connected websites (multi-site support)
- **Breadcrumb Navigation** — Shows current section path
- **Global Search Bar** — Quick search across the platform
- **Notifications Bell** — Badge with unread count, opens notifications panel
- **User Menu Dropdown** — Profile, Settings, Help, Logout
- **Theme Toggle** — Dark / light mode
- **Language Selector** — i18n dropdown for UI language

#### Sidebar Navigation

**Always Visible:**
- **Dashboard** — Main command center
- **Agent** — AI insights and actions

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

**Admin** (SuperAdmin only — hidden for regular users):
- Accounts, Users, Subscriptions, Plans, Addons, Coupons
- Interview Flow, Push Questions, Bot Actions
- Translations, Backlinks, Website Settings

#### Navigation Features
- Accordion behavior — only one section expanded at a time
- Active section highlighting with visual indicator
- Icon per menu item
- Permission-based filtering — items hidden if user lacks access
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
- **Visitors** — Total unique visitors
- **Page Views** — Total page views
- **Sessions** — Total sessions
- **New Users** — First-time visitors
- **Engaged Sessions** — Sessions with meaningful engagement (>10s, 2+ pages, or conversion)

Each card shows: current value, trend arrow (↑/↓), percentage change, color-coded indicator (green = positive, red = negative).

### Traffic Chart
Custom SVG multi-line area chart:
- 5 toggleable metrics (each legend item clickable)
- Date presets: 7d, 30d, 90d, 180d, 365d, custom range
- Automatic comparison period calculation
- Hover tooltip with crosshair showing exact values
- Animated sine-wave loading state while fetching

**Data Sources:** Google Analytics 4 (GA4) via OAuth, Google Search Console (GSC) — clicks, impressions, average position (3-day data lag)

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
  category        InsightCategory                     // CONTENT, TRAFFIC, KEYWORDS, COMPETITORS, TECHNICAL
  type            InsightType                         // DISCOVERY, SUGGESTION, ACTION, ANALYSIS, ALERT
  title           String
  description     String
  priority        Priority        @default(MEDIUM)    // HIGH, MEDIUM, LOW
  status          InsightStatus   @default(PENDING)   // PENDING, APPROVED, REJECTED, EXECUTED, FAILED, EXPIRED, RESOLVED
  actionPayload   Json?                               // Data needed to execute an ACTION-type insight
  metadata        Json?                               // Additional context (metrics, URLs, entity IDs)
  expiresAt       DateTime?                           // Auto-expire stale insights (30 days)
  resolvedAt      DateTime?                           // Auto-resolve when issue no longer detected
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

model AgentRun {
  id              String          @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String          @db.ObjectId
  siteId          String          @db.ObjectId
  status          RunStatus       @default(RUNNING)   // RUNNING, COMPLETED, FAILED
  insightsFound   Int             @default(0)
  startedAt       DateTime        @default(now())
  completedAt     DateTime?
  error           String?
}
```

### 14 Analysis Modules

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
| `DISCOVERY` | Found something noteworthy — informational, no action needed |
| `SUGGESTION` | Recommends a specific action for the user to consider |
| `ACTION` | Agent can execute this automatically — requires user approval first |
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
  - Aggregate insights → "{titleKey}" (e.g., "staleContent" — one per site)
```

**Per-run deduplication flow:**
1. Generate all new insights from current analysis
2. Build `currentDedupKeys` set from new insights
3. Fetch existing non-terminal insights (PENDING, EXECUTED, APPROVED, FAILED)
4. **Still relevant** (key found in both) → update data if status allows
5. **Stale** (old key not in current) → mark as `RESOLVED`
6. **New** (key not in existing) → insert new insight

### Cannibalization Engine (3-Layer Hybrid)

A specialized multi-layer detection system inside the agent:

**Layer 1 — Proactive** (no GSC needed):
- Analyzes published entities for title/H1 similarity (Jaccard index), matching focus keywords, URL hierarchy overlap
- Output type: `PROACTIVE`

**Layer 2 — Reactive** (GSC data):
- Finds queries where multiple pages from the same site rank
- Thresholds: minimum 25 impressions per query, each page ≥ 8 impressions
- Output type: `REACTIVE_GSC`

**Layer 3 — Semantic** (AI verification):
- Feeds Layer 1 + Layer 2 candidates to Gemini for intent verification
- AI confirms whether pages truly compete or serve different intents
- Output type: `SEMANTIC_AI` or `AI_VERIFIED` (multi-layer confirmation)
- Returns: confidence score (0–100), recommended action (`MERGE`, `CANONICAL`, `301_REDIRECT`, `DIFFERENTIATE`), detection signals

**Each cannibalization issue includes:**
- Competing URLs/entities with titles, H1s, focus keywords
- Confidence percentage
- Recommended action with reason
- Verification checks (e.g., `SHARED_KEYWORDS: critical`, `TITLE_SIMILARITY: high`)

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
   - Run all 14 analysis modules in parallel
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

**`missingSeo` (ACTION — can be auto-fixed):**
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
3. Modal calls `/api/agent/insights/{id}/fix` to generate fix proposals
4. User reviews generated proposals (e.g., meta titles/descriptions)
5. User approves → fix applied to WordPress via plugin API
6. `executionResult` updated with results
7. Status transitions: `PENDING` → `APPROVED` → `EXECUTED`

### Cannibalization Fix Execution Flow

The fix API (`/api/agent/insights/{id}/fix`) supports multiple modes for the full cannibalization resolution pipeline:

| Mode | Description |
|------|-------------|
| `preview` | Generate AI fix proposals (action type, SEO changes, merge instructions) |
| `regenerate` | Regenerate a single item's proposal |
| `generate` | Generate full merged content for a MERGE proposal (title, body, SEO, images) |
| `apply-generated` | Apply previously generated merged content to WordPress |
| `apply` | Apply approved proposals directly (for non-MERGE fixes like DIFFERENTIATE) |

**Fix Types & Actions:**

| Action | Description | WordPress Effects |
|--------|-------------|-------------------|
| `MERGE` | Combine two pages into one comprehensive post | Update primary post content/SEO, create 301 redirect from secondary, trash secondary post, request GSC re-index |
| `CANONICAL` | Set canonical tag on secondary page | Update canonical URL on secondary post via plugin |
| `301_REDIRECT` | Redirect redundant page to authoritative one | Create 301 redirect via plugin, trash secondary post |
| `DIFFERENTIATE` | Give each page distinct focus keywords/angles | Update SEO meta (title, description, focus keyword) on both posts |

**MERGE Flow (most complex):**
1. `preview` → `generateCannibalizationFix()` analyzes both pages, recommends action, provides SEO proposals
2. User reviews proposal in FixPreviewModal (primary page selection, merged SEO, merge instructions)
3. `generate` → `generateMergedContent()` creates full article via Gemini (with optional featured/content images via AI generation)
4. User reviews generated content in editor
5. `apply-generated` → `applyMergedContent()` pushes to WordPress:
   - Updates primary post with merged content + SEO
   - Creates 301 redirect from secondary URL → primary URL
   - Trashes secondary post
   - Requests GSC URL re-indexing for primary page

**Credit Cost:** `CANNIBALIZATION_FIX` = 50 credits per fix execution

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
- **Approve** — Accept the AI recommendation
- **Reject** — Discard the recommendation
- **Execute** / **Fix with AI** — Generate and apply fixes (triggers FixPreviewModal)

**Run Analysis Button:** Manual trigger with loading state; polls for completion every 2 seconds.

### Internationalization

All user-visible strings use i18n translation keys:
- `agent.insights.{insightType}.title` — Insight titles (e.g., "Stale Content Found")
- `agent.insights.{insightType}.description` — Insight descriptions
- `agent.categories.{CATEGORY}` — Category labels
- `agent.types.{TYPE}` — Type labels
- `agent.priorities.{PRIORITY}` — Priority labels
- `agent.detailLabels.{field}` — Detail field labels (e.g., "Search Volume")

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

A **9-step wizard** for bulk AI content generation:

| Step | Name | Description |
|------|------|-------------|
| 1 | Campaign | Create new or select existing campaign |
| 2 | Post Count | Number of articles to generate |
| 3 | Schedule | Start/end dates, publishing days, publish time (fixed or random range) |
| 4 | Article Types | Mix of content types (SEO Article, Blog Post, Guide, How-To, Listicle, Comparison, Review, News, Tutorial, Case Study) |
| 5 | Content Settings | Word count range (min/max), featured image toggle, content images toggle, custom prompt |
| 6 | Subjects | Main topics for content pieces |
| 7 | Keywords | Target keywords (one per article) |
| 8 | Prompts | Additional custom instructions for the AI |
| 9 | Summary | Review all settings before creating |

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

**Recommendations:** Three severity levels — Warning (auto-fixable with "Apply Fix" button), Info (should-fix), Suggestion (nice-to-have).

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
1. **Content Publishing** — Auto-publishes scheduled content to WordPress
2. **Internal Linking** — Auto-adds relevant internal links to content
3. **Image Optimization** — Compresses and optimizes images
4. **Meta Updates** — Auto-updates meta tags using AI

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
- **"Save and Populate"** — Sync from WordPress
- **"Discover by Crawling"** — Find new entity types
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

**Stats Cards (4):** Total Backlinks, Referring Domains, Domain Authority, New Opportunities — each with trend indicator.

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
- **PLATFORM**: Listings created by Ghost Post admins (curated marketplace)
- **USER**: Listings created by users from their own connected sites (peer-to-peer marketplace)

#### Payment Methods
- **PLAN_ALLOCATION**: Monthly backlink quota included in the user's subscription plan
- **DIRECT**: Direct payment via CardCom (standard checkout)
- **AI_CREDITS**: Pay with AI credits instead of money

#### Fulfillment Workflow
1. **PENDING** — Buyer places order (selects listing, target URL, anchor text)
2. **APPROVED** — Seller/admin reviews and approves the request
3. **PUBLISHED** — Link is live on the seller's site (verified URL stored)
4. **REJECTED** — Seller/admin declines with reason; refund capability

#### SEO Metrics
Each listing displays: Domain Authority (DA), Domain Rating (DR), Estimated Monthly Traffic — fetched via `GET /api/backlinks/domain-metrics`

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

**Path:** `app/dashboard/admin/` — Only visible to `isSuperAdmin` users.

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
- **Accounts** — Manage business accounts
- **Addons** — Manage add-on products with pricing/features
- **Bot Actions** — Configure AI agent action templates
- **Push Questions** — Distribute interview questions
- **Translations** — Manage UI translation strings across languages
- **Website Settings** — Site-specific admin configuration
- **Backlinks** — Admin backlink management

---

# Part IV: Systems & Integration

---

## 24. WordPress Plugin System

### Dynamic Plugin Generation

The plugin is **dynamically generated per-site** from JavaScript template files at:
`app/api/sites/[id]/download-plugin/plugin-templates/`

Each template is a JS function that returns PHP code with site-specific configuration baked in.

### Generated ZIP Structure
```
ghost-post-connector/
├── ghost-post-connector.php              (main entry point)
├── includes/
│   ├── config.php                        (site-specific: ID, key, secret, API URL)
│   ├── class-ghost-post.php              (main orchestrator)
│   ├── class-gp-api-handler.php          (HTTP communication)
│   ├── class-gp-request-validator.php    (HMAC signature verification)
│   ├── class-gp-content-manager.php      (post/page CRUD)
│   ├── class-gp-media-manager.php        (image upload)
│   ├── class-gp-seo-manager.php          (Yoast + Rank Math)
│   ├── class-gp-cpt-manager.php          (custom post types)
│   ├── class-gp-acf-manager.php          (ACF fields)
│   ├── class-gp-updater.php              (auto-update mechanism)
│   ├── class-gp-entity-sync.php          (webhook-based entity sync)
│   ├── class-gp-redirections-manager.php (redirect CRUD + matching)
│   └── class-gp-i18n.php                (translation support)
├── admin/
│   ├── views/
│   │   ├── dashboard-page.php
│   │   ├── redirections-page.php
│   │   └── settings-page.php
│   ├── css/admin.css
│   └── js/admin.js
├── readme.txt
└── uninstall.php
```

### Plugin REST Endpoints (WordPress side)
- `POST /wp-json/ghost-post/v1/posts` — Receive and publish content
- `POST /wp-json/ghost-post/v1/entities/sync` — Real-time entity updates
- `GET /wp-json/ghost-post/v1/check-update` — Version check

### Security
- HMAC-SHA256 signature on all incoming requests
- Site key + site secret pair
- Timestamp validation (prevents replay attacks)
- WordPress nonce for admin actions

### SEO Plugin Compatibility
- **Yoast SEO**: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, etc.
- **Rank Math**: `rank_math_title`, `rank_math_description`, etc.

### Redirect Management (Plugin-Side)
- `sanitize_redirect_url()` — Decodes percent-encoded URLs to Unicode
- `normalize_path()` — Strips trailing slashes
- `maybe_redirect()` — Hooks into `template_redirect`, matches with trailing-slash tolerance + Unicode decode
- `push_redirect_webhook()` — Pushes changes back to platform
- Detects: Redirection, Yoast Premium, Rank Math, Safe Redirect Manager, Simple 301 Redirects

### Auto-Update System
- Checks platform's `/api/plugin/version` endpoint
- Compares current vs latest version
- Displays WordPress-native update notice
- `after_update()` cleans WP's `update_plugins` transient

### Version Management
- Single source: `app/api/plugin/version.js` — `PLUGIN_VERSION` + `PLUGIN_CHANGELOG`
- Bump by 0.0.1 for every plugin change

### Connection Protocol

```
1. User creates Site → POST /api/sites → generates siteKey + siteSecret
2. Installs WordPress plugin → enters siteKey
3. Plugin calls POST /api/plugin/auth/verify {siteKey}
4. Platform returns siteSecret + site info
5. Plugin stores siteSecret encrypted in wp_options
6. Plugin sends signed verification:
   Headers: X-Site-Key, X-Signature (HMAC of body)
   Body: { verified: true, permissions: [...] }
7. Platform verifies HMAC → updates connectionStatus: CONNECTED
8. Plugin starts heartbeat (every 5 minutes) → POST /api/plugin/ping
9. Bidirectional sync is now active
```

---

## 25. Background Jobs & Content Pipeline

### Content Lifecycle

```
Campaign Created (via AI Content Wizard)
    ↓
Content items set to SCHEDULED with target dates
    ↓
[Cron: process-content] — Picks up due SCHEDULED items
    ↓
Status: SCHEDULED → PROCESSING → dispatches generate-article worker
    ↓
[Worker: generate-article] — AI generates the article
    ↓
Status: PROCESSING → READY_TO_PUBLISH
    ↓
[Cron: publish-content] — Picks up READY_TO_PUBLISH items
    ↓
Dispatches publish-article worker (max 1 per site per run)
    ↓
[Worker: publish-article] — Publishes to WordPress
    ↓
Status: READY_TO_PUBLISH → PUBLISHED
```

### Cron Jobs (Dispatchers)

#### `sync-entities` — `/api/cron/sync-entities`
- **Frequency:** Hourly
- **Purpose:** Sync entities from all connected websites
- **Process:** Find active sites with `connectionStatus=CONNECTED` → acquire sync lock → execute sync → release lock. Skips WP sites with plugin (real-time webhooks handle those).
- **Output:** Per-site stats (created/updated/unchanged)

#### `process-content` — `/api/cron/process-content`
- **Frequency:** Hourly
- **Purpose:** Move scheduled content into AI generation
- **Process:** Atomically acquire batch of due SCHEDULED items → flip to PROCESSING → recover stale locks (>10 min stuck) → dispatch up to 50 `generate-article` workers in parallel
- **Smart locking:** WHERE guard prevents concurrent processing

#### `publish-content` — `/api/cron/publish-content`
- **Frequency:** Hourly
- **Purpose:** Publish ready content to WordPress
- **Process:** Fetch READY_TO_PUBLISH items → tenant throttle (max 1 per site per run) → dispatch `publish-article` per item → auto-complete campaigns when all done
- **Retry:** Max 3 publish attempts per item

#### `agent-analysis` — `/api/cron/agent-analysis`
- **Frequency:** Plan-based (Basic: weekly, Pro/Enterprise: daily)
- **Purpose:** Run AI analysis for actionable insights
- **Process:** Expire old insights (>14 days) → find eligible sites → check cooldown → run analysis → store insights

### Worker Jobs (Executors)

#### `generate-article` — `/api/worker/generate-article`
- **Triggered by:** `process-content` cron
- **Input:** Content ID via HMAC-signed request
- **Process:**
  1. Fetch content + campaign settings
  2. Build AI prompt (word count, article type, keyword, image requirements, SEO metadata, slug rules)
  3. Call Gemini API (max 8192 tokens, temperature 0.7)
  4. Parse JSON response, validate, clean
  5. Update content: HTML body, featured image alt, SEO metadata, word count
  6. Status: PROCESSING → READY_TO_PUBLISH

#### `publish-article` — `/api/worker/publish-article`
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
| **LimitGuardContext** | Resource limits enforcement — blocks actions when limits exceeded |
| **NotificationsContext** | Notification list, unread count, read status, filtering, real-time updates |

---

## 27. Middleware

**Path:** `middleware.js`

- **Locale detection:** Sets `locale` cookie based on request domain (`.co.il` → `he`, all others → `en`)
- **Cookie:** 1-year expiry, `SameSite=Lax`, path `/`
- **Scope:** All routes except `_next`, `api`, static assets
- **No authentication checks** — Auth handled by individual API routes

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
| POST | `/api/campaigns/generate-subjects` | AI subject generation |
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
| `permissions.js` | RBAC — module/capability checking system |
| `auth-permissions.js` | Permission checking helper functions |
| `account-utils.js` | Account ownership, limits, add-on management, AI credit operations |
| `account-limits.js` | Resource usage tracking vs. plan limits (sites, members, credits, audits) |
| `site-keys.js` | Site key/secret generation, HMAC-SHA256 signature creation & verification |
| `wp-api-client.js` | WordPress REST API client — CRUD via HMAC-signed requests |
| `worker-auth.js` | Background worker authentication via HMAC signatures |
| `cloudinary-upload.js` | Image & media upload to Cloudinary CDN |
| `cardcom.js` | CardCom payment gateway integration |
| `proration.js` | Subscription billing proration calculations |
| `mailer.js` | Email service (registration, invites, notifications) |
| `notifications.js` | Notification creation and broadcasting |
| `google-integration.js` | Google Analytics 4 + Search Console OAuth integration |
| `google-oauth.js` | Google authentication flow management |
| `fetch-interceptor.js` | Global fetch wrapper — auto-logout on 401 |
| `domain-metrics.js` | SEO metrics calculation and domain analysis |
| `agent-analysis.js` | AI agent analysis engine — generates insights from site data |
| `agent-fix.js` | AI agent fix execution — content merging, redirect creation, re-indexing |
| `competitor-scraper.js` | Competitor website scraping and analysis |
| `entity-sync.js` | WordPress entity synchronization (posts, pages, custom types) |
| `cannibalization-engine.js` | Content cannibalization detection — competing pages on same keywords |
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
1. Create Site → POST /api/sites → siteKey + siteSecret generated
2. Install plugin → enter siteKey in settings
3. Plugin calls POST /api/plugin/auth/verify → gets siteSecret
4. Plugin stores siteSecret encrypted in wp_options
5. Plugin sends signed verification → HMAC(body, siteSecret)
6. Platform verifies → connectionStatus: CONNECTED
7. Plugin starts heartbeat (every 5 min) → POST /api/plugin/ping
8. Bidirectional sync active via HMAC-signed REST API calls
```

### Content Generation with AI Flow

```
1. User creates campaign via AI Content Wizard (9 steps)
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

**Ghost Post Platform** is a comprehensive AI-powered SEO and content management system combining:

1. **Modern Architecture** — Next.js 15, React 19, MongoDB, Prisma
2. **Advanced AI** — Gemini 2.0 with function calling and structured output
3. **Full Multi-Tenancy** — Accounts, Users, Sites with complete separation
4. **Granular Permissions** — 50+ permissions, custom roles
5. **Dynamic Subscriptions** — Plans + Add-Ons with no hardcoded logic
6. **Deep WordPress Integration** — Custom plugin with HMAC authentication
7. **AI-Powered Interview** — 12 question types, bot actions, flow engine
8. **Full i18n** — 12 languages, RTL support
9. **AI Credits Economy** — Precise tracking, logging, refills
10. **Automated Content Pipeline** — Cron dispatchers + worker executors
11. **Complete Technical SEO** — Redirections, WebP conversion, site audits
12. **Competitor Intelligence** — Discovery, scanning, gap analysis
13. **Scalability** — Ready for thousands of accounts and millions of entities
