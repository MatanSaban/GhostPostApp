/**
 * Sync Plugin Version
 * 
 * Reads the version from app/api/plugin/version.js (single source of truth)
 * and updates the WordPress plugin PHP file to match.
 * 
 * Usage: node scripts/sync-plugin-version.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(__dirname, '..');
const pluginRoot = resolve(platformRoot, '..', 'gp-wordpress-plugin', 'ghost-post-connector');

// 1. Read version from version.js
const versionFile = resolve(platformRoot, 'app', 'api', 'plugin', 'version.js');
const versionContent = readFileSync(versionFile, 'utf-8');
const match = versionContent.match(/PLUGIN_VERSION\s*=\s*"([^"]+)"/);

if (!match) {
  console.error('Could not find PLUGIN_VERSION in version.js');
  process.exit(1);
}

const version = match[1];
console.log(`Plugin version: ${version}`);

// 2. Update ghost-post-connector.php
const phpFile = resolve(pluginRoot, 'ghost-post-connector.php');
let phpContent = readFileSync(phpFile, 'utf-8');

const oldHeader = phpContent.match(/\* Version:\s*[\d.]+/);
const oldConstant = phpContent.match(/define\('GP_CONNECTOR_VERSION',\s*'[\d.]+'\)/);

if (!oldHeader || !oldConstant) {
  console.error('Could not find version strings in ghost-post-connector.php');
  process.exit(1);
}

phpContent = phpContent
  .replace(/(\* Version:\s*)[\d.]+/, `$1${version}`)
  .replace(/(define\('GP_CONNECTOR_VERSION',\s*')[\d.]+('\))/, `$1${version}$2`);

writeFileSync(phpFile, phpContent, 'utf-8');
console.log(`Updated ghost-post-connector.php → ${version}`);
console.log('Done! All version references are in sync.');
