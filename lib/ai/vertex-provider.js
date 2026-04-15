/**
 * Centralized Google Vertex AI Provider
 * 
 * Migrated from @ai-sdk/google (AI Studio) to @ai-sdk/google-vertex (Vertex AI)
 * to bypass the 250 RPD limit on Google AI Studio.
 * 
 * Authentication via service account credentials stored in environment variables.
 */

import { createVertex } from '@ai-sdk/google-vertex';

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
  googleAuthOptions: {
    credentials: {
      client_email: process.env.GOOGLE_VERTEX_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_VERTEX_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  },
});

export { vertex };
// Alias for drop-in compatibility with files that used `import { google } from '@ai-sdk/google'`
export { vertex as google };
export default vertex;
