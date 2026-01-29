# Ghost Post Platform

AI-Powered SEO Automation Platform

## Tech Stack

- **Framework**: Next.js 15+
- **Database**: MongoDB with Prisma ORM
- **Styling**: CSS Modules with nested syntax
- **Font**: Poppins (with support for future multi-language fonts)
- **Language**: JavaScript/JSX

## Getting Started

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

Private - Ghost Post © 2026
