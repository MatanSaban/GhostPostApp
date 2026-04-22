/**
 * Centralized Google Vertex AI Provider
 *
 * Migrated from @ai-sdk/google (AI Studio) to @ai-sdk/google-vertex (Vertex AI)
 * to bypass the 250 RPD limit on Google AI Studio.
 *
 * Authentication via service account credentials stored in environment variables.
 *
 * Two providers are exported:
 *   - `vertex` / `google` - regional endpoint (default: us-central1).
 *     Use for older Gemini models (2.5, 2.0, etc.) that run regionally.
 *   - `vertexGlobal` / `googleGlobal` - global endpoint.
 *     Required for Gemini 3.x preview models, which only run on the global endpoint.
 */

import { createVertex } from '@ai-sdk/google-vertex';

const credentials = {
  client_email: process.env.GOOGLE_VERTEX_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_VERTEX_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
  googleAuthOptions: { credentials },
});

const vertexGlobal = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: 'global',
  googleAuthOptions: { credentials },
});

export { vertex, vertexGlobal };
// Aliases for drop-in compatibility with files that used `import { google } from '@ai-sdk/google'`
export { vertex as google, vertexGlobal as googleGlobal };
export default vertex;
