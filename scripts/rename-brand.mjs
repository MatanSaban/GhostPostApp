// One-shot rename: "Ghost Post" -> "GhostSEO" (and Hebrew "גוסט פוסט" -> "GhostSEO")
// across gp-platform source files and database.
//
// URLs/emails/handles like "ghostseo.ai", "@ghostpost", "ghostpost_logo.png",
// "ghost-post-connector" use lowercase or hyphenated forms and don't match the
// "Ghost Post" pattern, so they're naturally preserved.
//
// Usage:
//   node scripts/rename-brand.mjs --dry-run    # preview only, no writes
//   node scripts/rename-brand.mjs              # actually apply

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

const REPLACEMENTS = [
  ['Ghost Post', 'GhostSEO'],
  ['גוסט פוסט', 'GhostSEO'],
];

function applyReplacements(input) {
  let out = input;
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      changed = true;
    }
  }
  return { out, changed };
}

// ---------- Source-code rewrite ----------

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.json', '.md', '.css', '.html', '.prisma']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', '.cache']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        yield path.join(dir, entry.name);
      }
    }
  }
}

function rewriteSource() {
  console.log(`\n=== Source files (${DRY_RUN ? 'DRY RUN' : 'WRITING'}) ===`);
  let touched = 0;
  let scanned = 0;
  for (const file of walk(REPO_ROOT)) {
    scanned++;
    if (file === __filename) continue; // don't rewrite this script itself
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // binary or unreadable
    }
    const { out, changed } = applyReplacements(content);
    if (!changed) continue;
    touched++;
    const rel = path.relative(REPO_ROOT, file);
    console.log(`  ${DRY_RUN ? '[would update]' : '[updated]'} ${rel}`);
    if (!DRY_RUN) fs.writeFileSync(file, out, 'utf8');
  }
  console.log(`Scanned ${scanned} files, ${DRY_RUN ? 'would touch' : 'touched'} ${touched}`);
}

// ---------- DB rewrite ----------

// Deep transform: walk any structure, replace strings.
function transform(value) {
  if (value == null) return { value, changed: false };
  if (typeof value === 'string') {
    const { out, changed } = applyReplacements(value);
    return { value: out, changed };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = transform(v);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }
  if (typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const k of Object.keys(value)) {
      const r = transform(value[k]);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

// Per-model field config. `json` are object/array fields walked deeply;
// `string` are plain string columns.
const MODELS = [
  { name: 'websiteSeo', json: ['siteName'], string: [] },
  { name: 'websiteLocale', json: ['content', 'seo', 'contentDraft', 'seoDraft'], string: [] },
  { name: 'websiteBlogPost', json: ['content', 'seo'], string: ['author', 'category'] },
  { name: 'websiteFaq', json: ['content'], string: ['category'] },
  { name: 'plan', json: ['features', 'limitations'], string: ['name', 'description'] },
  { name: 'planTranslation', json: ['features', 'limitations'], string: ['name', 'description'] },
  { name: 'addOn', json: [], string: ['name', 'description'] },
  { name: 'addOnTranslation', json: [], string: ['name', 'description'] },
  { name: 'coupon', json: [], string: ['description'] },
  { name: 'couponTranslation', json: [], string: ['description'] },
  { name: 'botAction', json: ['parameters', 'returns', 'example'], string: ['description'] },
  { name: 'interviewQuestion', json: ['inputConfig', 'validation', 'autoActions', 'showCondition'], string: ['aiPromptHint'] },
  { name: 'pushQuestion', json: ['options'], string: ['question', 'description'] },
  { name: 'pushQuestionTranslation', json: ['options'], string: ['question', 'description'] },
];

async function rewriteDb() {
  console.log(`\n=== Database (${DRY_RUN ? 'DRY RUN' : 'WRITING'}) ===`);
  const prisma = new PrismaClient();
  try {
    for (const { name, json, string } of MODELS) {
      const delegate = prisma[name];
      if (!delegate?.findMany) {
        console.log(`  [skip] ${name} (no Prisma delegate)`);
        continue;
      }
      let records;
      try {
        records = await delegate.findMany();
      } catch (err) {
        console.log(`  [skip] ${name} (${err.message})`);
        continue;
      }
      let touched = 0;
      for (const rec of records) {
        const data = {};
        let needs = false;
        for (const field of json) {
          if (rec[field] == null) continue;
          const r = transform(rec[field]);
          if (r.changed) { data[field] = r.value; needs = true; }
        }
        for (const field of string) {
          if (rec[field] == null) continue;
          const r = transform(rec[field]);
          if (r.changed) { data[field] = r.value; needs = true; }
        }
        if (!needs) continue;
        touched++;
        if (!DRY_RUN) {
          await delegate.update({ where: { id: rec.id }, data });
        }
      }
      console.log(`  ${name}: ${DRY_RUN ? 'would update' : 'updated'} ${touched}/${records.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// ---------- Main ----------

async function main() {
  console.log(`Brand rename: "Ghost Post" / "גוסט פוסט" -> "GhostSEO"`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}`);
  rewriteSource();
  await rewriteDb();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
