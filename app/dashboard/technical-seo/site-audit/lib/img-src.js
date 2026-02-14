/**
 * Convert a screenshot value to an <img> src.
 *
 * New audits store Cloudinary URLs (https://…).
 * Old audits store raw base64 strings.
 * This helper handles both transparently.
 *
 * @param {string|null|undefined} val — Cloudinary URL or base64 string
 * @returns {string|null}
 */
export function toImgSrc(val) {
  if (!val) return null;
  if (val.startsWith('http')) return val;
  return `data:image/jpeg;base64,${val}`;
}

/**
 * Convert a filmstrip frame to an <img> src.
 *
 * New format: { stage, url }     (Cloudinary)
 * Old format: { stage, base64 }  (inline)
 *
 * @param {{ url?: string, base64?: string }} frame
 * @returns {string|null}
 */
export function filmSrc(frame) {
  if (!frame) return null;
  if (frame.url) return frame.url;
  if (frame.base64) return `data:image/jpeg;base64,${frame.base64}`;
  return null;
}
