/**
 * Shopify media manager
 *
 * Bridges Shopify's Files API (staged upload → fileCreate) to the WP-flavored
 * media shape the platform expects (id, source_url, mime_type, title, alt_text,
 * media_type, date, modified).
 *
 * Supported Shopify File subtypes: MediaImage, GenericFile, Video, Model3d.
 * Only MediaImage is returned as media_type:'image'; others map to 'file'.
 */

import { shopifyGraphQL, shopifyRest } from '../client';
import { gidNumericId, toGid } from '../gid';

const LIST_FILES = `
  query ListFiles($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges { cursor node {
        id alt createdAt updatedAt fileStatus
        ... on MediaImage {
          image { url width height altText }
          mimeType
        }
        ... on GenericFile { url mimeType originalFileSize }
        ... on Video {
          sources { url format mimeType height width }
          originalSource { url }
        }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const GET_FILE = `
  query GetFile($id: ID!) {
    node(id: $id) {
      id
      ... on MediaImage {
        alt createdAt updatedAt fileStatus mimeType
        image { url width height altText }
      }
      ... on GenericFile {
        alt createdAt updatedAt fileStatus url mimeType originalFileSize
      }
      ... on Video {
        alt createdAt updatedAt fileStatus
        sources { url format mimeType height width }
        originalSource { url }
      }
    }
  }
`;

const FILE_CREATE = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id alt createdAt fileStatus
        ... on MediaImage { image { url width height } mimeType }
        ... on GenericFile { url mimeType }
      }
      userErrors { field message code }
    }
  }
`;

const FILE_UPDATE = `
  mutation FileUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id alt }
      userErrors { field message code }
    }
  }
`;

const FILE_DELETE = `
  mutation FileDelete($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors { field message code }
    }
  }
`;

const STAGED_UPLOADS_CREATE = `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

function mapFileNode(node) {
  if (!node) return null;
  const image = node.image;
  const isImage = !!image || (node.mimeType || '').startsWith('image/');
  const url =
    image?.url ||
    node.url ||
    node.originalSource?.url ||
    node.sources?.[0]?.url ||
    null;

  return {
    id: gidNumericId(node.id),
    gid: node.id,
    source_url: url,
    sourceUrl: url,
    url,
    title: node.alt || null,
    alt_text: node.alt || image?.altText || null,
    altText: node.alt || image?.altText || null,
    caption: null,
    description: null,
    mime_type: node.mimeType || null,
    mimeType: node.mimeType || null,
    media_type: isImage ? 'image' : 'file',
    width: image?.width || null,
    height: image?.height || null,
    file_size: node.originalFileSize || null,
    date: node.createdAt,
    date_gmt: node.createdAt,
    modified: node.updatedAt,
    status: (node.fileStatus || '').toLowerCase() === 'ready' ? 'inherit' : 'pending',
  };
}

export async function getMedia(site, page = 1, perPage = 50, search = null) {
  const first = Math.min(perPage, 100);
  let after = null;
  let currentPage = 0;
  const q = search ? search : null;

  while (currentPage < page) {
    const data = await shopifyGraphQL(site, LIST_FILES, { first, after, query: q });
    currentPage += 1;
    const { edges, pageInfo } = data.files;
    if (currentPage === page) {
      const items = edges.map((e) => mapFileNode(e.node)).filter(Boolean);
      const hasNext = !!pageInfo?.hasNextPage;
      return {
        items,
        total: hasNext ? currentPage * perPage + 1 : currentPage * perPage,
        pages: hasNext ? currentPage + 1 : currentPage,
        page: currentPage,
        _cursor: pageInfo?.endCursor || null,
      };
    }
    if (!pageInfo.hasNextPage) return { items: [], total: 0, pages: currentPage, page };
    after = pageInfo.endCursor;
  }
  return { items: [], total: 0, pages: 0, page };
}

export async function getMediaItem(site, mediaId) {
  const rawId = String(mediaId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('MediaImage', rawId);
  const data = await shopifyGraphQL(site, GET_FILE, { id });
  return mapFileNode(data.node);
}

function guessMimeFromFilename(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
  };
  return map[ext] || null;
}

/**
 * Upload from a public URL — Shopify fetches it directly.
 * Signature: (site, url, options) — aligned with the WordPress adapter so the
 * platform-agnostic `cms.*` dispatcher can call either the same way.
 */
export async function uploadMediaFromUrl(site, url, options = {}) {
  const { filename, alt, title, contentType } = options;
  const altText = alt ?? title ?? null;
  const input = {
    alt: altText,
    contentType: (contentType || '').toUpperCase().includes('IMAGE') || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url)
      ? 'IMAGE'
      : 'FILE',
    originalSource: url,
  };
  const data = await shopifyGraphQL(site, FILE_CREATE, { files: [input] });
  const errors = data.fileCreate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] fileCreate: ${errors.map((e) => e.message).join('; ')}`);
  const node = data.fileCreate?.files?.[0];
  return { ...mapFileNode(node), filename: filename || null };
}

/**
 * Upload from a base64 payload (with or without the `data:...;base64,` prefix).
 * Signature: (site, base64, filename, options) — aligned with the WordPress adapter.
 */
export async function uploadMediaFromBase64(site, base64, filename, options = {}) {
  const { alt, title, mimeType: providedMime } = options;
  const prefixMatch = typeof base64 === 'string' ? base64.match(/^data:([^;]+);base64,/) : null;
  const mimeType =
    providedMime ||
    prefixMatch?.[1] ||
    guessMimeFromFilename(filename) ||
    'application/octet-stream';
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  return uploadMediaFromBuffer(site, { buffer, filename, mimeType, alt: alt ?? title ?? null });
}

/**
 * Upload from an in-memory Buffer — two-step:
 *   1) stagedUploadsCreate → returns a signed Google Cloud Storage URL + form fields
 *   2) POST the bytes there
 *   3) fileCreate referencing the resourceUrl
 */
export async function uploadMediaFromBuffer(site, { buffer, filename, mimeType, alt }) {
  if (!buffer || !buffer.length) throw new Error('[shopify] upload: empty buffer');
  if (!filename) throw new Error('[shopify] upload: filename required');
  if (!mimeType) throw new Error('[shopify] upload: mimeType required');

  const stageData = await shopifyGraphQL(site, STAGED_UPLOADS_CREATE, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: 'POST',
        resource: mimeType.startsWith('image/') ? 'IMAGE' : 'FILE',
        fileSize: String(buffer.length),
      },
    ],
  });
  const stageErrors = stageData.stagedUploadsCreate?.userErrors || [];
  if (stageErrors.length) {
    throw new Error(`[shopify] stagedUploadsCreate: ${stageErrors.map((e) => e.message).join('; ')}`);
  }
  const target = stageData.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('[shopify] stagedUploadsCreate: no target returned');

  // Upload bytes via multipart/form-data to the staged URL.
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  const uploadRes = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`[shopify] staged upload failed: ${uploadRes.status} ${body}`);
  }

  const createData = await shopifyGraphQL(site, FILE_CREATE, {
    files: [
      {
        alt: alt || null,
        contentType: mimeType.startsWith('image/') ? 'IMAGE' : 'FILE',
        originalSource: target.resourceUrl,
      },
    ],
  });
  const errors = createData.fileCreate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] fileCreate: ${errors.map((e) => e.message).join('; ')}`);
  const node = createData.fileCreate?.files?.[0];
  return { ...mapFileNode(node), filename };
}

export async function updateMedia(site, mediaId, { alt, title }) {
  const rawId = String(mediaId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('MediaImage', rawId);
  const data = await shopifyGraphQL(site, FILE_UPDATE, {
    files: [{ id, alt: alt ?? title ?? null }],
  });
  const errors = data.fileUpdate?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] fileUpdate: ${errors.map((e) => e.message).join('; ')}`);
  return getMediaItem(site, id);
}

export async function deleteMedia(site, mediaId) {
  const rawId = String(mediaId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('MediaImage', rawId);
  const data = await shopifyGraphQL(site, FILE_DELETE, { fileIds: [id] });
  const errors = data.fileDelete?.userErrors || [];
  if (errors.length) throw new Error(`[shopify] fileDelete: ${errors.map((e) => e.message).join('; ')}`);
  return { deleted: data.fileDelete?.deletedFileIds || [] };
}

/** Resolve a list of filenames to CDN URLs — files search by filename substring. */
export async function resolveMediaUrls(site, names = []) {
  const out = {};
  for (const name of names) {
    const data = await shopifyGraphQL(site, LIST_FILES, {
      first: 5,
      after: null,
      query: `filename:${name}`,
    });
    const node = data.files?.edges?.[0]?.node;
    out[name] = mapFileNode(node)?.source_url || null;
  }
  return out;
}

// Satisfy the shopifyRest import so bundlers don't tree-shake the REST helper
// out of the adapter bundle (used by webhook/diag paths elsewhere).
void shopifyRest;
