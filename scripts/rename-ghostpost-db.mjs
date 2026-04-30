// One-shot: rewrite remaining "ghostpost" variants in gp-ws CMS tables.
// Targets only the four website tables that gp-ws reads from.
//
// Replacements (applied in order; each prior pass narrows the next):
//   1. ghostpost.co.il   -> ghostseo.ai
//   2. ghostpost.ai      -> ghostseo.ai
//   3. @ghostpost        -> @ghostseo
//   4. ghostpost_logo    -> ghostseo_logo
//   5. Ghost Post        -> GhostSEO
//   6. גוסט פוסט         -> GhostSEO
//   7. GhostPost         -> GhostSEO
//   8. ghostpost         -> ghostseo
//
// Usage:
//   node rename-ghostpost-db.mjs            # DRY RUN (default)
//   node rename-ghostpost-db.mjs --apply    # actually write

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

const REPLACEMENTS = [
  ['ghostpost.co.il', 'ghostseo.ai'],
  ['ghostpost.ai', 'ghostseo.ai'],
  ['@ghostpost', '@ghostseo'],
  ['ghostpost_logo', 'ghostseo_logo'],
  ['Ghost Post', 'GhostSEO'],
  ['גוסט פוסט', 'GhostSEO'],
  ['GhostPost', 'GhostSEO'],
  ['ghostpost', 'ghostseo'],
];

function applyReplacements(input) {
  let out = input;
  let changed = false;
  const hits = [];
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) {
      const count = out.split(from).length - 1;
      hits.push({ from, to, count });
      out = out.split(from).join(to);
      changed = true;
    }
  }
  return { out, changed, hits };
}

function transform(value, pathStr, hitsLog) {
  if (value == null) return { value, changed: false };
  if (typeof value === 'string') {
    const r = applyReplacements(value);
    if (r.changed) {
      for (const h of r.hits) {
        hitsLog.push({ path: pathStr, ...h, sample: value.length > 120 ? value.slice(0, 120) + '...' : value });
      }
    }
    return { value: r.out, changed: r.changed };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v, i) => {
      const r = transform(v, `${pathStr}[${i}]`, hitsLog);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }
  if (typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const k of Object.keys(value)) {
      const r = transform(value[k], pathStr ? `${pathStr}.${k}` : k, hitsLog);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

const MODELS = [
  { name: 'websiteSeo', json: ['siteName'], string: ['siteUrl', 'defaultOgImage', 'twitterHandle', 'defaultRobots'] },
  { name: 'websiteLocale', json: ['content', 'seo', 'contentDraft', 'seoDraft'], string: [] },
  { name: 'websiteBlogPost', json: ['content', 'seo'], string: ['author', 'category', 'featuredImage'] },
  { name: 'websiteFaq', json: ['content'], string: ['category'] },
];

async function main() {
  console.log(`\n=== gp-ws DB brand rewrite (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  const prisma = new PrismaClient();
  let totalRows = 0;
  let totalUpdates = 0;
  const allHits = [];

  try {
    for (const { name, json, string } of MODELS) {
      const delegate = prisma[name];
      if (!delegate?.findMany) {
        console.log(`  [skip] ${name} (no Prisma delegate)`);
        continue;
      }
      const records = await delegate.findMany();
      let touched = 0;
      for (const rec of records) {
        const data = {};
        let needs = false;
        const localHits = [];
        for (const field of json) {
          if (rec[field] == null) continue;
          const r = transform(rec[field], field, localHits);
          if (r.changed) { data[field] = r.value; needs = true; }
        }
        for (const field of string) {
          if (rec[field] == null) continue;
          const r = transform(rec[field], field, localHits);
          if (r.changed) { data[field] = r.value; needs = true; }
        }
        if (!needs) continue;
        touched++;
        for (const h of localHits) allHits.push({ model: name, id: rec.id, ...h });
        if (APPLY) {
          await delegate.update({ where: { id: rec.id }, data });
        }
      }
      totalRows += records.length;
      totalUpdates += touched;
      console.log(`  ${name}: ${APPLY ? 'updated' : 'would update'} ${touched}/${records.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  // Summary of replacements
  if (allHits.length > 0) {
    console.log(`\n--- Replacement summary ---`);
    const counts = {};
    for (const h of allHits) {
      const k = `${h.from} -> ${h.to}`;
      counts[k] = (counts[k] || 0) + h.count;
    }
    for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n} occurrence(s)`);
    }

    console.log(`\n--- First 20 hit paths ---`);
    for (const h of allHits.slice(0, 20)) {
      console.log(`  [${h.model}/${h.id}] ${h.path}: "${h.from}" x${h.count}`);
    }
    if (allHits.length > 20) console.log(`  ...and ${allHits.length - 20} more`);
  } else {
    console.log(`\nNo occurrences of any ghostpost variant found in website tables.`);
  }

  console.log(`\nTotals: scanned ${totalRows} rows across ${MODELS.length} models, ${APPLY ? 'updated' : 'would update'} ${totalUpdates}.`);
  console.log(APPLY ? '\nDONE (writes applied).' : '\nDONE (no writes — pass --apply to execute).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
