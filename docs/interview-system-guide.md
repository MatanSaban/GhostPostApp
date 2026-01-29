# Interview System - Complete Implementation Guide

This document describes the 10-phase interview system with AI bot capabilities.

## Overview

The interview system allows new users to go through a personalized onboarding flow where an AI assistant guides them through questions about their business, website, and SEO goals.

## Architecture

### Database Models (Prisma)

- **InterviewQuestion** - Defines interview questions with 10 different types
- **BotAction** - Defines actions the AI can perform
- **UserInterview** - Tracks user's progress through the interview
- **InterviewMessage** - Stores conversation history

### Question Types

1. **GREETING** - Welcome message with a continue button
2. **INPUT** - Free text input (text, email, url, number, textarea)
3. **CONFIRMATION** - Yes/No or custom confirm/cancel buttons
4. **SELECTION** - Single choice from options
5. **MULTI_SELECTION** - Multiple choice from options
6. **DYNAMIC** - Options loaded from an API endpoint
7. **EDITABLE_DATA** - Display data that user can modify
8. **FILE_UPLOAD** - File upload with type/size restrictions
9. **SLIDER** - Numeric slider with min/max/step
10. **AI_SUGGESTION** - AI generates a suggestion user can accept/modify

## Setup

### Environment Variables

Add these to your `.env` file:

```env
# Required: Choose one AI provider
OPENAI_API_KEY=your-openai-api-key
# OR
ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional: Specify provider (defaults to openai if OPENAI_API_KEY exists)
AI_PROVIDER=openai  # or 'anthropic'
```

### Database Migration

Run Prisma migration to update the database:

```bash
npx prisma migrate dev --name add-interview-system
npx prisma generate
```

## API Endpoints

### Public Interview APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/interview` | GET | Get current interview state |
| `/api/interview` | POST | Submit a response |
| `/api/interview` | DELETE | Abandon interview |
| `/api/interview/chat` | POST | Send message to AI |
| `/api/interview/actions` | POST | Execute a bot action |

### Admin APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/interview-flow` | GET | List all questions |
| `/api/admin/interview-flow` | POST | Create a question |
| `/api/admin/interview-flow/[id]` | GET | Get single question |
| `/api/admin/interview-flow/[id]` | PUT | Update a question |
| `/api/admin/interview-flow/[id]` | DELETE | Delete a question |
| `/api/admin/bot-actions` | GET | List all bot actions |
| `/api/admin/bot-actions` | POST | Create a bot action |
| `/api/admin/bot-actions/[id]` | PUT | Update a bot action |
| `/api/admin/bot-actions/[id]` | DELETE | Delete a bot action |
| `/api/admin/bot-actions/test` | POST | Test a bot action |

## Admin Pages

- **Interview Flow**: `/dashboard/admin/interview-flow`
  - Create, edit, delete, and reorder interview questions
  - Configure input settings, validation, AI config, and display conditions

- **Bot Actions**: `/dashboard/admin/bot-actions`
  - Create and manage bot actions
  - Test actions with mock context
  - Configure action schemas and implementations

## Flow Engine

Located at `/lib/interview/flow-engine.js`, provides:

- `getNextQuestion(interviewId)` - Get next valid question
- `shouldShowQuestion(question, responses)` - Evaluate display conditions
- `evaluateCondition(condition, responses)` - Complex condition operators
- `validateResponse(question, response)` - Validate user input
- `executeAutoActions(question, context)` - Run automatic actions
- `getInterviewProgress(interviewId)` - Calculate completion %
- `completeInterview(interviewId, context)` - Finalize interview
- `getInterviewSummary(interviewId)` - Build response summary

### Condition Operators

The flow engine supports these condition operators:

- `equals` / `notEquals` - Exact match comparison
- `contains` / `notContains` - String/array contains
- `exists` / `isEmpty` - Value existence checks
- `greaterThan` / `lessThan` - Numeric comparisons
- `and` / `or` - Combine multiple conditions

Example condition:
```json
{
  "operator": "and",
  "conditions": [
    { "operator": "equals", "field": "business_type", "value": "ecommerce" },
    { "operator": "greaterThan", "field": "monthly_revenue", "value": 10000 }
  ]
}
```

## AI Service

Located at `/lib/ai/service.js`, supports:

- **OpenAI** (default): GPT-4o-mini with function calling
- **Anthropic**: Claude 3 Haiku with tool use

Features:
- Automatic function/tool calling for bot actions
- System prompt building for interview context
- Response streaming support

## Frontend Components

### InterviewWizardAI

Located at `/components/ui/interview-wizard-ai.jsx`

Usage:
```jsx
import InterviewWizardAI from '@/components/ui/interview-wizard-ai';

function MyPage() {
  return (
    <InterviewWizardAI 
      onComplete={(responses) => console.log('Interview complete', responses)}
    />
  );
}
```

Features:
- All 10 question type renderers
- Chat mode toggle for AI conversation
- Progress tracking
- Auto-action execution
- Error handling and validation

## Translations

Translation keys are available in both English and Hebrew:

- `nav.admin.interviewFlow` - Sidebar navigation
- `nav.admin.botActions` - Sidebar navigation
- `admin.interviewFlow.*` - Interview flow admin page
- `admin.botActions.*` - Bot actions admin page
- `interviewWizard.*` - Frontend interview wizard

## Testing Checklist

### Database
- [ ] Prisma schema is valid
- [ ] Migration runs successfully
- [ ] Can create/read/update/delete InterviewQuestion
- [ ] Can create/read/update/delete BotAction
- [ ] Can create/read/update/delete UserInterview

### Admin Pages
- [ ] Interview Flow page loads
- [ ] Can create a new question
- [ ] Can edit an existing question
- [ ] Can delete a question
- [ ] Can reorder questions
- [ ] Bot Actions page loads
- [ ] Can create a new action
- [ ] Can test an action

### Interview API
- [ ] GET /api/interview returns interview state
- [ ] POST /api/interview saves response
- [ ] Response validation works
- [ ] Show conditions evaluated correctly
- [ ] Auto-actions execute

### AI Integration
- [ ] Chat endpoint responds (with API key)
- [ ] Function calling works
- [ ] Bot actions can be invoked from AI

### Frontend
- [ ] All question types render correctly
- [ ] Navigation works (next/back)
- [ ] Validation errors display
- [ ] Progress indicator updates
- [ ] Chat mode toggle works

## Troubleshooting

### AI not responding
- Verify API key is set in `.env`
- Check server logs for errors
- Ensure `AI_PROVIDER` matches your key

### Questions not showing
- Check `showCondition` JSON is valid
- Verify `isActive` is true
- Check `order` is correct

### Validation not working
- Verify `validation` JSON is valid
- Check validation settings in admin

### Bot actions failing
- Check action schema is valid JSON Schema
- Verify implementation settings
- Test action in admin panel
