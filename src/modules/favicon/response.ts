import type { FaviconAsset } from './assets';

import { FALLBACK_ASSET } from './fallback';
import { encodeAssetHash } from './hash';

/* ///////////////////////////////////////////////// */

// Found icons are stable for a day; Google's fallback may be replaced by a real
// icon soon, so it is cached briefly
export const FRESH_CACHE =
  'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400';
export const FALLBACK_CACHE = 'public, max-age=1800, stale-if-error=86400';
// The placeholder says nothing about the site, so it is retried soon
export const PLACEHOLDER_CACHE = 'public, max-age=300';

// Third-party SVG is served from our origin, so it is sandboxed: no scripts, no
// external loads, only inline styles
export const SVG_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/* ///////////////////////////////////////////////// */

/** An icon, with the hash a caller can use to address it again. */
export const toImageResponse = (asset: FaviconAsset, url: string) => {
  const cacheControl = asset.source === 'google' ? FALLBACK_CACHE : FRESH_CACHE;

  const headers = new Headers({
    'Cache-Control': cacheControl,
    'Content-Length': String(asset.bytes.byteLength),
    'Content-Type': asset.contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Vercel-CDN-Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Favicon-Source': asset.source,
    'X-Favicon-Hash': encodeAssetHash(url),
  });

  if (asset.contentType === 'image/svg+xml') {
    headers.set('Content-Security-Policy', SVG_CONTENT_SECURITY_POLICY);
  }

  return new Response(asset.bytes, { status: 200, headers });
};

/**
 * The placeholder icon, for when no favicon could be found. It answers 404 with
 * an image body, as Google's favicon service does: the status still says the
 * site's icon is missing, and an `<img>` has something to render regardless.
 */
export const toImageFallbackResponse = () => {
  const headers = new Headers({
    'Cache-Control': PLACEHOLDER_CACHE,
    'Content-Length': String(FALLBACK_ASSET.bytes.byteLength),
    'Content-Type': FALLBACK_ASSET.contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Vercel-CDN-Cache-Control': PLACEHOLDER_CACHE,
    'X-Content-Type-Options': 'nosniff',
    'X-Favicon-Source': 'fallback',
  });

  return new Response(FALLBACK_ASSET.bytes, { status: 404, headers });
};
