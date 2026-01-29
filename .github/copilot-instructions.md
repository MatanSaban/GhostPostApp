# GitHub Copilot Instructions for gp-platform

## Meta Instruction
**IMPORTANT**: When the user tells you to always do something for this project, add that instruction to this file (`.github/copilot-instructions.md`) so it's preserved for future sessions.

## AI Service Guidelines

### Always Use Vercel AI SDK
- All AI operations must use the **Vercel AI SDK** (`ai` package)
- Never use direct API calls to OpenAI, Anthropic, or Google AI
- Import AI functionality from `@/lib/ai/gemini.js` or the central index

### Centralized AI Configuration
The AI model configuration is centralized in `lib/ai/gemini.js`:

```javascript
// Model configurations - Change these to update AI models across the entire platform
export const MODELS = {
  TEXT: 'gemini-2.5-pro-preview-05-06',  // Gemini Pro 3 Preview
  IMAGE: 'imagen-3.0-generate-002',
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
