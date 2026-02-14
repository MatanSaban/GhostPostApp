/**
 * Cloudinary Screenshot Uploader
 *
 * Uploads audit screenshots to Cloudinary instead of storing base64 in MongoDB.
 *
 * Folder structure:
 *   {accountSlug}/{siteHost}/{auditTimestamp}_{auditSeq}/ss_{pageSlug}_{device}.jpeg
 *
 * Example:
 *   acme-corp/example.co.il/2026-02-12_14-30_1/ss_about-us_desktop.jpeg
 *   acme-corp/example.co.il/2026-02-12_14-30_1/ss_שירותים_mobile.jpeg
 */

import { v2 as cloudinary } from 'cloudinary';
import prisma from '@/lib/prisma';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Read .env manually (webpack replaces process.env at compile time) ────
function readEnvFile() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
    return vars;
  } catch (e) {
    console.error('[Cloudinary] Failed to read .env file:', e.message);
    return {};
  }
}

// ─── Configure Cloudinary lazily ─────────────────────────────────────────────

let _configured = false;
function ensureConfig() {
  if (_configured) return;

  const env = readEnvFile();

  // CLOUDINARY_URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  const cUrl = env.CLOUDINARY_URL || process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({
        cloud_name: match[3],
        api_key: match[1],
        api_secret: match[2],
        secure: true,
      });
    }
  }

  // Fallback: individual env vars
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  const cfg = cloudinary.config();
  console.log('[Cloudinary] Configured — cloud:', cfg.cloud_name || 'MISSING', 'key:', cfg.api_key ? '***' + String(cfg.api_key).slice(-4) : 'MISSING');
  _configured = true;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Upload a JPEG buffer to Cloudinary and return its secure URL.
 *
 * @param {Buffer} buffer — JPEG image data
 * @param {string} folder — Cloudinary folder path (slash-separated)
 * @param {string} publicId — Filename without extension
 * @returns {Promise<string>} — Cloudinary secure URL
 */
async function uploadBuffer(buffer, folder, publicId) {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        format: 'jpg',
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Extract a clean slug from a URL pathname.
 *  - Decodes URI components (supports Hebrew etc.)
 *  - Strips leading/trailing slashes
 *  - Replaces slashes with dashes
 *  - Falls back to "homepage" for root path
 */
function pageSlug(pageUrl) {
  try {
    const { pathname } = new URL(pageUrl);
    let decoded = decodeURIComponent(pathname);
    decoded = decoded.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'homepage';
    // Limit length to avoid super-long public IDs
    return decoded.slice(0, 120);
  } catch {
    return 'page';
  }
}

/**
 * Extract host from a URL (strip www. prefix).
 */
function siteHost(siteUrl) {
  try {
    let host = new URL(siteUrl).hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return 'unknown-site';
  }
}

/**
 * Build the Cloudinary folder path for an audit.
 *
 * Format: ghost-post/{accountSlug}/{siteHost}/{datetime}_{seq}
 *
 * @param {string} accountSlug
 * @param {string} siteUrl
 * @param {Date}   auditDate
 * @param {number} auditSeq — sequence number for audits on the same date (1-based)
 */
function buildAuditFolder(accountSlug, siteUrl, auditDate, auditSeq) {
  const host = siteHost(siteUrl);
  const d = auditDate || new Date();
  const ts = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-') + '_' + [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join('-');

  return `ghost-post/${accountSlug}/${host}/${ts}_${auditSeq}`;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Resolve the Cloudinary folder for a given audit.
 *
 * Looks up account slug, counts same-day audits for sequencing.
 *
 * @param {string} auditId
 * @param {string} siteId
 * @param {string} siteUrl
 * @returns {Promise<string>} — folder path
 */
export async function resolveAuditFolder(auditId, siteId, siteUrl) {
  // Get account slug
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { accountId: true },
  });
  const account = site
    ? await prisma.account.findUnique({
        where: { id: site.accountId },
        select: { slug: true },
      })
    : null;
  const accountSlug = account?.slug || 'no-account';

  // Count how many audits for this site were created today (for seq number)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const auditCount = await prisma.siteAudit.count({
    where: {
      siteId,
      createdAt: { gte: today, lt: todayEnd },
    },
  });

  return buildAuditFolder(accountSlug, siteUrl, new Date(), auditCount || 1);
}

/**
 * Upload a full-page screenshot (desktop or mobile) for a specific page.
 *
 * @param {Buffer} buffer
 * @param {string} folder — from resolveAuditFolder()
 * @param {string} pageUrl — full URL of the page
 * @param {"desktop"|"mobile"} device
 * @returns {Promise<string>} — Cloudinary URL
 */
export async function uploadPageScreenshot(buffer, folder, pageUrl, device) {
  if (!buffer) return null;
  const slug = pageSlug(pageUrl);
  const publicId = `ss_${slug}_${device}`;
  return uploadBuffer(buffer, folder, publicId);
}

/**
 * Upload segmented screenshots (viewport-height segments) for a page.
 *
 * @param {Buffer[]} buffers
 * @param {string} folder
 * @param {string} pageUrl
 * @param {"desktop"|"mobile"} device
 * @returns {Promise<string[]>} — array of Cloudinary URLs
 */
export async function uploadSegmentedScreenshots(buffers, folder, pageUrl, device) {
  if (!buffers?.length) return [];
  const slug = pageSlug(pageUrl);
  return Promise.all(
    buffers.map((buf, i) =>
      uploadBuffer(buf, folder, `seg_${slug}_${device}_${i + 1}`)
    )
  );
}

/**
 * Upload filmstrip frames for a page.
 *
 * @param {Array<{stage: string, buffer: Buffer}>} frames
 * @param {string} folder
 * @param {string} pageUrl
 * @param {"desktop"|"mobile"} device
 * @returns {Promise<Array<{stage: string, url: string}>>}
 */
export async function uploadFilmstripFrames(frames, folder, pageUrl, device) {
  if (!frames?.length) return [];
  const slug = pageSlug(pageUrl);
  return Promise.all(
    frames.map(async (f) => ({
      stage: f.stage,
      url: await uploadBuffer(f.buffer, folder, `film_${slug}_${device}_${f.stage}`),
    }))
  );
}

/**
 * Upload an accessibility element screenshot.
 *
 * @param {Buffer} buffer — JPEG of the DOM element
 * @param {string} folder
 * @param {string} pageUrl
 * @param {number} nodeIndex — index of the node within the issue
 * @returns {Promise<string>} — Cloudinary URL
 */
export async function uploadElementScreenshot(buffer, folder, pageUrl, nodeIndex) {
  if (!buffer) return null;
  const slug = pageSlug(pageUrl);
  const publicId = `a11y_${slug}_${nodeIndex}`;
  return uploadBuffer(buffer, folder, publicId);
}
