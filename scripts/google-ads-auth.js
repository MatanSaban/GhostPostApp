/**
 * One-time helper to generate a Google Ads OAuth refresh token.
 * 
 * Uses google-auth-library + a local HTTP server to handle the callback automatically.
 * 
 * Usage:
 *   1. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in your .env
 *   2. Run: node scripts/google-ads-auth.js
 *   3. A browser window opens - sign in with the Google account that owns your Ads account
 *   4. The refresh token will be printed in the terminal
 *   5. Copy it to .env as GOOGLE_ADS_REFRESH_TOKEN
 */

import 'dotenv/config';
import http from 'http';
import { exec } from 'child_process';
import { OAuth2Client } from 'google-auth-library';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

// Ensure .env is loaded from the project root (gp-platform), not cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3456/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/adwords'],
});

// Start a temporary local server to receive the OAuth callback
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const url = new URL(req.url, `http://localhost:3456`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Error: ${error}</h1><p>You can close this window.</p>`);
    console.error('\nOAuth error:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Missing authorization code</h1>');
    return;
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <h1 style="color: green;">Success!</h1>
      <p>Refresh token has been printed in your terminal.</p>
      <p>You can close this window.</p>
    `);

    console.log('\n=== Success! ===\n');
    console.log('Add this to your .env file:\n');
    console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n(Access token for testing):', tokens.access_token?.substring(0, 30) + '...');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Token exchange failed</h1><p>${err.message}</p>`);
    console.error('\nToken exchange failed:', err.message);
  }

  server.close();
  setTimeout(() => process.exit(0), 500);
});

server.listen(3456, () => {
  console.log('\n=== Google Ads OAuth Setup ===\n');
  console.log('Opening browser... If it does not open, visit this URL:\n');
  console.log(authUrl);
  console.log('\nWaiting for callback on http://localhost:3456/oauth2callback ...\n');

  // Try to open the browser automatically
  exec(`start "" "${authUrl}"`);
});
