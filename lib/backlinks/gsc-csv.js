/**
 * Parser for Google Search Console CSV exports of the Links report.
 *
 * GSC offers several link CSVs but only ONE has per-link granularity that's
 * useful for our audit model:
 *
 *   - "Latest links" (header: "Source page,Last crawled") — supported
 *
 * The aggregate exports ("Top linking sites", "Top linked pages", "Top
 * linking text") are rejected with a guiding error: they don't map cleanly
 * to per-row Backlink records, and the user should re-export from the
 * "Latest links" view instead.
 *
 * Parsing is RFC 4180-ish: handles quoted fields, escaped quotes ("\""),
 * CRLF or LF line endings, and a UTF-8 BOM at the start of the file.
 */

const LATEST_LINKS_HEADERS = ['source page', 'last crawled'];
const TOP_LINKING_SITES_HEADERS = ['site', 'incoming links'];
const TOP_LINKED_PAGES_HEADERS = ['top linked pages', 'incoming links'];
const TOP_LINKING_TEXT_HEADERS = ['anchor', 'incoming links'];

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// Minimal CSV row parser: stateful, quote-aware, comma-delimited. Accepts
// an arbitrary first character but expects standard double-quote escaping.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') {
      // swallow — \n on the next iteration will close the row
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  // flush last row if no trailing newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function detectFormat(headerRow) {
  const lowered = headerRow.map(h => (h || '').trim().toLowerCase());
  const matches = (target) => target.every(t => lowered.includes(t));
  if (matches(LATEST_LINKS_HEADERS)) return 'LATEST_LINKS';
  if (matches(TOP_LINKING_SITES_HEADERS)) return 'TOP_LINKING_SITES';
  if (matches(TOP_LINKED_PAGES_HEADERS)) return 'TOP_LINKED_PAGES';
  if (matches(TOP_LINKING_TEXT_HEADERS)) return 'TOP_LINKING_TEXT';
  return 'UNKNOWN';
}

function rootDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

function toDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a GSC CSV export and return normalized rows. Throws on unsupported
 * format so the API layer can surface a clear error message.
 *
 * Output items match the shape `applyBacklinkSync` expects, with empty
 * targetUrl since GSC's "Latest links" export does not include the target
 * page on the user's site.
 */
export function parseGscBacklinksCsv(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or invalid CSV file');
  }

  const text = stripBom(rawText);
  const rows = parseCsv(text);
  if (rows.length < 1) {
    throw new Error('CSV is empty');
  }

  const format = detectFormat(rows[0]);

  if (format !== 'LATEST_LINKS') {
    const known = format !== 'UNKNOWN' ? ` (detected: ${format})` : '';
    throw new Error(
      `Only the GSC "Latest links" export is supported${known}. ` +
      `Re-export from the External links → Top linking sites/pages → "More" → "Latest links" view.`
    );
  }

  const lowerHeader = rows[0].map(h => (h || '').trim().toLowerCase());
  const sourceIdx = lowerHeader.indexOf('source page');
  const lastCrawledIdx = lowerHeader.indexOf('last crawled');

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const referringUrl = (row[sourceIdx] || '').trim();
    if (!referringUrl) continue;
    if (!/^https?:\/\//i.test(referringUrl)) continue;

    const lastSeen = lastCrawledIdx >= 0 ? toDate(row[lastCrawledIdx]) : null;
    items.push({
      referringUrl,
      referringDomain: rootDomain(referringUrl) || '',
      // GSC export doesn't disclose the specific target on the user's site;
      // empty-string sentinel marks this as a "shadow" row that DataForSEO
      // can later graduate to a fully-specified row when it observes (S, T).
      targetUrl: '',
      anchorText: null,
      isDofollow: null,
      domainRating: null,
      spamScore: null,
      firstSeen: lastSeen || new Date(),
      lastSeen: lastSeen || new Date(),
    });
  }

  return { format, items };
}

export const __testables = { parseCsv, detectFormat, stripBom };
