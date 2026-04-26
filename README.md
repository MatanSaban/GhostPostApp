# GhostSEO Platform

AI-Powered SEO Automation Platform

---

## 📖 תיעוד מערכת מקיף

המערכת מתועדת במלואה במסמכים הבאים:

### 📋 [סיכום מנהלים](EXECUTIVE_SUMMARY.md)

סקירה כללית של המערכת, יעדים, יתרונות תחרותיים וקהל יעד.  
**מומלץ למי שרוצה להבין את המערכת ב-10 דקות.**

### 📘 [תיעוד מלא - חלק 1](SYSTEM_OVERVIEW.md)

ארכיטקטורה טכנולוגית, מודל נתונים, מערכת הרשאות, ומודל מינויים.  
**מומלץ למפתחים וארכיטקטים.**

### 📗 [תיעוד מלא - חלק 2](SYSTEM_OVERVIEW_PART2.md)

Add-Ons, AI Credits Economy, Interview System, WordPress Integration, תיעוד API, ותהליכי עבודה מפורטים.  
**מומלץ למפתחים המיישמים פיצ'רים ספציפיים.**

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB database (local or Atlas)
- Google AI API Key (for Gemini)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Update `.env` with your credentials:

```env
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/ghostpost"
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

4. Generate Prisma client:

```bash
npm run prisma:generate
```

5. Push schema to database:

```bash
npm run prisma:push
```

6. (Optional) Seed database:

```bash
npm run prisma:seed
```

7. Run development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the platform.

---

## 🏗️ Project Structure

```
gp-platform/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Protected dashboard
│   ├── components/        # Shared components
│   ├── context/           # React contexts
│   └── hooks/             # Custom hooks
├── lib/                   # Server-side utilities
│   ├── ai/               # AI services (Gemini)
│   ├── bot-actions/      # Bot action handlers
│   └── interview/        # Interview flow engine
├── prisma/               # Database schema & seeds
├── i18n/                 # Internationalization
├── docs/                 # Documentation
└── public/               # Static assets
```

---

## 🎯 Core Features

### 🤖 AI-Powered

- Content generation with Gemini 2.0
- Interview system with AI bot
- Automated keyword research
- Competitor analysis

### 🔌 WordPress Integration

- Deep integration via custom plugin
- HMAC-authenticated communication
- Two-way content sync
- ACF & Custom Post Types support

### 👥 Multi-Tenancy

- Account-based architecture
- Team collaboration
- Granular permissions (50+ permissions)
- Custom roles

### 💰 Flexible Billing

- Dynamic subscription plans
- Add-ons system
- AI Credits economy
- Multi-currency support

### 🌍 Internationalization

- 12 languages supported
- RTL support (Hebrew, Arabic)
- Translated admin interfaces

---

## 🛠️ Tech Stack

### Frontend

- **Next.js 15** - App Router, Server Components
- **React 19** - Latest React features
- **CSS Modules** - Scoped, nested styles
- **Framer Motion** - Smooth animations
- **TipTap** - Rich text editor

### Backend

- **Node.js** - JavaScript runtime
- **MongoDB** - NoSQL database
- **Prisma** - Type-safe ORM
- **NextAuth** - Authentication

### AI & Services

- **Google Gemini 2.0** - AI model
- **Vercel AI SDK** - AI integration
- **nodemailer** - Email service

---

## 📊 Database Models

המערכת כוללת 30+ מודלים עיקריים:

### Core Models

- `User` - משתמשים
- `Account` - חברות/ארגונים
- `AccountMember` - חברות בצוות
- `Role` - תפקידים והרשאות
- `Site` - אתרים

### Billing Models

- `Plan` - תוכניות מינוי
- `Subscription` - מנויים פעילים
- `AddOn` - תוספים
- `AddOnPurchase` - רכישות תוספים
- `Payment` - תשלומים

### Content Models

- `SiteEntity` - תוכן מהאתר
- `SiteEntityType` - סוגי תוכן
- `Content` - תוכן שנוצר
- `Keyword` - מילות מפתח
- `Redirection` - הפניות

### Interview Models

- `InterviewQuestion` - שאלות
- `BotAction` - פעולות bot
- `UserInterview` - session משתמש
- `InterviewMessage` - היסטוריה

### Other Models

- `SiteAudit` - ביקורות
- `AiCreditsLog` - לוג קרדיטים
- `I18nTranslation` - תרגומים
- `Session` - sessions
- `OtpCode` - קודי אימות

---

## 🔐 Security Features

- **Password Hashing** - bcryptjs with salt rounds
- **HMAC Authentication** - For WordPress plugin
- **Session Management** - Secure session storage
- **OTP Verification** - 2FA for registration
- **Permission System** - Granular access control
- **CSRF Protection** - Built-in Next.js protection

---

## 🧪 Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:push      # Push schema to database
npm run prisma:studio    # Open Prisma Studio
npm run prisma:seed      # Seed database

# Utilities
node scripts/seed-interview-questions.js    # Seed interview questions
node scripts/check-translations.js          # Check missing translations
node scripts/fill-missing-translations.js   # Fill missing translations
```

---

## 🌟 Unique Features

### 1. Centralized AI Configuration

כל שימוש ב-AI עובר דרך `lib/ai/gemini.js` - שינוי במקום אחד משפיע על כל המערכת.

### 2. Interview AI System

מערכת ראיון חכמה עם 12 סוגי שאלות, bot actions, ו-flow engine מתקדם.

### 3. AI Credits Economy

מעקב מלא אחר שימוש בקרדיטים, הוספה אוטומטית, ורכישת חבילות.

### 4. WordPress Deep Integration

לא רק API - אינטגרציה מלאה עם plugin מאובטח, סנכרון דו-כיווני, ותמיכה ב-ACF.

### 5. Dynamic Subscription System

Plans ו-Limitations מוגדרים ב-JSON - אפשר לשנות הכל ללא קוד.

### 6. Granular Permissions

50+ הרשאות מובנות, 4 תפקידים מובנים, ואפשרות ליצור custom roles.

---

## 📝 License

Private - GhostSEO © 2026

---

## 📬 Contact & Support

For questions or support, please refer to the documentation files or contact the development team.

---

## 🗂️ Documentation Index

1. **[Executive Summary](EXECUTIVE_SUMMARY.md)** - סקירה כללית (10 דקות קריאה)
2. **[System Overview Part 1](SYSTEM_OVERVIEW.md)** - ארכיטקטורה ומודל נתונים (30 דקות)
3. **[System Overview Part 2](SYSTEM_OVERVIEW_PART2.md)** - פרטים טכניים ותהליכים (45 דקות)
4. **[Interview System Guide](docs/interview-system-guide.md)** - מדריך מערכת הראיון

---

**Built with ❤️ using Next.js 15, React 19, MongoDB, Prisma, and Google Gemini AI**

### Prerequisites

- Node.js 18+
- MongoDB database (local or Atlas)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Copy environment file and configure:

```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB connection string:

```
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/ghostpost?retryWrites=true&w=majority"
```

4. Generate Prisma client:

```bash
npm run prisma:generate
```

5. Push schema to database:

```bash
npm run prisma:push
```

6. Run development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the platform.

## Project Structure

```
gp-platform/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.jsx
│   │   ├── register/
│   │   │   ├── page.jsx
│   │   │   └── thank-you/
│   │   │       └── page.jsx
│   │   ├── auth.module.css
│   │   └── layout.jsx
│   ├── dashboard/
│   │   ├── [feature]/
│   │   │   └── page.jsx
│   │   ├── dashboard.module.css
│   │   ├── layout.jsx
│   │   ├── page.jsx
│   │   └── page.module.css
│   ├── components/
│   │   └── ui/
│   │       ├── button.jsx
│   │       ├── card.jsx
│   │       ├── input.jsx
│   │       ├── theme-toggle.jsx
│   │       └── index.js
│   ├── context/
│   │   └── theme-context.jsx
│   ├── styles/
│   │   ├── fonts.css
│   │   └── theme.css
│   ├── globals.css
│   ├── layout.jsx
│   └── page.jsx
├── lib/
│   └── prisma.js
├── prisma/
│   └── schema.prisma
├── package.json
└── README.md
```

## Features

### Authentication

- `/auth/login` - User login
- `/auth/register` - User registration
- `/auth/register/thank-you` - Registration success

### Dashboard

- `/dashboard` - Main command center
- `/dashboard/site-interview` - Site profile questionnaire
- `/dashboard/content-planner` - Content calendar and planning
- `/dashboard/automations` - Automation workflows
- `/dashboard/link-building` - Backlink management
- `/dashboard/redirections` - URL redirect management
- `/dashboard/seo-frontend` - Frontend SEO analysis
- `/dashboard/seo-backend` - Technical SEO monitoring
- `/dashboard/site-audit` - Site audit & Core Web Vitals
- `/dashboard/keyword-strategy` - Keyword research & tracking
- `/dashboard/settings` - Platform settings

## Theme System

The platform supports light and dark themes with a theme toggle button.

Theme variables are defined in `app/styles/theme.css` and can be customized.

## Font Support

Currently using Poppins font. The font system is designed to support multiple fonts for future internationalization:

- Fonts are imported in `app/styles/fonts.css`
- CSS variable `--font-primary` controls the main font

## Development

### CSS Modules

All components use CSS Modules with fully nested syntax (like SCSS):

```css
.card {
  background: var(--card);

  .dark & {
    background: var(--gradient-card);
  }

  &:hover {
    transform: translateY(-2px);
  }
}
```

### Adding New Dashboard Pages

1. Create a new folder under `app/dashboard/[feature-name]/`
2. Add `page.jsx` with the page component
3. The navigation menu in `layout.jsx` will automatically include the route

## License

Private - GhostSEO © 2026
