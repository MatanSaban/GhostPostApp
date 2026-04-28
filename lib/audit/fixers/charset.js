/**
 * Charset Meta Fix Handler
 *
 * Issue handled: audit.issues.noCharset
 *
 * Theme template change - there's no plugin endpoint that injects a charset
 * declaration into <head>. Returns a snippet; apply is a no-op.
 *
 * Why it matters: without an explicit charset the browser guesses, which
 * historically opened a UTF-7 XSS vector and still produces gibberish for
 * non-ASCII content if the guess is wrong.
 */

import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';

export async function preview({ payload: _payload = {}, wpAuto: _wpAuto }) {
  return {
    manualOutputs: [snippetOutput({
      title: 'Declare a UTF-8 charset',
      why: 'Without an explicit charset declaration, browsers fall back to guessing the encoding - which both garbles non-ASCII characters and historically opened an XSS attack vector. UTF-8 is the universal default.',
      instructions: 'Add this as the **very first** child of `<head>` (it must appear within the first 1024 bytes of the document for the browser to honor it). In WordPress, edit `header.php`. In a static-site generator, edit your base layout / template.',
      language: 'html',
      code: '<meta charset="UTF-8">',
      where: 'first line inside <head>',
    })],
    usage: null,
  };
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Charset declaration is a theme template change - paste the snippet at the top of <head>.',
    })),
    auditUpdated: false,
  };
}
