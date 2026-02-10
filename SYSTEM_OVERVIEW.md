# Ghost Post Platform - תיעוד מערכת מלא ומפורט (חלק 1)

> **📚 מסמך זה הוא חלק 1 מתוך 2**
>
> - **חלק 1** (מסמך זה): ארכיטקטורה, מודל נתונים, הרשאות, מינויים
> - **[חלק 2](SYSTEM_OVERVIEW_PART2.md)**: Add-Ons, AI Credits, Interview System, WordPress Integration, API Documentation, תהליכי עבודה מפורטים

---

## תיאור כללי והיקף

**Ghost Post** היא פלטפורמת אוטומציה מתקדמת מונעת AI לניהול SEO ותוכן עבור אתרים. המערכת מאפשרת לעסקים לנהל אתרים מרובים, לייצר תוכן בצורה חכמה, לעקוב אחר מילות מפתח, ולבצע ביקורות SEO באמצעות בינה מלאכותית.

### חזון המוצר

המערכת נועדה להיות "פלטפורמת SEO האולטימטיבית" שמשלבת:

- **אוטומציה מלאה** - מהראיון הראשוני ועד פרסום התוכן
- **בינה מלאכותית** - לא רק כלי עזר אלא שותף אקטיבי
- **אינטגרציה עמוקה** - חיבור מלא לאתר ה-WordPress
- **מדידה ומעקב** - כל מטריקת SEO חשובה במקום אחד

### היקף המערכת

- **תמיכה ב-Multi-Tenancy**: אלפי ארגונים במקביל
- **תמיכה בסקלה**: מאתר בודד ועד רשתות של מאות אתרים
- **רב-לשוניות**: 12 שפות מובנות + תשתית להרחבה
- **רב-מטבעיות**: USD, ILS, EUR, GBP
- **רב-אזוריות**: תמיכה ב-timezones שונים

## ארכיטקטורה טכנולוגית מפורטת

### טכנולוגיות ליבה

#### Frontend Stack

- **Framework**: Next.js 15.0.0+ (App Router)
  - Server Components לביצועים מקסימליים
  - Server Actions ל-mutations ללא API routes
  - Streaming SSR לתוכן דינמי
  - Automatic Code Splitting
  - Image Optimization מובנה
- **React**: 19.0.0+
  - React Server Components
  - Suspense Boundaries
  - Error Boundaries
  - Context API למצב גלובלי
- **Styling**: CSS Modules עם Nested Syntax

  ```css
  .card {
    background: var(--card);
    padding: 1rem;

    .title {
      font-size: 1.5rem;

      &:hover {
        color: var(--primary);
      }
    }

    .dark & {
      background: var(--gradient-card);
    }
  }
  ```

- **UI Libraries**:
  - `framer-motion` (12.0.0+) - אנימציות חלקות
  - `lucide-react` (0.460.0+) - 1000+ אייקונים
  - `@tiptap/react` (3.18.0+) - עורך WYSIWYG מתקדם
  - `@floating-ui/dom` (1.7.5+) - Tooltips ו-Popovers

#### Backend Stack

- **Runtime**: Node.js 18+
- **Framework**: Next.js API Routes
- **Database**: MongoDB 6.0+
  - Atlas Cloud או On-Premise
  - Replica Set לזמינות גבוהה
  - Change Streams לעדכונים בזמן אמת
- **ORM**: Prisma 6.0.0+
  - Type-Safe Database Client
  - Schema Management
  - Migrations
  - Seeding
- **Authentication**: Custom JWT + Sessions
  - bcryptjs לסיסמאות (cost factor: 10)
  - Session-based auth עם MongoDB storage
  - OTP verification (SMS + Email)
  - OAuth 2.0 (Google, GitHub, Facebook, Apple)

#### AI Infrastructure

- **Provider**: Google AI (Gemini)
- **SDK**: Vercel AI SDK v6.0.50+
- **Models**:
  - Text: `gemini-2.0-flash` (Fast, cost-effective)
  - Images: `imagen-3.0-generate-002`
- **Capabilities**:
  - Text Generation (`generateText`)
  - Streaming (`streamText`)
  - Structured Output (`generateObject` + Zod)
  - Function Calling (Tool Use)
- **Configuration** (`lib/ai/gemini.js`):

  ```javascript
  export const MODELS = {
    TEXT: "gemini-2.0-flash",
    IMAGE: "imagen-3.0-generate-002",
  };

  export function getTextModel() {
    return google(MODELS.TEXT);
  }

  // Usage
  const result = await generateText({
    model: getTextModel(),
    system: "You are an SEO expert...",
    prompt: "Generate a blog post about...",
    temperature: 0.7,
    maxTokens: 2048,
  });
  ```

#### Email & Notifications

- **Provider**: nodemailer 7.0.13+
- **Templates**: HTML email templates
- **Use Cases**:
  - Registration verification (OTP)
  - Password reset
  - Team invitations
  - Billing notifications
  - Audit reports

### ארכיטכטורת תיקיות

```
gp-platform/
├── app/                          # Next.js App Router
│   ├── layout.jsx               # Root layout (providers, fonts)
│   ├── page.jsx                 # Homepage
│   ├── globals.css              # Global styles
│   │
│   ├── api/                     # API Routes
│   │   ├── auth/               # Authentication endpoints
│   │   ├── user/               # User management
│   │   ├── account/            # Account management
│   │   ├── sites/              # Sites CRUD
│   │   ├── entities/           # Content from WordPress
│   │   ├── interview/          # Interview system
│   │   ├── settings/           # Settings management
│   │   ├── subscription/       # Subscription & billing
│   │   ├── translations/       # i18n management
│   │   ├── plugin/             # WordPress plugin APIs
│   │   ├── public/             # Public APIs (no auth)
│   │   └── admin/              # Super admin APIs
│   │       ├── accounts/
│   │       ├── plans/
│   │       ├── addons/
│   │       ├── subscriptions/
│   │       ├── interview-flow/
│   │       └── bot-actions/
│   │
│   ├── auth/                    # Auth pages
│   │   ├── login/
│   │   ├── register/
│   │   ├── accept-invite/
│   │   └── components/
│   │
│   ├── dashboard/               # Protected dashboard
│   │   ├── layout.jsx          # Dashboard layout + sidebar
│   │   ├── page.jsx            # Dashboard home
│   │   ├── entities/           # WordPress content
│   │   ├── automations/        # Automation workflows
│   │   ├── link-building/      # Link building
│   │   ├── seo-frontend/       # On-page SEO
│   │   ├── seo-backend/        # Technical SEO
│   │   ├── site-audit/         # Site audits
│   │   ├── strategy/           # Keyword strategy
│   │   ├── settings/           # Account settings
│   │   ├── profile/            # User profile
│   │   └── admin/              # Super admin UI
│   │       ├── accounts/
│   │       ├── plans/
│   │       ├── addons/
│   │       ├── subscriptions/
│   │       ├── interview-flow/
│   │       └── bot-actions/
│   │
│   ├── components/              # Shared components
│   │   └── ui/                 # UI components library
│   │
│   ├── context/                 # React contexts
│   │   ├── auth-modal-context.jsx
│   │   ├── locale-context.jsx
│   │   ├── site-context.jsx
│   │   ├── theme-context.jsx
│   │   └── user-context.jsx
│   │
│   ├── hooks/                   # Custom React hooks
│   │   └── usePermissions.js
│   │
│   └── styles/                  # Global styles
│       ├── fonts.css
│       └── theme.css
│
├── lib/                         # Server-side utilities
│   ├── prisma.js               # Prisma client singleton
│   ├── permissions.js          # Permission system
│   ├── auth-permissions.js     # Auth permission helpers
│   ├── account-utils.js        # Account business logic
│   ├── site-keys.js            # Site key generation & HMAC
│   ├── wp-api-client.js        # WordPress plugin client
│   ├── mailer.js               # Email service
│   ├── google-oauth.js         # Google OAuth
│   │
│   ├── ai/                     # AI services
│   │   ├── index.js           # Main exports
│   │   ├── gemini.js          # Gemini service
│   │   ├── service.js         # Legacy AI service
│   │   └── interview-ai.js    # Interview-specific AI
│   │
│   ├── bot-actions/            # Bot action system
│   │   ├── index.js           # Registry
│   │   ├── executor.js        # Action executor
│   │   └── handlers/          # Action handlers
│   │       ├── crawl-website.js
│   │       ├── detect-platform.js
│   │       ├── analyze-competitors.js
│   │       ├── generate-keywords.js
│   │       ├── create-site-account.js
│   │       └── ...
│   │
│   └── interview/              # Interview system
│       ├── flow-engine.js     # Flow logic & conditions
│       └── functions/         # Interview functions
│
├── prisma/                      # Database schema & seeds
│   ├── schema.prisma          # Complete data model
│   ├── seed.js                # Seeding script
│   └── seeds/
│       └── interview-seed.js
│
├── i18n/                        # Internationalization
│   ├── config.js              # i18n configuration
│   ├── get-dictionary.js      # Dictionary loader
│   ├── server.js              # Server-side i18n
│   └── dictionaries/
│       ├── en.json
│       ├── he.json
│       └── fr.json
│
├── scripts/                     # Utility scripts
│   ├── seed-interview-questions.js
│   ├── check-translations.js
│   ├── fill-missing-translations.js
│   └── ...
│
├── public/                      # Static assets
│   └── fonts/
│       └── polin/
│
├── docs/                        # Documentation
│   └── interview-system-guide.md
│
├── .env                         # Environment variables
├── package.json
├── next.config.mjs
├── prisma.config.ts
├── tsconfig.json
├── jsconfig.json
└── middleware.js                # Next.js middleware (auth, i18n)
```

### שירותי AI ותשתית מפורטת

#### ארכיטקטורת AI (`lib/ai/`)

המערכת כוללת 3 שכבות AI:

1. **שכבת בסיס** (`gemini.js`):

   ```javascript
   // Centralized model configuration
   export const MODELS = {
     TEXT: "gemini-2.0-flash",
     IMAGE: "imagen-3.0-generate-002",
   };

   // Simple text generation
   export async function generateTextResponse({
     system,
     prompt,
     temperature = 0.7,
   }) {
     const model = getTextModel();
     const result = await generateText({ model, system, prompt, temperature });
     return result.text;
   }

   // Streaming response
   export async function streamTextResponse({ system, prompt }) {
     const model = getTextModel();
     const result = streamText({ model, system, prompt });
     return result.toDataStreamResponse(); // For API routes
   }

   // Structured output with validation
   export async function generateStructuredResponse({
     system,
     prompt,
     schema,
   }) {
     const model = getTextModel();
     const result = await generateObject({
       model,
       system,
       prompt,
       schema, // Zod schema
     });
     return result.object; // Type-safe!
   }
   ```

2. **שכבת Interview** (`interview-ai.js`):
   - System prompts מותאמים לראיון
   - Function calling ל-bot actions
   - Context management
   - Personality injection

3. **שכבת Service** (`service.js` - Legacy):
   - תמיכה ב-OpenAI/Anthropic (backward compatibility)
   - Abstraction layer

#### דוגמת שימוש ב-AI

```javascript
// In API route: /api/interview/chat
import { generateTextResponse } from "@/lib/ai/gemini";
import { z } from "zod";

// Simple text
const response = await generateTextResponse({
  system: "You are an SEO assistant helping with site setup.",
  prompt: userMessage,
  temperature: 0.7,
});

// Structured output
import { generateStructuredResponse } from "@/lib/ai/gemini";

const keywords = await generateStructuredResponse({
  system: "Extract SEO keywords from this website.",
  prompt: `Website: ${websiteUrl}`,
  schema: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
    longtail: z.array(z.string()),
  }),
});
// keywords = { primary: [...], secondary: [...], longtail: [...] }
```

## מודל עסקי ותפיסה מפורטת

### היררכיה ארגונית - תיאור מלא

המערכת בנויה על מודל היררכי בן 3 שכבות עם הפרדה מוחלטת:

#### 1. Account (חברה/ארגון)

**הגדרה**: יישות עסקית המייצגת חברה, ארגון או עסק עצמאי.

**שדות מרכזיים**:

```prisma
model Account {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  name            String                          // שם החברה
  slug            String   @unique                // URL-friendly identifier
  logo            String?                         // URL ללוגו
  website         String?                         // אתר החברה
  industry        String?                         // תעשייה
  timezone        String   @default("UTC")        // אזור זמן
  defaultLanguage Language @default(EN)           // שפת ברירת מחדל
  billingEmail    String                          // מייל לחיובים
  generalEmail    String                          // מייל כללי
  isActive        Boolean  @default(true)

  // AI Credits Economy
  aiCreditsBalance   Int   @default(0)            // יתרה נוכחית
  aiCreditsUsedTotal Int   @default(0)            // סה"כ שימוש היסטורי

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  members         AccountMember[]                 // חברי הצוות
  sites           Site[]                          // אתרי החברה
  subscription    Subscription?                   // מינוי פעיל
  payments        Payment[]                       // תשלומים
  roles           Role[]                          // תפקידים מותאמים
  aiCreditsLogs   AiCreditsLog[]                  // לוג קרדיטים
}
```

**חוקים עסקיים**:

- Account נוצר בזמן הרישום על ידי המשתמש הראשון
- המשתמש הראשון הופך אוטומטית ל-Owner
- Account יכול להכיל Sites מרובים (לפי התוכנית)
- Subscription משויך ל-Account, לא ל-User
- רק Owner או Super Admin יכולים למחוק Account

**Use Cases**:

- חברת שיווק עם 20 לקוחות → 20 Sites באותו Account
- פרילנסר עם 5 לקוחות → 5 Sites באותו Account
- ארגון עם מחלקות → כל מחלקה Site נפרד

#### 2. User (משתמשים)

**הגדרה**: אדם בודד שיכול להיות חבר במספר Accounts.

**שדות מרכזיים**:

```prisma
model User {
  id                    String             @id @default(auto()) @map("_id") @db.ObjectId
  email                 String             @unique
  firstName             String?
  lastName              String?
  phoneNumber           String?
  password              String?                    // Hashed with bcryptjs
  image                 String?                    // Profile picture
  emailVerified         DateTime?
  phoneVerified         DateTime?
  primaryAuthMethod     AuthMethod         @default(EMAIL)
  selectedLanguage      Language?                  // Override account language
  preferredCurrency     Currency?
  lastSelectedAccountId String?            @db.ObjectId  // Remember last account
  registrationStep      RegistrationStep   @default(VERIFY)
  consentGiven          Boolean            @default(false)
  consentDate           DateTime?
  isActive              Boolean            @default(true)
  isSuperAdmin          Boolean            @default(false)  // Platform admin
  lastLoginAt           DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  // Relations
  authProviders      AuthProvider[]                // OAuth providers
  sessions           Session[]
  accountMemberships AccountMember[]               // Membership in accounts
  otpCodes           OtpCode[]
  interviews         UserInterview[]
  sitePreferences    UserSitePreference[]          // Per-site preferences
}
```

**חוקים עסקיים**:

- User יכול להיות Owner של Account אחד בלבד
- User יכול להיות Member ב-Accounts מרובים
- User יכול לעבוד עם OAuth (Google, GitHub, Facebook, Apple) או Email/Password
- Super Admin (`isSuperAdmin: true`) יכול לגשת לאזור הניהול
- User שמחק את כל ה-Accounts שלו נשאר במערכת (soft delete)

**Authentication Methods**:

```javascript
enum AuthMethod {
  EMAIL     // Email + Password
  GOOGLE    // Google OAuth
  GITHUB    // GitHub OAuth
  FACEBOOK  // Facebook OAuth
  APPLE     // Apple Sign In
}
```

#### 3. AccountMember (חברות בצוות)

**הגדרה**: קשר בין User ל-Account עם תפקיד והרשאות.

**שדות מרכזיים**:

```prisma
model AccountMember {
  id                 String            @id @default(auto()) @map("_id") @db.ObjectId
  accountId          String            @db.ObjectId
  userId             String?           @db.ObjectId       // null for pending invites
  roleId             String            @db.ObjectId
  isOwner            Boolean           @default(false)    // Only one owner per account
  lastSelectedSiteId String?           @db.ObjectId       // Remember last site selection
  invitedBy          String?           @db.ObjectId
  invitedAt          DateTime?
  inviteEmail        String?                              // Email for pending invites
  inviteToken        String?                              // Unique token for acceptance
  inviteLanguage     String?                              // Language for invite email
  joinedAt           DateTime          @default(now())
  status             MemberStatus      @default(ACTIVE)

  account            Account           @relation(fields: [accountId], references: [id], onDelete: Cascade)
  user               User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
  role               Role              @relation(fields: [roleId], references: [id])

  @@unique([accountId, userId])
  @@unique([accountId, inviteEmail])
  @@index([userId, isOwner])
  @@index([inviteToken])
}

enum MemberStatus {
  PENDING    // Invited but not accepted
  ACTIVE     // Active member
  SUSPENDED  // Temporarily suspended
  REMOVED    // Removed from account
}
```

**תהליך הזמנה**:

1. Owner/Admin שולח הזמנה עם `inviteEmail`
2. נוצר `inviteToken` ייחודי
3. נשלח מייל בשפה `inviteLanguage`
4. User לוחץ על הקישור ומקבל את ההזמנה
5. סטטוס משתנה ל-ACTIVE, `userId` מתמלא

#### 4. Site (אתרים)

**הגדרה**: אתר אינטרנט שמנוהל על ידי Account.

**שדות מרכזיים**:

```prisma
model Site {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  accountId       String   @db.ObjectId
  name            String                          // שם האתר
  url             String                          // https://example.com
  isActive        Boolean  @default(true)
  maintenanceMode Boolean  @default(false)
  platform        String?                         // wordpress, shopify, custom
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // WordPress Plugin Connection
  siteKey              String?                    // Public: gp_site_abc123
  siteSecret           String?                    // Private: secret_xyz...
  connectionStatus     SiteConnectionStatus @default(PENDING)
  lastPingAt           DateTime?                  // Last heartbeat from plugin
  pluginVersion        String?                    // Plugin version
  wpVersion            String?                    // WordPress version
  phpVersion           String?                    // PHP version
  wpTimezone           String?                    // WordPress timezone
  wpLocale             String?                    // WordPress locale (en_US, he_IL)
  sitePermissions      SitePermission[]           // Permissions granted by plugin

  // Auto-install (temporary, deleted after install)
  wpAdminUrl           String?
  wpAdminUsername      String?                    // Encrypted
  wpAdminPassword      String?                    // Encrypted
  autoInstallExpiresAt DateTime?

  // Entity Sync Tracking
  entitySyncStatus     EntitySyncStatus @default(NEVER)
  entitySyncProgress   Int?                       // 0-100
  entitySyncMessage    String?                    // "Syncing posts..."
  lastEntitySyncAt     DateTime?
  entitySyncError      String?

  // Tool Settings
  toolSettings         Json?                      // { autoConvertToWebp: true }

  account         Account               @relation(...)
  interview       Interview?                      // Site onboarding interview
  keywords        Keyword[]
  contents        Content[]
  redirections    Redirection[]
  audits          SiteAudit[]
  entityTypes     SiteEntityType[]                // posts, pages, projects, etc.
  entities        SiteEntity[]                    // The actual content items
  userPreferences UserSitePreference[]
  menus           SiteMenu[]

  @@index([siteKey])
}

enum SiteConnectionStatus {
  PENDING      // Site created, plugin not installed yet
  CONNECTING   // Auto-install in progress
  CONNECTED    // Plugin active and verified
  DISCONNECTED // Was connected, now unreachable
  ERROR        // Connection failed
}

enum SitePermission {
  CONTENT_READ, CONTENT_CREATE, CONTENT_UPDATE, CONTENT_DELETE, CONTENT_PUBLISH
  MEDIA_UPLOAD, MEDIA_DELETE
  SEO_UPDATE
  REDIRECTS_MANAGE
  SITE_INFO_READ
  CPT_READ, CPT_CREATE, CPT_UPDATE, CPT_DELETE      // Custom Post Types
  ACF_READ, ACF_UPDATE                               // Advanced Custom Fields
  TAXONOMY_READ, TAXONOMY_MANAGE
}
```

**WordPress Plugin Integration**:

```javascript
// Site Keys Generation (lib/site-keys.js)
import crypto from "crypto";

export function generateSiteKeys() {
  const siteKey = `gp_site_${crypto.randomBytes(16).toString("hex")}`;
  const siteSecret = crypto.randomBytes(32).toString("hex");
  return { siteKey, siteSecret };
}

// HMAC Signature Verification
export function verifyHmacSignature(payload, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}
```

**Plugin Communication Flow**:

```
1. Platform creates Site → generates siteKey + siteSecret
2. User installs WordPress plugin (manual or auto)
3. User enters siteKey in plugin settings
4. Plugin calls /api/plugin/auth/verify with siteKey
5. Platform returns siteSecret + site info
6. Plugin stores siteSecret securely
7. All future requests include HMAC signature:
   - Header: X-Site-Key: gp_site_abc123
   - Header: X-Signature: hmac_sha256_signature
8. Platform verifies signature before processing
```

### מערכת הרשאות מתקדמת - תיעוד מלא

- מערכת הרשאות גרנולרית עם 50+ הרשאות מובנות
- תפקידי מערכת (System Roles): Owner, Admin, Editor, Viewer
- אפשרות ליצור תפקידים מותאמים אישית (Custom Roles)
- הרשאות ברמת מודול ויכולת (MODULE_CAPABILITY):
  - `SITES_VIEW`, `CONTENT_EDIT`, `KEYWORDS_DELETE`, `SETTINGS_AI_EDIT` וכו'
- בעלי חשבונות (Owners) מקבלים אוטומטית את כל הגישות

### מודל מינויים ותשלום

המערכת כוללת מערכת מינויים מתקדמת:

#### תוכניות (Plans)

- תמחור חודשי ושנתי
- **Features** - רשימת יכולות (JSON array: `[{key, label}]`)
- **Limitations** - מגבלות דינמיות (JSON array: `[{key, label, value, type}]`)
- מגבלות נפוצות:
  - `maxMembers` - מספר חברי צוות
  - `maxSites` - מספר אתרים
  - `aiCredits` - קרדיטים ל-AI
  - `maxKeywords` - מספר מילות מפתח למעקב
  - `maxContent` - פריטי תוכן
  - `maxAddOnSeats`, `maxAddOnSites` - מגבלת רכישת add-ons

#### Add-Ons (תוספים)

- **סוגי Add-Ons**:
  - `SEATS` - חברי צוות נוספים
  - `SITES` - אתרים נוספים
  - `AI_CREDITS` - חבילות קרדיטים
  - `STORAGE`, `KEYWORDS`, `CONTENT`
- **סוגי חיוב**:
  - `RECURRING` - חיוב חוזר (חודשי/שנתי)
  - `ONE_TIME` - רכישה חד-פעמית

#### מערכת AI Credits

- כל Account מחזיק מאזן קרדיטים (`aiCreditsBalance`)
- מעקב אחר שימוש כולל (`aiCreditsUsedTotal`)
- לוג מפורט של שימוש בקרדיטים (`AiCreditsLog`):
  - `CREDIT` - הוספת קרדיטים (רכישה, חידוש מינוי)
  - `DEBIT` - שימוש (יצירת תוכן AI)
- קרדיטים מתווספים מהתוכנית ומ-Add-Ons

## פיצ'רים מרכזיים

### 1. מערכת Interview AI (ראיון אונבורדינג מתקדם)

מערכת ראיון חכמה המלווה משתמשים חדשים עם AI Bot:

**10 סוגי שאלות:**

1. `GREETING` - ברכה והצגה
2. `INPUT` - שדה קלט (text, url, email, number, textarea)
3. `INPUT_WITH_AI` - קלט שמפעיל ניתוח AI
4. `CONFIRMATION` - אישור Yes/No עם תצוגת מידע
5. `SELECTION` - בחירה בודדת
6. `MULTI_SELECTION` - בחירה מרובה
7. `DYNAMIC` - אפשרויות טעינה מ-API
8. `EDITABLE_DATA` - הצגת מידע ניתן לעריכה
9. `FILE_UPLOAD` - העלאת קבצים
10. `SLIDER` - טווח מספרי
11. `AI_SUGGESTION` - AI מציע, משתמש יכול לערוך
12. `AUTO_ACTION` - פעולה אוטומטית בלי קלט משתמש

**Flow Engine מתקדם:**

- מנוע תנאים (Conditions) עם אופרטורים: equals, notEquals, contains, exists, greaterThan, and, or
- תלויות בין שאלות (dependencies)
- פעולות אוטומטיות (`autoActions`)
- שמירה אוטומטית של תשובות

**Bot Actions:**
מערכת פעולות שה-AI יכול להפעיל:

- `crawlWebsite` - סריקת אתר ואיסוף מידע
- `detectPlatform` - זיהוי פלטפורמת האתר (WordPress, Shopify, וכו')
- `analyzeCompetitors` - ניתוח מתחרים
- `generateKeywords` - הצעת מילות מפתח
- `fetchArticles` - אחזור מאמרים מהאתר
- `analyzeWritingStyle` - ניתוח סגנון כתיבה
- `analyzeInternalLinks` - ניתוח קישורים פנימיים
- `createSiteAccount`, `updateSiteAccount` - ניהול חשבון
- `completeInterview` - השלמת הראיון

**ממשק שיחה עם AI:**

- מצב צ'אט (Chat Mode) להתייעצות עם ה-AI
- היסטוריית שיחה מלאה
- Function calling לפעולות אוטומטיות
- אינדיקטור התקדמות

### 2. ניהול אתרים מתקדם (Sites Management)

**חיבור WordPress Plugin:**

- Plugin מותאם אישית ל-WordPress
- התקנה אוטומטית או ידנית
- הזדהות מאובטחת עם HMAC-SHA256
- `siteKey` + `siteSecret` לאימות
- סטטוסים: PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR

**סנכרון Entities (תוכן):**

- סנכרון posts, pages, custom post types
- תמיכה ב-ACF (Advanced Custom Fields)
- תמיכה ב-Yoast/RankMath SEO
- תמיכה בטקסונומיות ומסוגי תוכן מותאמים
- סטטוסי סנכרון: NEVER, SYNCING, COMPLETED, ERROR, CANCELLED
- מעקב אחר התקדמות (`entitySyncProgress`: 0-100%)
- שמירת מידע מטא (metadata), SEO data, ACF data

**הרשאות מהאתר (SitePermissions):**

- `CONTENT_READ/CREATE/UPDATE/DELETE/PUBLISH`
- `MEDIA_UPLOAD/DELETE`
- `SEO_UPDATE`
- `REDIRECTS_MANAGE`
- `CPT_*` (Custom Post Types)
- `ACF_*` (Advanced Custom Fields)
- `TAXONOMY_*`

**כלים מתקדמים (Tools):**

- המרה אוטומטית לפורמט WebP
- ניהול תפריטים (Menus)
- שחזור שינויים (Revert)

### 3. ניהול תוכן חכם (Content Management)

**יצירת תוכן עם AI:**

- יצירת פוסטים לפי מילת מפתח
- יצירת מטא-תיאורים
- אופטימיזציה ל-SEO
- ניתוח וכתיבה בסגנון המותג

**מצבי תוכן:**

- `DRAFT` - טיוטה
- `SCHEDULED` - מתוזמן לפרסום
- `PUBLISHED` - מפורסם
- `ARCHIVED` - מאורכב

**סוגי תוכן:**

- `BLOG_POST` - פוסט בבלוג
- `PAGE` - עמוד
- `PRODUCT` - מוצר (eCommerce)
- `LANDING_PAGE` - דף נחיתה

**עורך תוכן עשיר:**

- TipTap editor עם תמיכה בעיצוב מתקדם
- הוספת תמונות, קישורים, צבעים
- יישור טקסט, רשימות
- Placeholders

### 4. מעקב מילות מפתח (Keyword Tracking)

**ניהול מילות מפתח:**

- חיפוש ונפח חיפושים
- רמת קושי (Difficulty)
- עלות לקליק (CPC)
- זיהוי Intent: INFORMATIONAL, NAVIGATIONAL, TRANSACTIONAL, COMMERCIAL
- מעקב אחר דירוג (Position)
- תגיות (Tags) לקיבוץ

**סטטוסים:**

- `TRACKING` - במעקב
- `TARGETING` - מיועד
- `RANKING` - מדורג
- `ARCHIVED` - מאורכב

### 5. ניהול Redirections (הפניות)

**סוגי Redirections:**

- `PERMANENT` (301) - קבוע
- `TEMPORARY` (302) - זמני
- `FOUND` (307) - נמצא

**מעקב שימוש:**

- מונה פגיעות (`hitCount`)
- זמן פגיעה אחרון (`lastHitAt`)
- הפעלה/השבתה

### 6. ביקורות אתר (Site Audit)

**ביקורות מקיפות:**

- בדיקות SEO טכני
- Core Web Vitals
- בעיות נגישות
- ביצועים
- תקינות קישורים

**דוחות:**

- ציון כולל (Score)
- רשימת בעיות עם רמות חומרה
- המלצות לתיקון
- URL הבעיה
- הצעות לשיפור

**סטטוסים:**

- `PENDING` - ממתין
- `RUNNING` - רץ
- `COMPLETED` - הושלם
- `FAILED` - נכשל

### 7. אזור ניהול (Admin Area)

**לסופר אדמין בלבד** (`isSuperAdmin`):

- **ניהול תוכניות (Plans)**: יצירה, עריכה, תרגום
- **ניהול Add-Ons**: הגדרת תוספים
- **ניהול מינויים**: צפייה בכל המנויים, סטטיסטיקות MRR/ARR
- **ניהול חשבונות**: צפייה בכל החשבונות
- **Interview Flow**: עריכת שאלות הראיון
- **Bot Actions**: הגדרת פעולות AI
- **Translations**: ניהול תרגומים

### 8. מערכת תרגום (i18n)

**תמיכה רב-לשונית:**

- שפות נתמכות: EN, HE, AR, ES, FR, DE, PT, IT, RU, ZH, JA, KO
- זיהוי RTL אוטומטי (HE, AR)
- תרגומים נפרדים ל:
  - `PLATFORM` - הדשבורד
  - `WEBSITE` - אתר השיווק
- מצבי תרגום: DRAFT, APPROVED
- גרסאות תרגום (`version`, `isLatest`)

**מבנה תרגומים:**

- Namespaces (auth, dashboard, admin, וכו')
- מערכת fallback
- תרגומים למודלים: Plans, AddOns, Features, Limitations

### 9. אוטומציות (Automations)

**תזמון פרסומים:**

- פרסום אוטומטי בתאריכים מוגדרים
- תזמון לפי timezone
- סטטוס `SCHEDULED`

**Workflow Automations:**

- Bot Actions אוטומטיים
- הפעלת פעולות לפי triggers
- שרשור פעולות (Action Chains)

### 10. דשבורד ודוחות

**דשבורד מרכזי:**

- סטטיסטיקות ביצועים
- מעקב AI Credits
- התראות ועדכונים
- גישה מהירה לפיצ'רים

**דפי דשבורד:**

- `/dashboard` - מרכז הבקרה
- `/dashboard/entities` - ניהול תוכן מהאתר
- `/dashboard/site-interview` - ראיון האתר
- `/dashboard/content-planner` - תכנון תוכן
- `/dashboard/automations` - אוטומציות
- `/dashboard/link-building` - בניית קישורים
- `/dashboard/redirections` - ניהול הפניות
- `/dashboard/seo-frontend` - SEO Frontend
- `/dashboard/seo-backend` - SEO טכני
- `/dashboard/site-audit` - ביקורת אתר
- `/dashboard/strategy/keywords` - מילות מפתח
- `/dashboard/settings` - הגדרות (כולל פרופיל משתמש ב-`?tab=profile`)

### 11. מערכת הזמנות (Invitations)

**הזמנת חברי צוות:**

- שליחת הזמנות למייל
- טוקן ייחודי (`inviteToken`)
- בחירת שפה להזמנה (`inviteLanguage`)
- מעקב מי הזמין (`invitedBy`, `invitedAt`)
- סטטוסים: PENDING, ACTIVE, SUSPENDED, REMOVED

**רישום זמני (TempRegistration):**

- שמירת נתונים במהלך תהליך הרישום
- שלבים: FORM, VERIFY, ACCOUNT_SETUP, INTERVIEW, PLAN, PAYMENT
- תמיכה ב-OAuth (Google)
- אימות OTP (SMS/EMAIL)
- תפוגה אוטומטית

## ארכיטקטורת API

### Public APIs (ללא אימות)

- `GET /api/public/plans` - רשימת תוכניות זמינות

### Auth APIs

- `POST /api/auth/login` - התחברות
- `POST /api/auth/register` - הרשמה
- `POST /api/auth/logout` - התנתקות
- `POST /api/auth/registration/*` - תהליך רישום מלא
- `POST /api/auth/verification/otp` - אימות OTP
- `GET /api/auth/google` - OAuth Google

### User APIs

- `GET /api/user/me` - מידע על המשתמש הנוכחי
- `PATCH /api/user/me` - עדכון פרופיל
- `GET /api/user-preferences` - העדפות משתמש

### Account APIs

- `GET /api/account` - מידע על חשבון
- `PATCH /api/account` - עדכון חשבון
- `DELETE /api/account/delete` - מחיקת חשבון
- `GET /api/account/resources` - משאבים וגבולות

### Sites APIs

- `GET /api/sites` - רשימת אתרים
- `POST /api/sites` - יצירת אתר
- `PATCH /api/sites/[id]` - עדכון אתר
- `DELETE /api/sites/[id]` - מחיקת אתר
- `POST /api/sites/[id]/verify-plugin` - אימות Plugin
- `POST /api/sites/[id]/auto-install` - התקנה אוטומטית
- `GET /api/sites/[id]/tools/settings` - הגדרות כלים

### Entities APIs (תוכן מהאתר)

- `GET /api/entities` - רשימת תוכן
- `POST /api/entities/sync` - סנכרון תוכן
- `GET /api/entities/[id]` - תוכן בודד
- `PATCH /api/entities/[id]` - עדכון תוכן

### Interview APIs

- `GET /api/interview` - מצב הראיון
- `POST /api/interview` - שליחת תשובה
- `POST /api/interview/chat` - שיחה עם AI
- `POST /api/interview/actions` - הפעלת bot action
- `DELETE /api/interview` - ביטול ראיון

### Settings APIs

- `GET /api/settings/*` - הגדרות שונות
- `PATCH /api/settings/*` - עדכון הגדרות

### Admin APIs (Super Admin בלבד)

- `/api/admin/plans` - ניהול תוכניות
- `/api/admin/addons` - ניהול תוספים
- `/api/admin/subscriptions` - ניהול מנויים
- `/api/admin/accounts` - ניהול חשבונות
- `/api/admin/interview-flow` - עריכת שאלות ראיון
- `/api/admin/bot-actions` - ניהול פעולות bot
- `/api/admin/interview-questions` - ניהול שאלות

### Plugin APIs (מיועד ל-WordPress Plugin)

- `POST /api/plugin/auth/verify` - אימות Plugin
- `POST /api/plugin/ping` - Heartbeat
- `POST /api/plugin/content/push` - העלאת תוכן
- `GET /api/plugin/site-info` - מידע על האתר

## מאפיינים ייחודיים

### 1. Centralized AI Configuration

כל שימוש ב-AI במערכת עובר דרך `lib/ai/gemini.js`:

- שינוי מודל במקום אחד משפיע על כל המערכת
- תמיכה ב-streaming, structured output, function calling
- שימוש ב-Vercel AI SDK - לעולם לא קריאות ישירות ל-API

### 2. AI Credits Economy

- מעקב מלא אחר שימוש בקרדיטים
- הוספה אוטומטית עם מינוי חדש
- רכישת חבילות נוספות כ-Add-Ons
- לוג מפורט לכל עסקה

### 3. WordPress Deep Integration

- Plugin מותאם אישית
- סנכרון דו-כיווני של תוכן
- תמיכה מלאה ב-ACF, CPT, Taxonomies
- תמיכה ב-Yoast/RankMath SEO
- כלים מתקדמים (WebP conversion)
- התקנה אוטומטית של Plugin

### 4. Multi-Tenancy Architecture

- הפרדה מלאה בין Accounts
- אותו משתמש יכול לעבוד על מספר חשבונות
- מעבר בין חשבונות ללא logout
- זכירת בחירות אחרונות (lastSelectedAccountId, lastSelectedSiteId)

### 5. Dynamic Plan System

- תוכניות לחלוטין דינמיות
- Features ו-Limitations מוגדרים כ-JSON
- תרגום מלא לכל שפה
- אין קוד קשיח - הכל מנוהל דרך Admin

### 6. Advanced Interview System

- AI Bot חכם שמדבר עם משתמשים
- יכול להפעיל פעולות (crawl, analyze)
- שומר context בין שאלות
- תנאים מורכבים (and, or)
- 12 סוגי שאלות שונים

### 7. Granular Permissions

- 50+ הרשאות מובנות
- תפקידים מותאמים אישית
- הרשאות ברמת מודול ויכולת
- בקרת גישה לכל דף ודף

## טכנולוגיות ספציפיות

### Frontend

- **Next.js 15 App Router** - Server Components, Server Actions
- **CSS Modules** - Nested syntax, scoped styles
- **Framer Motion** - אנימציות
- **Lucide React** - אייקונים
- **TipTap** - עורך טקסט עשיר

### Backend

- **Next.js API Routes** - RESTful API
- **Prisma ORM** - גישה לבסיס הנתונים
- **MongoDB** - בסיס נתונים NoSQL
- **bcryptjs** - הצפנת סיסמאות
- **nodemailer** - שליחת מיילים

### AI & Data Processing

- **Vercel AI SDK** - אינטגרציה עם AI
- **Google Gemini** - מודל AI
- **Zod** - Validation וסכמות

### Security

- **HMAC-SHA256** - אימות Plugin
- **JWT/Session** - אימות משתמשים
- **bcryptjs** - הצפנת סיסמאות
- **OTP** - אימות דו-שלבי

## תהליכים עיקריים

### תהליך הרשמה מלא

1. **טופס הרשמה** - מילוי פרטים
2. **אימות OTP** - SMS/Email
3. **Account Setup** - יצירת חברה
4. **Interview** - ראיון אונבורדינג עם AI
5. **Plan Selection** - בחירת תוכנית
6. **Payment** - תשלום (אם נדרש)
7. **Completion** - כניסה למערכת

### תהליך חיבור אתר WordPress

1. **יצירת Site** במערכת
2. **קבלת siteKey + siteSecret**
3. **התקנת Plugin** (אוטומטית או ידנית)
4. **אימות חיבור** - Plugin מתקשר עם הפלטפורמה
5. **סנכרון ראשוני** - איסוף כל התוכן
6. **ניהול רציף** - סנכרון דו-כיווני

### תהליך יצירת תוכן עם AI

1. **בחירת מילת מפתח** או נושא
2. **ניתוח התוכן הקיים** באתר (סגנון, טון)
3. **יצירת תוכן** עם Gemini
4. **אופטימיזציה ל-SEO** (מטא-תגים, כותרות)
5. **עריכה ידנית** (אופציונלי)
6. **פרסום** או **תזמון**
7. **ניכוי AI Credits** מהמאזן

## יכולות עתידיות (על בסיס המבנה הקיים)

### 1. Link Building Automation

- זיהוי אוטומטי של הזדמנויות לקישורים
- ניהול קמפיינים
- מעקב אחר backlinks

### 2. Technical SEO Dashboard

- מעקב Core Web Vitals בזמן אמת
- התראות על בעיות טכניות
- המלצות לשיפור

### 3. Content Planner מתקדם

- קלנדר חכם לתוכן
- המלצות נושאים
- אנליזה של gaps בתוכן

### 4. SEO Frontend/Backend

- ניתוח מעמיק של SEO on-page
- בדיקות טכניות מתקדמות
- Schema markup

### 5. Competitor Analysis

- מעקב אחר מתחרים
- השוואת ביצועים
- זיהוי הזדמנויות

### 6. Multi-Language Content

- תרגום אוטומטי של תוכן
- אופטימיזציה לשפות שונות
- hreflang management

### 7. A/B Testing

- בדיקת גרסאות שונות
- אנליזת ביצועים
- המלצות אוטומטיות

### 8. Advanced Analytics

- דוחות מפורטים
- תובנות מונעות AI
- חיזוי טרנדים

## נקודות חוזק

1. **AI-First Approach** - AI בליבת המערכת, לא תוספת
2. **Scalability** - ארכיטקטורה שיכולה לצמוח
3. **Flexibility** - מערכת דינמית ללא קוד קשיח
4. **Security** - אימות מתקדם והצפנה
5. **Multi-Tenancy** - תמיכה בארגונים מרובים
6. **Modularity** - קוד מודולרי וניתן לתחזוקה
7. **Developer Experience** - Prisma, TypeScript, Next.js
8. **User Experience** - ממשק נקי ואינטואיטיבי

## סיכום

**Ghost Post Platform** היא מערכת מקיפה לניהול SEO ותוכן מונעת AI. המערכת משלבת טכנולוגיות מתקדמות עם חוויית משתמש מצוינת, ומספקת פתרון שלם לעסקים הרוצים לנהל את הנוכחות הדיגיטלית שלהם בצורה חכמה ויעילה.

המערכת בנויה על תשתית מודולרית וגמישה שמאפשרת הרחבה קלה, תוך שמירה על ביצועים ואבטחה ברמה גבוהה. השימוש המרוכז ב-AI, המודל העסקי המתוחכם, והאינטגרציה העמוקה עם WordPress הופכים אותה לפלטפורמה ייחודית ועוצמתית.
