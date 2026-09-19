import type { FaviconAsset } from './assets';

import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

// Icons behind /assets are embedded in pages, so they have one fixed size
export const ASSET_SIZE = 64;

// Found icons are stable for a day; Google's fallback may be replaced by a real
// icon soon, so it is cached briefly
export const FRESH_CACHE =
  'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400';
export const FALLBACK_CACHE = 'public, max-age=1800, stale-if-error=86400';

// Third-party SVG is served from our origin, so it is sandboxed: no scripts, no
// external loads, only inline styles
export const SVG_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export const BINARY = { schema: { type: 'string' as const, format: 'binary' } };

export const IMAGE_RESPONSE = {
  description: 'The favicon: PNG resized to fit the requested size, or the original SVG or ICO',
  headers: {
    'X-Favicon-Source': {
      description: 'Where the icon came from: html, manifest, conventional or google',
      schema: { type: 'string' as const, enum: ['html', 'manifest', 'conventional', 'google'] },
    },
  },
  content: {
    'image/png': BINARY,
    'image/svg+xml': BINARY,
    'image/x-icon': BINARY,
  },
};

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

/** Site URL from an asset hash; `undefined` when it does not decode to a valid URL. */
export const decodeAssetHash = (hash: string) => {
  const encoded = hash.split('.')[0];

  if (!encoded) {
    return undefined;
  }

  const result = UrlSchema.safeParse(Buffer.from(encoded, 'base64url').toString());

  return result.success ? result.data : undefined;
};

/* ///////////////////////////////////////////////// */

export type { AssetOptions, FaviconAsset, FaviconContentType } from './assets';

export { loadCandidate, loadManifestCandidates } from './assets';
export { conventionalCandidates, GOOGLE_FAVICON_SIZE, googleCandidate } from './candidates';
