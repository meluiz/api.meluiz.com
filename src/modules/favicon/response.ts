import type { FaviconAsset } from './assets';

/* ///////////////////////////////////////////////// */

// Found icons are stable for a day; Google's fallback may be replaced by a real
// icon soon, so it is cached briefly
export const FRESH_CACHE =
  'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400';
export const FALLBACK_CACHE = 'public, max-age=1800, stale-if-error=86400';

// Third-party SVG is served from our origin, so it is sandboxed: no scripts, no
// external loads, only inline styles
export const SVG_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/* ///////////////////////////////////////////////// */

export const toImageResponse = (asset: FaviconAsset) => {
  const cacheControl = asset.source === 'google' ? FALLBACK_CACHE : FRESH_CACHE;

  const headers = new Headers({
    'Cache-Control': cacheControl,
    'Content-Length': String(asset.bytes.byteLength),
    'Content-Type': asset.contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Vercel-CDN-Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Favicon-Source': asset.source,
  });

  if (asset.contentType === 'image/svg+xml') {
    headers.set('Content-Security-Policy', SVG_CONTENT_SECURITY_POLICY);
  }

  return new Response(asset.bytes, { status: 200, headers });
};
