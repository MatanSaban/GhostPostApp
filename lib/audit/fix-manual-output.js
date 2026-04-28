/**
 * Manual Fix Output Schema
 *
 * What an AI fixer returns when the site can't auto-apply (no plugin, or
 * not WordPress, or Shopify, etc.). The frontend's PreviewModal renders
 * each kind into the right UI:
 *   snippet  → code block + copy button
 *   image    → <img> + download button
 *   value    → plain text + copy button
 *   file     → download link with suggested filename
 *   redirect → from/to URL pair
 *   dnsRecord → DNS record fields
 *   htaccess / nginx → server-config code block
 *   wpAdminStep → step list with screenshots/links
 *   instructions → markdown steps only
 *   composite → array of any of the above
 *
 * Every kind shares an envelope so the modal renders titles + intro consistently.
 *
 * This module exports:
 *   - the canonical Zod schema (so AI generations validate against it)
 *   - constructor helpers per-kind (so handler code reads cleanly)
 *
 * Adding a new kind: add it here + extend the modal renderer. Existing
 * outputs keep working because each kind is independently typed.
 */

import { z } from 'zod';

// ─── Envelope (shared by every kind) ─────────────────────────────────

const envelope = {
  title: z.string().describe('Short headline shown above the output'),
  why: z.string().optional().describe('One-line explanation of why this fixes the issue'),
  instructions: z.string().describe('Markdown steps explaining where/how to apply'),
};

// ─── Per-kind data shapes ────────────────────────────────────────────

const snippetData = z.object({
  language: z.enum([
    'html', 'css', 'js', 'php', 'json', 'jsonld', 'xml',
    'apache', 'nginx', 'sh', 'text',
  ]).describe('Syntax highlighting language'),
  code: z.string().describe('The code snippet to copy'),
  where: z.string().optional().describe('Where to paste (e.g. "inside <head>", "in functions.php")'),
});

const imageData = z.object({
  url: z.string().describe('Public URL of the generated image'),
  filename: z.string().optional().describe('Suggested filename for download'),
  width: z.number().optional(),
  height: z.number().optional(),
  altText: z.string().optional(),
});

const valueData = z.object({
  value: z.string().describe('The plain-text value to copy (e.g. a meta title)'),
  field: z.string().optional().describe('What field this is for (e.g. "Meta title", "Alt text")'),
  charLimit: z.number().optional().describe('Recommended max length, if any'),
});

const fileData = z.object({
  filename: z.string(),
  contentType: z.string().optional(),
  // Either embedded content or URL - handlers pick one.
  content: z.string().optional().describe('Inline content (text files only)'),
  url: z.string().optional().describe('URL to download larger files from'),
}).refine((d) => d.content || d.url, {
  message: 'file output must include either inline content or a URL',
});

const redirectData = z.object({
  from: z.string(),
  to: z.string(),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(301),
});

const dnsRecordData = z.object({
  type: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA']),
  name: z.string().describe('Record name / hostname (use "@" for root)'),
  value: z.string(),
  ttl: z.number().optional(),
  priority: z.number().optional().describe('Required for MX records'),
});

const wpAdminStepData = z.object({
  steps: z.array(z.object({
    text: z.string().describe('Action to take, e.g. "Click Settings → Reading"'),
    note: z.string().optional(),
  })),
});

const instructionsData = z.object({
  // Envelope already has the markdown - `data` is empty/optional for this kind.
});

// Composite must come last (references other kinds). Defined below.

// ─── Tagged union ────────────────────────────────────────────────────

const baseUnion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('snippet'),     ...envelope, data: snippetData }),
  z.object({ kind: z.literal('image'),       ...envelope, data: imageData }),
  z.object({ kind: z.literal('value'),       ...envelope, data: valueData }),
  z.object({ kind: z.literal('file'),        ...envelope, data: fileData }),
  z.object({ kind: z.literal('redirect'),    ...envelope, data: redirectData }),
  z.object({ kind: z.literal('dnsRecord'),   ...envelope, data: dnsRecordData }),
  z.object({ kind: z.literal('htaccess'),    ...envelope, data: snippetData }),
  z.object({ kind: z.literal('nginx'),       ...envelope, data: snippetData }),
  z.object({ kind: z.literal('wpAdminStep'), ...envelope, data: wpAdminStepData }),
  z.object({ kind: z.literal('instructions'),...envelope, data: instructionsData.optional() }),
]);

const compositeData = z.object({
  parts: z.array(baseUnion).describe('Ordered list of sub-outputs to render'),
});

export const ManualOutputSchema = z.union([
  baseUnion,
  z.object({ kind: z.literal('composite'), ...envelope, data: compositeData }),
]);

// ─── Constructor helpers (handler-side ergonomics) ───────────────────

export function snippet({ title, why, instructions, language, code, where }) {
  return { kind: 'snippet', title, why, instructions, data: { language, code, where } };
}

export function image({ title, why, instructions, url, filename, width, height, altText }) {
  return { kind: 'image', title, why, instructions, data: { url, filename, width, height, altText } };
}

export function value({ title, why, instructions, value: v, field, charLimit }) {
  return { kind: 'value', title, why, instructions, data: { value: v, field, charLimit } };
}

export function file({ title, why, instructions, filename, contentType, content, url }) {
  return { kind: 'file', title, why, instructions, data: { filename, contentType, content, url } };
}

export function redirect({ title, why, instructions, from, to, statusCode = 301 }) {
  return { kind: 'redirect', title, why, instructions, data: { from, to, statusCode } };
}

export function dnsRecord({ title, why, instructions, type, name, value: v, ttl, priority }) {
  return { kind: 'dnsRecord', title, why, instructions, data: { type, name, value: v, ttl, priority } };
}

export function htaccess({ title, why, instructions, code, where }) {
  return { kind: 'htaccess', title, why, instructions, data: { language: 'apache', code, where } };
}

export function nginx({ title, why, instructions, code, where }) {
  return { kind: 'nginx', title, why, instructions, data: { language: 'nginx', code, where } };
}

export function wpAdminStep({ title, why, instructions, steps }) {
  return { kind: 'wpAdminStep', title, why, instructions, data: { steps } };
}

export function instructions({ title, why, instructions: md }) {
  return { kind: 'instructions', title, why, instructions: md };
}

export function composite({ title, why, instructions: md, parts }) {
  return { kind: 'composite', title, why, instructions: md, data: { parts } };
}
