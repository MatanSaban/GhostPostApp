// Probe website tables for any image/asset path references (OG, favicon, logo).
// Read-only: prints unique URLs/paths that look like image assets.

import { PrismaClient } from '@prisma/client';

const URL_RE = /(https?:\/\/[^\s"'<>)]+|\/[^\s"'<>)]+\.(?:png|jpg|jpeg|gif|svg|webp|ico))/gi;
const KEYS = new Set([
  'ogImage', 'favicon', 'icon', 'logo', 'image', 'images',
  'defaultOgImage', 'twitterImage', 'featuredImage'
]);

const findings = new Map();

function record(model, id, path, key, value) {
  if (typeof value !== 'string') return;
  const matches = value.match(URL_RE);
  if (!matches) return;
  for (const m of matches) {
    if (!findings.has(m)) findings.set(m, []);
    findings.get(m).push({ model, id, path: `${path}.${key}` });
  }
}

function walk(value, model, id, currentPath) {
  if (value == null) return;
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, model, id, `${currentPath}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (typeof v === 'string') {
        // Always check string values for image URLs, but also flag specific keys explicitly.
        record(model, id, currentPath, k, v);
      } else {
        walk(v, model, id, currentPath ? `${currentPath}.${k}` : k);
      }
    }
  }
}

const MODELS = [
  { name: 'websiteSeo', json: ['siteName'], string: ['siteUrl', 'defaultOgImage', 'twitterHandle'] },
  { name: 'websiteLocale', json: ['content', 'seo', 'contentDraft', 'seoDraft'], string: [] },
  { name: 'websiteBlogPost', json: ['content', 'seo'], string: ['featuredImage'] },
  { name: 'websiteFaq', json: ['content'], string: [] },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const { name, json, string } of MODELS) {
      const records = await prisma[name].findMany();
      for (const rec of records) {
        for (const f of json) walk(rec[f], name, rec.id, f);
        for (const f of string) record(name, rec.id, '', f, rec[f]);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n=== Unique asset/URL references in gp-ws website tables ===\n');
  const sorted = [...findings.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [url, refs] of sorted) {
    console.log(`${url}`);
    const seen = new Set();
    for (const r of refs) {
      const k = `${r.model}:${r.path}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`    ${r.model} -> ${r.path}`);
    }
  }
  console.log(`\nTotal unique URLs: ${sorted.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
