/**
 * GET /api/public/contract-key
 *
 * Publishes the current Ed25519 PUBLIC signing key (+ keyId) so the
 * @ghostseo/seo SDK and edge proxy can verify signed Contract payloads. The
 * private key never leaves the server. Consumers should pin a set of trusted
 * keyIds and rotate by adding a new key before the server starts signing with
 * it (the keyId is embedded in every signed payload).
 */
import { NextResponse } from 'next/server';
import { getPublicKeyInfo } from '@/lib/contract/signing';

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}

export function GET() {
  const info = getPublicKeyInfo();
  return NextResponse.json(
    {
      alg: info.alg,
      keyId: info.keyId,
      publicKey: info.publicKeyPem,
      ephemeral: info.ephemeral,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
