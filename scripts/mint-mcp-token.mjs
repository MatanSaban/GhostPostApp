/**
 * Mint an MCP token (gpmcp_*) for the /api/mcp/* surface.
 *
 * The plaintext token is printed ONCE and never stored — only its sha256 hash
 * (identical to lib/mcp/auth.js hashToken) lands in the McpToken row.
 *
 * Usage (from GhostPostApp/):
 *   node scripts/mint-mcp-token.mjs --account <accountId> [--scopes issues:read,fix:read] [--days 90] [--name "CI token"]
 *   node scripts/mint-mcp-token.mjs --site <siteId> [--scopes issues:read,fix:read] [--days 90] [--name "rdg-next"]
 *
 *   --account  Account-wide token (all sites in the account). Mutually
 *              exclusive with --site.
 *   --site     Site-bound token; accountId is derived from the site row.
 *   --scopes   Comma-separated, subset of lib/mcp/auth.js SCOPES.
 *              Default: the read scopes (issues:read,fix:read).
 *   --days     Expiry in days from now (default 90).
 *   --name     Human label stored on the row.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mirrors lib/mcp/auth.js SCOPES — that module imports '@/lib/prisma', which
// plain node can't resolve, so the list is duplicated here. Keep in sync.
const VALID_SCOPES = ['issues:read', 'fix:read', 'override:write', 'redirect:write'];
const DEFAULT_SCOPES = ['issues:read', 'fix:read'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    args[a.slice(2)] = next !== undefined && !next.startsWith('--') ? argv[++i] : true;
  }
  return args;
}

// sha256, identical to lib/mcp/auth.js hashToken().
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  console.error('Usage: node scripts/mint-mcp-token.mjs (--account <accountId> | --site <siteId>) [--scopes a,b,c] [--days 90] [--name <label>]');
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!!args.account === !!args.site) {
    fail('Pass exactly one of --account <accountId> or --site <siteId>.');
  }

  const scopes = args.scopes
    ? String(args.scopes).split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  if (scopes.length === 0) fail('At least one scope is required.');
  const invalid = scopes.filter((s) => !VALID_SCOPES.includes(s));
  if (invalid.length) fail(`Unknown scope(s): ${invalid.join(', ')}. Valid: ${VALID_SCOPES.join(', ')}`);

  const days = args.days === undefined ? 90 : Number(args.days);
  if (!Number.isInteger(days) || days < 1) fail('--days must be a positive integer.');

  let accountId = args.account ? String(args.account) : null;
  let siteId = null;
  if (args.site) {
    const site = await prisma.site.findUnique({
      where: { id: String(args.site) },
      select: { id: true, accountId: true, name: true, url: true },
    });
    if (!site) fail(`Site not found: ${args.site}`);
    siteId = site.id;
    accountId = site.accountId;
    console.log(`Site: ${site.name} (${site.url})`);
  } else {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true },
    });
    if (!account) fail(`Account not found: ${accountId}`);
    console.log(`Account: ${account.name}`);
  }

  const token = `gpmcp_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const rec = await prisma.mcpToken.create({
    data: {
      accountId,
      siteId,
      label: args.name ? String(args.name) : null,
      prefix: `${token.slice(0, 10)}…`,
      tokenHash: hashToken(token),
      scopes,
      expiresAt,
    },
  });

  console.log('');
  console.log('MCP token minted:');
  console.log(`  id:        ${rec.id}`);
  console.log(`  label:     ${rec.label || '(none)'}`);
  console.log(`  bound to:  ${siteId ? `site ${siteId}` : `account ${accountId} (all sites)`}`);
  console.log(`  scopes:    ${scopes.join(', ')}`);
  console.log(`  expiresAt: ${expiresAt.toISOString()}`);
  console.log('');
  console.log('  Token — SHOWN ONCE, store it now (only the sha256 hash is saved):');
  console.log(`  ${token}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
