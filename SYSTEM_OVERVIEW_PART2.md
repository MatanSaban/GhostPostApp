# Ghost Post Platform - חלק 2: פרטים טכניים מתקדמים

> **📚 מסמך זה הוא חלק 2 מתוך 2**
>
> - **[חלק 1](SYSTEM_OVERVIEW.md)**: ארכיטקטורה, מודל נתונים, הרשאות, מינויים
> - **חלק 2** (מסמך זה): Add-Ons, AI Credits, Interview System, WordPress Integration, API Documentation, תהליכי עבודה מפורטים

---

## המשך: מודל מינויים - Add-Ons

### Add-Ons (תוספים) - מערכת מתקדמת

```prisma
model AddOn {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  name            String        @unique
  slug            String        @unique
  description     String?
  type            AddOnType                      // סוג התוסף

  // Pricing
  price           Float                          // מחיר ליחידה
  currency        String        @default("USD")
  billingType     AddOnBillingType @default(RECURRING)

  // Quantity (for packs)
  quantity        Int?                           // כמות (לדוגמה: 10000 קרדיטים)

  isActive        Boolean       @default(true)
  sortOrder       Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  purchases       AddOnPurchase[]
  translations    AddOnTranslation[]
}

enum AddOnType {
  SEATS           // חברי צוות נוספים
  SITES           // אתרים נוספים
  AI_CREDITS      // חבילת קרדיטים
  STORAGE         // אחסון נוסף
  KEYWORDS        // מעקב מילות מפתח נוספות
  CONTENT         // פריטי תוכן נוספים
}

enum AddOnBillingType {
  RECURRING       // חיוב חוזר בכל תקופת חיוב
  ONE_TIME        // רכישה חד-פעמית (כמו חבילת קרדיטים)
}

model AddOnPurchase {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId  String        @db.ObjectId
  addOnId         String        @db.ObjectId
  quantity        Int           @default(1)          // כמה יחידות נרכשו
  status          AddOnPurchaseStatus @default(ACTIVE)

  // For one-time purchases (AI Credits)
  creditsRemaining Int?                             // יתרת קרדיטים

  purchasedAt     DateTime      @default(now())
  expiresAt       DateTime?                         // Recurring: matches subscription period
  canceledAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  subscription    Subscription  @relation(...)
  addOn           AddOn         @relation(...)

  @@index([subscriptionId])
  @@index([addOnId])
}

enum AddOnPurchaseStatus {
  ACTIVE          // פעיל
  EXPIRED         // פג תוקף
  CANCELED        // בוטל
  DEPLETED        // נוצל במלואו (לחד-פעמיים)
}
```

**דוגמאות Add-Ons**:

```json
[
  {
    "name": "Additional Team Member",
    "slug": "additional-seat",
    "type": "SEATS",
    "price": 10,
    "billingType": "RECURRING",
    "quantity": 1,
    "description": "Add one more team member to your account"
  },
  {
    "name": "Extra Website",
    "slug": "additional-site",
    "type": "SITES",
    "price": 15,
    "billingType": "RECURRING",
    "quantity": 1,
    "description": "Manage one additional website"
  },
  {
    "name": "AI Credits Pack - 10K",
    "slug": "ai-credits-10k",
    "type": "AI_CREDITS",
    "price": 20,
    "billingType": "ONE_TIME",
    "quantity": 10000,
    "description": "One-time purchase of 10,000 AI credits"
  }
]
```

### AI Credits Economy - מערכת מפורטת

#### מודל AiCreditsLog

```prisma
model AiCreditsLog {
  id          String          @id @default(auto()) @map("_id") @db.ObjectId
  accountId   String          @db.ObjectId
  userId      String?         @db.ObjectId       // מי ביצע את הפעולה
  siteId      String?         @db.ObjectId       // הקשר לאתר

  type        AiCreditsLogType                   // CREDIT or DEBIT
  amount      Int                                // כמות קרדיטים
  balance     Int                                // יתרה אחרי פעולה זו

  // Source tracking
  source      String                             // "plan_renewal", "addon_purchase", "content_generation"
  sourceId    String?                            // ID של הישות הקשורה
  description String?                            // תיאור אנושי

  metadata    Json?                              // מידע נוסף
  createdAt   DateTime        @default(now())

  account     Account         @relation(...)

  @@index([accountId])
  @@index([createdAt])
}

enum AiCreditsLogType {
  CREDIT      // הוספת קרדיטים
  DEBIT       // שימוש בקרדיטים
}
```

#### תהליך שימוש בקרדיטים

```javascript
// lib/account-utils.js

/**
 * Deduct AI credits from account balance
 * Returns true if successful, false if insufficient credits
 */
export async function deductAiCredits({
  accountId,
  amount,
  source,
  sourceId = null,
  userId = null,
  siteId = null,
  description = null,
}) {
  return await prisma.$transaction(async (tx) => {
    // Get current balance
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { aiCreditsBalance: true },
    });

    if (account.aiCreditsBalance < amount) {
      throw new Error("Insufficient AI credits");
    }

    // Deduct from balance
    const newBalance = account.aiCreditsBalance - amount;
    await tx.account.update({
      where: { id: accountId },
      data: {
        aiCreditsBalance: newBalance,
        aiCreditsUsedTotal: { increment: amount },
      },
    });

    // Log the transaction
    await tx.aiCreditsLog.create({
      data: {
        accountId,
        userId,
        siteId,
        type: "DEBIT",
        amount,
        balance: newBalance,
        source,
        sourceId,
        description,
      },
    });

    return true;
  });
}

/**
 * Add AI credits to account balance
 */
export async function addAiCredits({
  accountId,
  amount,
  source,
  sourceId = null,
  description = null,
}) {
  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { aiCreditsBalance: true },
    });

    const newBalance = account.aiCreditsBalance + amount;

    await tx.account.update({
      where: { id: accountId },
      data: { aiCreditsBalance: newBalance },
    });

    await tx.aiCreditsLog.create({
      data: {
        accountId,
        type: "CREDIT",
        amount,
        balance: newBalance,
        source,
        sourceId,
        description,
      },
    });

    return newBalance;
  });
}
```

#### דוגמאות שימוש

```javascript
// When generating content with AI
await deductAiCredits({
  accountId: account.id,
  amount: 100,
  source: "content_generation",
  sourceId: content.id,
  userId: user.id,
  siteId: site.id,
  description: `Generated blog post: "${content.title}"`,
});

// When plan renews (monthly AI credits)
const planCredits = getLimitFromPlan(plan.limitations, "aiCredits", 0);
if (planCredits > 0) {
  await addAiCredits({
    accountId: account.id,
    amount: planCredits,
    source: "plan_renewal",
    sourceId: subscription.id,
    description: `Monthly AI credits from ${plan.name} plan`,
  });
}

// When purchasing AI credits add-on
await addAiCredits({
  accountId: account.id,
  amount: addOn.quantity, // 10000
  source: "addon_purchase",
  sourceId: addOnPurchase.id,
  description: `Purchased ${addOn.name}`,
});
```

## פיצ'רים מרכזיים - תיעוד מלא

### 1. מערכת Interview AI - תיעוד מעמיק

#### ארכיטקטורה כללית

מערכת הראיון כוללת 4 רכיבים מרכזיים:

1. **InterviewQuestion** - תבנית שאלה (Admin מגדיר)
2. **UserInterview** - Session של משתמש
3. **InterviewMessage** - הודעות בשיחה
4. **BotAction** - פעולות שה-AI יכול לבצע

#### InterviewQuestion - 12 סוגי שאלות

```prisma
model InterviewQuestion {
  id              String                @id @default(auto()) @map("_id") @db.ObjectId
  order           Int                   @default(0)
  translationKey  String                @unique
  questionType    InterviewQuestionType @default(INPUT)

  // Configuration (JSON)
  inputConfig     Json?
  validation      Json?

  // AI Configuration
  aiPromptHint    String?
  allowedActions  String[]              @default([])
  autoActions     Json?
  saveToField     String?

  // Conditional Display
  dependsOn       String?               @db.ObjectId
  showCondition   Json?

  isActive        Boolean               @default(true)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([order])
}

enum InterviewQuestionType {
  GREETING          // Welcome message, no input
  INPUT             // Single input field
  INPUT_WITH_AI     // Input that triggers AI analysis
  CONFIRMATION      // Yes/No with preview
  SELECTION         // Single choice
  MULTI_SELECTION   // Multiple choices
  DYNAMIC           // Options from API
  EDITABLE_DATA     // Show & edit data
  FILE_UPLOAD       // File upload
  SLIDER            // Number range
  AI_SUGGESTION     // AI generates suggestion
  AUTO_ACTION       // Automatic action, no input
}
```

#### דוגמאות תצורה לכל סוג שאלה

**1. GREETING**:

```json
{
  "questionType": "GREETING",
  "translationKey": "interview.welcome",
  "inputConfig": {
    "buttonText": "Let's Start"
  }
}
```

**2. INPUT**:

```json
{
  "questionType": "INPUT",
  "translationKey": "interview.websiteUrl",
  "inputConfig": {
    "inputType": "url",
    "placeholder": "https://example.com",
    "fieldName": "websiteUrl"
  },
  "validation": {
    "required": true,
    "pattern": "^https?://",
    "errorKey": "interview.errors.invalidUrl"
  },
  "saveToField": "websiteUrl"
}
```

**3. INPUT_WITH_AI**:

```json
{
  "questionType": "INPUT_WITH_AI",
  "translationKey": "interview.competitors",
  "inputConfig": {
    "inputType": "textarea",
    "placeholder": "Enter competitor URLs, one per line",
    "fieldName": "competitors"
  },
  "autoActions": [
    {
      "action": "analyzeCompetitors",
      "triggerOn": "submit",
      "parameters": {
        "competitors": "{{competitors}}"
      }
    }
  ]
}
```

**4. CONFIRMATION**:

```json
{
  "questionType": "CONFIRMATION",
  "translationKey": "interview.confirmBusinessInfo",
  "inputConfig": {
    "confirmText": "Yes, looks good",
    "cancelText": "Let me edit",
    "dataPreview": ["name", "industry", "website"]
  }
}
```

**5. SELECTION**:

```json
{
  "questionType": "SELECTION",
  "translationKey": "interview.platform",
  "inputConfig": {
    "selectionMode": "cards",
    "fieldName": "platform",
    "options": [
      { "value": "wordpress", "label": "WordPress", "icon": "wordpress" },
      { "value": "shopify", "label": "Shopify", "icon": "shopify" },
      { "value": "wix", "label": "Wix", "icon": "wix" },
      { "value": "custom", "label": "Custom", "icon": "code" }
    ]
  },
  "saveToField": "platform"
}
```

**6. MULTI_SELECTION**:

```json
{
  "questionType": "MULTI_SELECTION",
  "translationKey": "interview.goals",
  "inputConfig": {
    "selectionMode": "checkboxes",
    "fieldName": "seoGoals",
    "options": [
      { "value": "traffic", "label": "Increase Traffic" },
      { "value": "rankings", "label": "Improve Rankings" },
      { "value": "conversions", "label": "Boost Conversions" },
      { "value": "local", "label": "Local SEO" }
    ]
  },
  "validation": {
    "minSelected": 1,
    "maxSelected": 3
  }
}
```

**7. DYNAMIC**:

```json
{
  "questionType": "DYNAMIC",
  "translationKey": "interview.selectKeywords",
  "inputConfig": {
    "selectionMode": "tags",
    "fieldName": "selectedKeywords",
    "optionsSource": "crawledKeywords",
    "maxSelections": 10
  },
  "dependsOn": "previousQuestionId",
  "showCondition": {
    "field": "websiteUrl",
    "operator": "exists"
  }
}
```

**8. EDITABLE_DATA**:

```json
{
  "questionType": "EDITABLE_DATA",
  "translationKey": "interview.reviewBusinessInfo",
  "inputConfig": {
    "dataSource": "crawledData.businessInfo",
    "editableFields": [
      { "key": "businessName", "type": "text" },
      { "key": "industry", "type": "select" },
      { "key": "description", "type": "textarea" }
    ]
  }
}
```

**9. FILE_UPLOAD**:

```json
{
  "questionType": "FILE_UPLOAD",
  "translationKey": "interview.uploadLogo",
  "inputConfig": {
    "fieldName": "logo",
    "accept": "image/*",
    "maxSize": 5242880,
    "multiple": false
  },
  "validation": {
    "required": false
  }
}
```

**10. SLIDER**:

```json
{
  "questionType": "SLIDER",
  "translationKey": "interview.budget",
  "inputConfig": {
    "fieldName": "monthlyBudget",
    "min": 0,
    "max": 10000,
    "step": 100,
    "unit": "$"
  }
}
```

**11. AI_SUGGESTION**:

```json
{
  "questionType": "AI_SUGGESTION",
  "translationKey": "interview.suggestTitle",
  "inputConfig": {
    "fieldName": "suggestedTitle",
    "acceptText": "Use this",
    "editText": "Customize"
  },
  "aiPromptHint": "Based on the website content, suggest a compelling site title that reflects the brand and industry."
}
```

**12. AUTO_ACTION**:

```json
{
  "questionType": "AUTO_ACTION",
  "translationKey": "interview.analyzingSite",
  "autoActions": [
    {
      "action": "crawlWebsite",
      "parameters": { "url": "{{websiteUrl}}" }
    },
    {
      "action": "detectPlatform",
      "parameters": { "url": "{{websiteUrl}}" }
    }
  ],
  "inputConfig": {
    "loadingMessage": "Analyzing your website...",
    "successMessage": "Analysis complete!"
  }
}
```

#### Flow Engine - מנוע תנאים

```javascript
// lib/interview/flow-engine.js

/**
 * Evaluate complex conditions
 */
export function evaluateCondition(condition, responses) {
  const { field, operator, value, conditions } = condition;

  const fieldValue = responses[field];

  switch (operator) {
    case "equals":
      return fieldValue === value;

    case "notEquals":
      return fieldValue !== value;

    case "contains":
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      return String(fieldValue).includes(value);

    case "notContains":
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value);
      }
      return !String(fieldValue).includes(value);

    case "exists":
      return (
        fieldValue !== null && fieldValue !== undefined && fieldValue !== ""
      );

    case "isEmpty":
      return !fieldValue || fieldValue.length === 0;

    case "greaterThan":
      return Number(fieldValue) > Number(value);

    case "lessThan":
      return Number(fieldValue) < Number(value);

    case "in":
      return Array.isArray(value) && value.includes(fieldValue);

    case "and":
      return (
        Array.isArray(conditions) &&
        conditions.every((c) => evaluateCondition(c, responses))
      );

    case "or":
      return (
        Array.isArray(conditions) &&
        conditions.some((c) => evaluateCondition(c, responses))
      );

    default:
      return true;
  }
}
```

**דוגמאות תנאים**:

```json
{
  "operator": "equals",
  "field": "platform",
  "value": "wordpress"
}

{
  "operator": "and",
  "conditions": [
    {"operator": "equals", "field": "platform", "value": "wordpress"},
    {"operator": "exists", "field": "websiteUrl"}
  ]
}

{
  "operator": "or",
  "conditions": [
    {"operator": "in", "field": "platform", "value": ["wordpress", "wix"]},
    {"operator": "greaterThan", "field": "budget", "value": 5000}
  ]
}
```

#### Bot Actions - מערכת פעולות AI

```prisma
model BotAction {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  name          String   @unique
  description   String
  handler       String              // Function name in lib/bot-actions/handlers/

  // JSON Schema for parameters
  parameters    Json

  // JSON Schema for return value
  returns       Json

  // Example for AI
  example       Json?

  requiresAuth  Boolean  @default(true)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**דוגמת Bot Action - crawlWebsite**:

```json
{
  "name": "CRAWL_WEBSITE",
  "description": "Crawl a website and extract business information, meta tags, and content structure",
  "handler": "crawlWebsite",
  "parameters": {
    "type": "object",
    "required": ["url"],
    "properties": {
      "url": {
        "type": "string",
        "description": "The website URL to crawl"
      },
      "depth": {
        "type": "number",
        "description": "How many levels deep to crawl",
        "default": 1
      }
    }
  },
  "returns": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "data": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "description": { "type": "string" },
          "keywords": { "type": "array" },
          "platform": { "type": "string" },
          "pages": { "type": "number" }
        }
      }
    }
  },
  "example": {
    "input": { "url": "https://example.com" },
    "output": {
      "success": true,
      "data": {
        "title": "Example Company - Leading Solutions",
        "description": "We provide...",
        "keywords": ["solutions", "services"],
        "platform": "wordpress",
        "pages": 42
      }
    }
  }
}
```

**Handler Implementation** (`lib/bot-actions/handlers/crawl-website.js`):

```javascript
import axios from "axios";
import * as cheerio from "cheerio";

export async function crawlWebsite({ url, depth = 1 }, context) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "GhostPost-Bot/1.0" },
    });

    const $ = cheerio.load(response.data);

    // Extract data
    const title =
      $("title").text() || $('meta[property="og:title"]').attr("content");
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content");
    const keywords =
      $('meta[name="keywords"]').attr("content")?.split(",") || [];

    // Detect platform
    let platform = "unknown";
    if ($('meta[name="generator"]').attr("content")?.includes("WordPress")) {
      platform = "wordpress";
    } else if (response.headers["x-shopify-stage"]) {
      platform = "shopify";
    }

    // Count pages (simplified)
    const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;

    return {
      success: true,
      data: {
        title: title?.trim(),
        description: description?.trim(),
        keywords: keywords.map((k) => k.trim()).filter(Boolean),
        platform,
        pages: internalLinks,
        crawledAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

### 2. WordPress Integration - תיעוד מלא

#### WordPress Plugin Architecture

ה-Plugin ממוקם ב-WordPress ומתקשר עם הפלטפורמה:

**Plugin Structure**:

```
ghost-post-wordpress/
├── ghost-post.php              # Main plugin file
├── includes/
│   ├── class-gp-api.php       # API communication
│   ├── class-gp-auth.php      # Authentication
│   ├── class-gp-sync.php      # Content sync
│   ├── class-gp-seo.php       # SEO integration
│   └── class-gp-tools.php     # Tools (WebP, etc.)
├── admin/
│   ├── settings-page.php      # Settings UI
│   └── dashboard-widget.php   # WP Dashboard widget
└── assets/
    ├── css/
    └── js/
```

#### Communication Protocol

**1. Initial Connection**:

```
User in Platform → Creates Site → Gets siteKey
User in WordPress → Installs Plugin → Enters siteKey
Plugin → POST /api/plugin/auth/verify {siteKey}
Platform → Returns {siteSecret, siteInfo}
Plugin → Stores siteSecret securely (encrypted in wp_options)
```

**2. Authenticated Requests**:

```php
// WordPress Plugin Code
class GP_API {
    private $site_key;
    private $site_secret;
    private $platform_url = 'https://app.ghostpost.com';

    public function make_request($endpoint, $method = 'GET', $data = null) {
        $url = $this->platform_url . $endpoint;

        // Create HMAC signature
        $payload = $data ? json_encode($data) : '';
        $signature = hash_hmac('sha256', $payload, $this->site_secret);

        $args = [
            'method' => $method,
            'headers' => [
                'X-Site-Key' => $this->site_key,
                'X-Signature' => $signature,
                'Content-Type' => 'application/json',
            ],
            'body' => $payload,
            'timeout' => 30,
        ];

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            return ['error' => $response->get_error_message()];
        }

        return json_decode(wp_remote_retrieve_body($response), true);
    }

    // Heartbeat - every 5 minutes
    public function send_ping() {
        return $this->make_request('/api/plugin/ping', 'POST', [
            'version' => GP_VERSION,
            'wp_version' => get_bloginfo('version'),
            'php_version' => PHP_VERSION,
            'active_plugins' => get_option('active_plugins'),
        ]);
    }
}
```

**3. Platform Verification** (`lib/site-keys.js`):

```javascript
import crypto from "crypto";
import prisma from "./prisma";

export async function verifySiteRequest(request) {
  const siteKey = request.headers.get("x-site-key");
  const signature = request.headers.get("x-signature");

  if (!siteKey || !signature) {
    throw new Error("Missing authentication headers");
  }

  // Find site
  const site = await prisma.site.findUnique({
    where: { siteKey },
    include: { account: true },
  });

  if (!site || !site.siteSecret) {
    throw new Error("Invalid site key");
  }

  // Verify HMAC
  const body = await request.text();
  const hmac = crypto.createHmac("sha256", site.siteSecret);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  return { site, body: body ? JSON.parse(body) : null };
}
```

#### Entity Sync - תהליך סנכרון מלא

**Entity Types** (סוגי תוכן):

```prisma
model SiteEntityType {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  siteId      String   @db.ObjectId
  name        String                     // "Blog Posts", "Products"
  slug        String                     // "posts", "products"
  apiEndpoint String?                    // "posts", "shop-products"
  sitemaps    String[]                   // ["https://site.com/post-sitemap.xml"]
  isEnabled   Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  site     Site         @relation(...)
  entities SiteEntity[]

  @@unique([siteId, slug])
}
```

**Entity (פריט תוכן בודד)**:

```prisma
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

  // Structured data
  metadata      Json?                    // General: author, date, categories, tags
  seoData       Json?                    // Yoast/RankMath: focusKeyword, score, readability
  acfData       Json?                    // ACF fields: {field_name: value}

  externalId    String?                  // WordPress post ID
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  publishedAt   DateTime?
  scheduledAt   DateTime?

  site       Site           @relation(...)
  entityType SiteEntityType @relation(...)

  @@unique([siteId, entityTypeId, slug])
  @@index([siteId, externalId])
}

enum EntityStatus {
  PUBLISHED, DRAFT, PENDING, SCHEDULED, PRIVATE, ARCHIVED, TRASH
}
```

**Sync API Endpoint** (`/api/entities/sync`):

```javascript
import { verifySiteRequest } from "@/lib/site-keys";
import prisma from "@/lib/prisma";

export async function POST(request) {
  try {
    const { site, body } = await verifySiteRequest(request);
    const { entityTypeSlug, entities } = body;

    // Find entity type
    const entityType = await prisma.siteEntityType.findUnique({
      where: {
        siteId_slug: {
          siteId: site.id,
          slug: entityTypeSlug,
        },
      },
    });

    if (!entityType) {
      return NextResponse.json(
        { error: "Entity type not found" },
        { status: 404 },
      );
    }

    // Update sync status
    await prisma.site.update({
      where: { id: site.id },
      data: {
        entitySyncStatus: "SYNCING",
        entitySyncProgress: 0,
        entitySyncMessage: `Syncing ${entities.length} ${entityTypeSlug}...`,
      },
    });

    // Process entities in batches
    const batchSize = 50;
    let processed = 0;

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (entity) => {
          await prisma.siteEntity.upsert({
            where: {
              siteId_entityTypeId_slug: {
                siteId: site.id,
                entityTypeId: entityType.id,
                slug: entity.slug,
              },
            },
            update: {
              title: entity.title,
              content: entity.content,
              excerpt: entity.excerpt,
              status: entity.status,
              featuredImage: entity.featured_image,
              metadata: entity.metadata,
              seoData: entity.seo_data,
              acfData: entity.acf_data,
              externalId: entity.id?.toString(),
              updatedAt: new Date(),
              publishedAt: entity.published_at
                ? new Date(entity.published_at)
                : null,
            },
            create: {
              siteId: site.id,
              entityTypeId: entityType.id,
              title: entity.title,
              slug: entity.slug,
              url: entity.url,
              content: entity.content,
              excerpt: entity.excerpt,
              status: entity.status,
              featuredImage: entity.featured_image,
              metadata: entity.metadata,
              seoData: entity.seo_data,
              acfData: entity.acf_data,
              externalId: entity.id?.toString(),
              publishedAt: entity.published_at
                ? new Date(entity.published_at)
                : null,
            },
          });
        }),
      );

      processed += batch.length;
      const progress = Math.round((processed / entities.length) * 100);

      // Update progress
      await prisma.site.update({
        where: { id: site.id },
        data: {
          entitySyncProgress: progress,
          entitySyncMessage: `Synced ${processed}/${entities.length} ${entityTypeSlug}`,
        },
      });
    }

    // Mark as completed
    await prisma.site.update({
      where: { id: site.id },
      data: {
        entitySyncStatus: "COMPLETED",
        entitySyncProgress: 100,
        entitySyncMessage: `Successfully synced ${entities.length} ${entityTypeSlug}`,
        lastEntitySyncAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      synced: entities.length,
    });
  } catch (error) {
    console.error("Sync error:", error);

    // Mark as error
    if (site) {
      await prisma.site.update({
        where: { id: site.id },
        data: {
          entitySyncStatus: "ERROR",
          entitySyncError: error.message,
        },
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### 3. מערכת התרגום (i18n) - תיעוד מלא

#### ארכיטקטורה

```prisma
model I18nLanguage {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  locale    String   @unique         // "en", "he", "fr"
  name      String                   // "English", "עברית", "Français"
  isRTL     Boolean  @default(false) // true for he, ar
  fallback  String[] @default([])    // Fallback chain: ["he", "en"]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  translations I18nTranslation[]
}

model I18nKey {
  id          String          @id @default(auto()) @map("_id") @db.ObjectId
  key         String          @unique            // "auth.login.title"
  namespace   String                             // "auth", "dashboard", "admin"
  application I18nApplication @default(PLATFORM) // PLATFORM or WEBSITE
  description String?                            // For translators
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  translations I18nTranslation[]

  @@index([namespace])
  @@index([application])
}

enum I18nApplication {
  PLATFORM  // Dashboard (app.ghostpost.com)
  WEBSITE   // Marketing website (ghostpost.com)
}

model I18nTranslation {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  keyId       String            @db.ObjectId
  languageId  String            @db.ObjectId

  // Denormalized for performance
  key         String            // "auth.login.title"
  namespace   String            // "auth"
  application I18nApplication   @default(PLATFORM)
  locale      String            // "en"

  value       String            // The actual translation
  status      TranslationStatus @default(APPROVED)
  version     Int               @default(1)
  isLatest    Boolean           @default(true)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  keyRel      I18nKey           @relation(...)
  language    I18nLanguage      @relation(...)

  @@index([locale, namespace, status])
  @@index([application, locale, isLatest])
}

enum TranslationStatus {
  DRAFT     // Being translated
  APPROVED  // Ready for use
}
```

#### Dictionary Files (`i18n/dictionaries/`)

```json
// en.json (partial example)
{
  "auth": {
    "login": {
      "title": "Welcome Back",
      "subtitle": "Sign in to your account",
      "email": "Email Address",
      "password": "Password",
      "remember": "Remember me",
      "submit": "Sign In",
      "forgot": "Forgot password?",
      "noAccount": "Don't have an account?",
      "register": "Sign up"
    },
    "register": {
      "title": "Create Account",
      "subtitle": "Start your SEO journey",
      "firstName": "First Name",
      "lastName": "Last Name",
      "email": "Email Address",
      "password": "Password",
      "confirmPassword": "Confirm Password",
      "consent": "I agree to the Terms of Service and Privacy Policy",
      "submit": "Create Account"
    }
  },
  "dashboard": {
    "nav": {
      "home": "Dashboard",
      "entities": "Content",
      "siteInterview": "Site Profile",
      "contentPlanner": "Content Planner",
      "automations": "Automations",
      "linkBuilding": "Link Building",
      "redirections": "Redirections",
      "seoFrontend": "On-Page SEO",
      "seoBackend": "Technical SEO",
      "siteAudit": "Site Audit",
      "keywords": "Keywords",
      "settings": "Settings",
      "profile": "Profile"
    },
    "home": {
      "welcome": "Welcome back, {name}",
      "aiCredits": "AI Credits",
      "creditsRemaining": "{count} credits remaining",
      "quickActions": "Quick Actions",
      "recentActivity": "Recent Activity"
    }
  },
  "interviewWizard": {
    "progress": "Step {current} of {total}",
    "back": "Back",
    "next": "Next",
    "finish": "Finish",
    "skip": "Skip",
    "chatMode": "Chat with AI",
    "typing": "AI is typing...",
    "errors": {
      "required": "This field is required",
      "invalidUrl": "Please enter a valid URL",
      "invalidEmail": "Please enter a valid email"
    }
  },
  "admin": {
    "plans": {
      "title": "Subscription Plans",
      "create": "Create Plan",
      "edit": "Edit Plan",
      "delete": "Delete Plan",
      "form": {
        "name": "Plan Name",
        "slug": "Slug",
        "description": "Description",
        "monthlyPrice": "Monthly Price",
        "yearlyPrice": "Yearly Price",
        "features": "Features",
        "limitations": "Limitations",
        "maxSites": "Max Sites",
        "maxMembers": "Max Team Members",
        "aiCredits": "AI Credits per Month"
      }
    }
  }
}
```

#### Server-Side Usage (`i18n/get-dictionary.js`):

```javascript
import "server-only";
import { Language } from "@prisma/client";

// Cache dictionaries in memory
const dictionaries = {
  en: () => import("./dictionaries/en.json").then((module) => module.default),
  he: () => import("./dictionaries/he.json").then((module) => module.default),
  fr: () => import("./dictionaries/fr.json").then((module) => module.default),
};

export const getDictionary = async (locale = "en") => {
  if (!dictionaries[locale]) {
    console.warn(`Dictionary for ${locale} not found, falling back to en`);
    locale = "en";
  }

  return dictionaries[locale]();
};

// In Server Component
import { getDictionary } from "@/i18n/get-dictionary";

export default async function LoginPage({ params }) {
  const lang = params.lang || "en";
  const t = await getDictionary(lang);

  return (
    <div>
      <h1>{t.auth.login.title}</h1>
      <p>{t.auth.login.subtitle}</p>
    </div>
  );
}
```

#### Client-Side Usage (Context):

```javascript
// app/context/locale-context.jsx
"use client";

import { createContext, useContext, useState, useEffect } from "react";

const LocaleContext = createContext();

export function LocaleProvider({ children, initialLocale, initialDict }) {
  const [locale, setLocale] = useState(initialLocale);
  const [dict, setDict] = useState(initialDict);

  const changeLocale = async (newLocale) => {
    const response = await fetch(`/api/translations?lang=${newLocale}`);
    const newDict = await response.json();
    setDict(newDict);
    setLocale(newLocale);

    // Update cookie/localStorage
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
  };

  return (
    <LocaleContext.Provider value={{ locale, dict, t: dict, changeLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);

// In Client Component
("use client");

import { useLocale } from "@/app/context/locale-context";

export default function MyComponent() {
  const { t, changeLocale } = useLocale();

  return (
    <div>
      <h2>{t.dashboard.home.welcome.replace("{name}", "John")}</h2>
      <button onClick={() => changeLocale("he")}>Switch to Hebrew</button>
    </div>
  );
}
```

## API Routes - תיעוד מפורט

### Authentication Flow

#### POST /api/auth/register

**Request**:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phoneNumber": "+1234567890",
  "consentGiven": true
}
```

**Response**:

```json
{
  "success": true,
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "message": "Verification code sent to your email"
}
```

**Flow**:

1. Validate input
2. Check if email exists
3. Hash password with bcryptjs
4. Create TempRegistration
5. Generate OTP code
6. Send verification email
7. Return tempRegId for next step

#### POST /api/auth/verification/otp

**Request**:

```json
{
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "code": "123456"
}
```

**Response**:

```json
{
  "success": true,
  "verified": true
}
```

#### POST /api/auth/registration/finalize

**Request**:

```json
{
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "accountName": "My Company",
  "accountSlug": "my-company",
  "selectedPlanId": "65b2c3d4e5f6g7h8i9j0k1l2"
}
```

**Response**:

```json
{
  "success": true,
  "user": {
    "id": "65c3d4e5f6g7h8i9j0k1l2m3",
    "email": "john@example.com",
    "firstName": "John"
  },
  "account": {
    "id": "65d4e5f6g7h8i9j0k1l2m3n4",
    "name": "My Company",
    "slug": "my-company"
  },
  "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Process**:

```javascript
// In $transaction:
1. Create User
2. Create Account
3. Create default Owner Role
4. Create AccountMember (isOwner: true)
5. Create Subscription (if planId provided)
6. Add AI Credits from plan
7. Create Session
8. Delete TempRegistration
9. Return user + account + session
```

### Site Management APIs

#### POST /api/sites

**Request**:

```json
{
  "name": "My Blog",
  "url": "https://myblog.com",
  "platform": "wordpress"
}
```

**Response**:

```json
{
  "success": true,
  "site": {
    "id": "65e5f6g7h8i9j0k1l2m3n4o5",
    "name": "My Blog",
    "url": "https://myblog.com",
    "siteKey": "gp_site_a1b2c3d4e5f6g7h8",
    "connectionStatus": "PENDING"
  }
}
```

#### POST /api/sites/[id]/verify-plugin

**Request**:

```json
{
  "pluginVersion": "1.2.0",
  "wpVersion": "6.4.2",
  "phpVersion": "8.1.0",
  "permissions": [
    "CONTENT_READ",
    "CONTENT_CREATE",
    "CONTENT_UPDATE",
    "SEO_UPDATE"
  ]
}
```

**Headers**:

```
X-Site-Key: gp_site_a1b2c3d4e5f6g7h8
X-Signature: hmac_sha256_signature_here
```

**Response**:

```json
{
  "success": true,
  "verified": true,
  "site": {
    "id": "65e5f6g7h8i9j0k1l2m3n4o5",
    "name": "My Blog",
    "connectionStatus": "CONNECTED"
  }
}
```

### Interview APIs

#### GET /api/interview

**Response**:

```json
{
  "interview": {
    "id": "65f6g7h8i9j0k1l2m3n4o5p6",
    "status": "IN_PROGRESS",
    "currentStep": 3,
    "responses": {
      "websiteUrl": "https://myblog.com",
      "platform": "wordpress",
      "businessName": "My Blog"
    },
    "externalData": {
      "crawledData": {
        "title": "My Blog - Great Content",
        "description": "We write about...",
        "keywords": ["blog", "content"]
      }
    }
  },
  "nextQuestion": {
    "id": "question_004",
    "questionType": "SELECTION",
    "translationKey": "interview.targetAudience",
    "inputConfig": {
      "selectionMode": "cards",
      "options": [
        { "value": "b2b", "label": "Businesses" },
        { "value": "b2c", "label": "Consumers" }
      ]
    }
  }
}
```

#### POST /api/interview

**Request**:

```json
{
  "questionId": "question_004",
  "response": "b2b"
}
```

**Response**:

```json
{
  "success": true,
  "saved": true,
  "nextQuestion": {
    "id": "question_005",
    "questionType": "INPUT",
    "translationKey": "interview.monthlyTraffic"
  }
}
```

#### POST /api/interview/chat

**Request**:

```json
{
  "message": "What keywords should I target for my blog?"
}
```

**Response** (Streaming):

```
data: {"type":"text","content":"Based on your blog about "}
data: {"type":"text","content":"technology, I recommend "}
data: {"type":"text","content":"these keywords:\n\n"}
data: {"type":"function_call","name":"generateKeywords"}
data: {"type":"function_result","data":{"keywords":["tech news","gadget reviews"]}}
data: {"type":"text","content":"1. tech news\n2. gadget reviews"}
data: {"type":"done"}
```

### Admin APIs

#### GET /api/admin/plans

**Response**:

```json
{
  "plans": [
    {
      "id": "plan_basic",
      "name": "Basic",
      "slug": "basic",
      "monthlyPrice": 29,
      "yearlyPrice": 290,
      "status": "active",
      "subscribersCount": 42,
      "features": [
        { "key": "ai_content", "label": "AI Content Generation" },
        { "key": "keyword_tracking", "label": "Keyword Tracking" }
      ],
      "limitations": [
        { "key": "maxSites", "label": "Max Sites", "value": 1 },
        { "key": "maxMembers", "label": "Max Members", "value": 3 },
        { "key": "aiCredits", "label": "AI Credits/month", "value": 10000 }
      ],
      "translations": {
        "he": {
          "name": "בסיסי",
          "description": "תוכנית מתאימה למתחילים"
        }
      }
    }
  ],
  "stats": {
    "totalPlans": 3,
    "totalSubscribers": 127,
    "avgPrice": 65
  }
}
```

#### POST /api/admin/plans

**Request**:

```json
{
  "name": "Pro",
  "slug": "pro",
  "description": "For growing businesses",
  "price": 79,
  "yearlyPrice": 790,
  "features": [
    { "key": "ai_content", "label": "AI Content Generation" },
    { "key": "priority_support", "label": "Priority Support" }
  ],
  "limitations": [
    { "key": "maxSites", "label": "Max Sites", "value": 10, "type": "number" },
    {
      "key": "maxMembers",
      "label": "Max Members",
      "value": 10,
      "type": "number"
    },
    {
      "key": "aiCredits",
      "label": "AI Credits/month",
      "value": 50000,
      "type": "number"
    }
  ]
}
```

**Response**:

```json
{
  "success": true,
  "plan": {
    "id": "plan_pro",
    "name": "Pro",
    "slug": "pro",
    "price": 79
  },
  "message": "Plan created successfully"
}
```

---

## תהליכי עבודה מפורטים

### Complete Registration Flow (משתמש חדש)

```
1. User visits /auth/register
   └─> Shows registration form

2. User fills form and submits
   └─> POST /api/auth/register
       ├─> Validate input (Zod schema)
       ├─> Check if email exists
       ├─> Hash password (bcryptjs, rounds: 10)
       ├─> Create TempRegistration
       │   └─> Status: FORM
       ├─> Generate OTP (6 digits, expires in 10 minutes)
       ├─> Send verification email (nodemailer)
       └─> Return tempRegId

3. User receives email with OTP
   └─> Enters code in UI

4. User submits OTP
   └─> POST /api/auth/verification/otp
       ├─> Find TempRegistration by tempRegId
       ├─> Validate OTP code
       ├─> Check expiration
       ├─> Check attempts (max 3)
       ├─> Mark emailVerified
       ├─> Update status: VERIFY → ACCOUNT_SETUP
       └─> Return success

5. UI shows Account Setup form
   └─> User enters company name

6. User submits company name
   └─> POST /api/auth/registration/account-setup
       ├─> Validate account name
       ├─> Generate slug (kebab-case)
       ├─> Check slug uniqueness
       ├─> Update TempRegistration
       │   ├─> accountName
       │   ├─> accountSlug
       │   └─> Status: ACCOUNT_SETUP → INTERVIEW
       └─> Return success

7. UI shows Interview Wizard
   └─> AI guides user through questions

8. User completes interview
   └─> POST /api/interview (multiple times)
       ├─> Save each response
       ├─> Execute auto-actions (crawl, analyze)
       ├─> Build externalData
       └─> Mark interview complete

9. UI shows Plan Selection
   └─> User selects a plan

10. User confirms plan
    └─> POST /api/auth/registration/select-plan
        ├─> Validate planId
        ├─> Update TempRegistration
        │   ├─> selectedPlanId
        │   └─> Status: INTERVIEW → PLAN
        └─> Return success

11. UI proceeds to finalize (skip payment for now)
    └─> POST /api/auth/registration/finalize
        └─> Inside $transaction:
            ├─> 1. Create User
            │   ├─> Hash password
            │   ├─> Set emailVerified
            │   └─> registrationStep: COMPLETED
            ├─> 2. Create Account
            │   ├─> name, slug
            │   ├─> billingEmail, generalEmail
            │   ├─> timezone, defaultLanguage
            │   └─> aiCreditsBalance: 0
            ├─> 3. Create Owner Role
            │   ├─> name: "Owner"
            │   ├─> permissions: [] (bypassed)
            │   └─> isSystemRole: true
            ├─> 4. Create AccountMember
            │   ├─> userId
            │   ├─> accountId
            │   ├─> roleId
            │   ├─> isOwner: true
            │   └─> status: ACTIVE
            ├─> 5. Create Subscription
            │   ├─> accountId
            │   ├─> planId
            │   ├─> status: ACTIVE
            │   ├─> billingInterval: MONTHLY
            │   ├─> currentPeriodStart: now()
            │   └─> currentPeriodEnd: now() + 30 days
            ├─> 6. Add AI Credits
            │   ├─> Get plan limitations
            │   ├─> Extract aiCredits value
            │   ├─> Update account.aiCreditsBalance
            │   └─> Create AiCreditsLog (CREDIT)
            ├─> 7. Create Session
            │   ├─> Generate sessionToken (UUID)
            │   ├─> Set expires: now() + 30 days
            │   └─> Store in DB
            ├─> 8. Delete TempRegistration
            └─> 9. Return: user, account, session

12. API sets session cookie
    └─> Set-Cookie: gp_session=token; HttpOnly; Secure

13. Client redirects to /dashboard
    └─> User is now logged in!
```

### WordPress Plugin Connection Flow

```
1. User creates Site in Platform
   └─> POST /api/sites
       ├─> Validate account has sites quota
       ├─> Create Site record
       ├─> Generate siteKey (gp_site_xxx)
       ├─> Generate siteSecret (random 32 bytes)
       ├─> connectionStatus: PENDING
       └─> Return siteKey to user

2. User installs WordPress plugin
   ├─> Download from Platform
   ├─> Upload to WordPress
   └─> Activate plugin

3. User enters siteKey in plugin settings
   └─> Plugin Settings Page
       └─> Input field for siteKey

4. Plugin verifies connection
   └─> POST https://app.ghostpost.com/api/plugin/auth/verify
       ├─> Headers: X-Site-Key: gp_site_xxx
       ├─> Body: {
       │     "pluginVersion": "1.2.0",
       │     "wpVersion": "6.4.2",
       │     "phpVersion": "8.1.0"
       │   }
       └─> Platform verifies siteKey
           ├─> Find Site by siteKey
           ├─> Return siteSecret + site info
           └─> Response: {
                 "success": true,
                 "siteSecret": "secret_xxx",
                 "site": {
                   "id": "xxx",
                   "name": "My Blog",
                   "accountName": "My Company"
                 }
               }

5. Plugin stores siteSecret securely
   └─> Encrypted in wp_options table
       └─> update_option('gp_site_secret', encrypt($siteSecret))

6. Plugin sends verification with signature
   └─> POST /api/plugin/auth/verify
       ├─> Headers:
       │   ├─> X-Site-Key: gp_site_xxx
       │   └─> X-Signature: hmac_sha256(body, siteSecret)
       ├─> Body: {
       │     "verified": true,
       │     "permissions": [
       │       "CONTENT_READ",
       │       "CONTENT_CREATE",
       │       "CONTENT_UPDATE",
       │       "SEO_UPDATE"
       │     ]
       │   }
       └─> Platform verifies HMAC
           ├─> Verify signature
           ├─> Update Site:
           │   ├─> connectionStatus: CONNECTED
           │   ├─> sitePermissions: [...]
           │   ├─> pluginVersion
           │   ├─> wpVersion
           │   └─> lastPingAt: now()
           └─> Return success

7. Plugin starts heartbeat (every 5 minutes)
   └─> Cron job: wp_schedule_event('gp_ping')
       └─> POST /api/plugin/ping
           ├─> Headers: X-Site-Key, X-Signature
           ├─> Body: {
           │     "version": "1.2.0",
           │     "status": "active"
           │   }
           └─> Platform updates lastPingAt

8. Platform can now request data
   └─> Example: Initial sync
       └─> Platform calls WordPress REST API
           ├─> GET /wp-json/ghostpost/v1/posts
           ├─> Authorization: siteKey + signature
           └─> Plugin returns posts data

9. Or: Plugin pushes data
   └─> When post is published:
       └─> POST /api/plugin/content/push
           ├─> Headers: X-Site-Key, X-Signature
           ├─> Body: {
           │     "type": "post",
           │     "action": "published",
           │     "data": {
           │       "id": 123,
           │       "title": "New Post",
           │       "content": "...",
           │       "slug": "new-post"
           │     }
           │   }
           └─> Platform updates/creates SiteEntity

Connection established! ✓
```

### Content Generation with AI Flow

```
1. User clicks "Generate Content" in dashboard
   └─> Opens content generation modal

2. User selects keyword or enters topic
   └─> Input: "How to improve website speed"

3. User submits generation request
   └─> POST /api/content/generate
       ├─> Body: {
       │     "siteId": "xxx",
       │     "keyword": "improve website speed",
       │     "type": "BLOG_POST",
       │     "tone": "professional"
       │   }
       └─> Server processes:

4. Server validates AI credits
   └─> const account = await prisma.account.findUnique(...)
       └─> if (account.aiCreditsBalance < estimatedCost) {
             return error('Insufficient credits')
           }

5. Server analyzes existing content
   └─> const siteEntities = await prisma.siteEntity.findMany({
         where: { siteId },
         take: 5,
         orderBy: { createdAt: 'desc' }
       })
       └─> Extract writing style, tone, structure

6. Server calls AI service
   └─> import { generateStructuredResponse } from '@/lib/ai/gemini';
       └─> const content = await generateStructuredResponse({
             system: `You are an SEO content writer for ${site.name}.
                      Writing style: ${analyzedStyle}
                      Target keyword: ${keyword}`,
             prompt: `Generate a comprehensive blog post about "${keyword}".
                      Include:
                      - Engaging title (60-70 chars)
                      - Meta description (150-160 chars)
                      - Introduction
                      - 5-7 H2 sections with content
                      - Conclusion
                      - Call to action`,
             schema: z.object({
               title: z.string(),
               metaDescription: z.string(),
               content: z.string(), // HTML
               excerpt: z.string(),
               suggestedSlug: z.string(),
               focusKeyword: z.string(),
               h2Headings: z.array(z.string()),
             }),
           });

7. AI generates content
   └─> Gemini processes request
       └─> Returns structured JSON

8. Server creates Content record
   └─> const newContent = await prisma.content.create({
         data: {
           siteId,
           title: content.title,
           slug: content.suggestedSlug,
           content: content.content,
           excerpt: content.excerpt,
           metaTitle: content.title,
           metaDescription: content.metaDescription,
           status: 'DRAFT',
           aiGenerated: true,
           wordCount: calculateWordCount(content.content),
         },
       });

9. Server deducts AI credits
   └─> await deductAiCredits({
         accountId: account.id,
         amount: 100, // Based on tokens used
         source: 'content_generation',
         sourceId: newContent.id,
         userId: user.id,
         siteId,
         description: `Generated: "${newContent.title}"`,
       });

10. Server returns generated content
    └─> Response: {
          "success": true,
          "content": {
            "id": "xxx",
            "title": "10 Proven Ways to Improve Website Speed",
            "content": "<h2>1. Optimize Images</h2><p>...",
            "metaDescription": "Discover 10 proven...",
            "wordCount": 1247,
            "status": "DRAFT"
          },
          "creditsUsed": 100,
          "creditsRemaining": 9900
        }

11. UI displays generated content in editor
    └─> TipTap editor with HTML content

12. User reviews and edits
    └─> Makes changes in editor

13. User publishes or schedules
    └─> PATCH /api/content/[id]
        └─> Update content
            └─> status: 'PUBLISHED' or 'SCHEDULED'

14. If connected to WordPress:
    └─> POST to WordPress REST API
        └─> Create/update post in WordPress
            └─> Sync back entity data

Content published! ✓
```

---

## מסקנות וסיכום

**Ghost Post Platform** היא מערכת מקיפה וחזקה שמשלבת:

1. **ארכיטקטורה מודרנית**: Next.js 15, React 19, MongoDB, Prisma
2. **AI מתקדם**: Gemini 2.0 עם function calling ו-structured output
3. **Multi-Tenancy מלא**: Accounts, Users, Sites עם הפרדה מושלמת
4. **הרשאות גרנולריות**: 50+ הרשאות, תפקידים מותאמים
5. **מינויים דינמיים**: Plans + Add-Ons בלי קוד קשיח
6. **אינטגרציה עמוקה**: WordPress Plugin עם HMAC authentication
7. **Interview מבוסס AI**: 12 סוגי שאלות, bot actions, flow engine
8. **תרגום מלא**: 12 שפות, RTL support
9. **AI Credits Economy**: מעקב מדויק, logging, refills
10. **סקלביליות**: מוכן לאלפי accounts ומיליוני entities

המערכת מתאימה ל:

- **סוכנויות SEO**: ניהול עשרות לקוחות
- **עסקים**: ניהול רשתות אתרים
- **פרילנסרים**: ניהול פרוייקטים מרובים
- **ארגונים**: צוותים גדולים עם הרשאות מורכבות
