import { BadGatewayError, ServerError } from '#util/errors';

import {
  candidatesFromManifest,
  extractFaviconCandidates,
  extractManifestUrl,
  type IconCandidate,
  rankCandidates,
} from './extractors';
import { type FetchDocumentOptions, fetchDocument } from './service';
import { assertSafeRemoteUrl } from './url-policy';

const REQUEST_TIMEOUT = 4_000;
const MAX_FAVICON_BYTES = 1_000_000;
const GOOGLE_FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';

// s2 caches by size and serves stale icons; a larger, colder size dodges the
// hottest cache buckets. Only the last-resort fallback, so rarely reached.
const UPSTREAM_SIZE = 128;

// Raster subtypes Bun.Image can decode and resize. SVG and ICO are handled
// separately (served as-is / skipped), so they are intentionally absent.
const RESIZABLE_SUBTYPES = new Set(['png', 'jpeg', 'webp', 'gif', 'bmp']);

const SERVE_AS_IS_SUBTYPES = new Set(['svg+xml', 'x-icon', 'vnd.microsoft.icon']);

export type FaviconFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFaviconOptions {
  fetcher?: FaviconFetcher;
  signal?: AbortSignal;
  timeout?: number;
  documentOptions?: FetchDocumentOptions;
}

/* ///////////////////////////////////////////////// */

const buildGoogleFaviconUrl = (url: string) => {
  const endpoint = new URL(GOOGLE_FAVICON_ENDPOINT);
  const siteOrigin = new URL('/', url).toString();

  endpoint.searchParams.set('domain_url', siteOrigin);
  endpoint.searchParams.set('sz', String(UPSTREAM_SIZE));

  return endpoint.toString();
};

const subtypeOf = (contentType: string | null) => {
  return contentType?.split(';')[0]?.trim().toLowerCase().split('/')[1];
};

const readBytes = async (response: Response) => {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_FAVICON_BYTES) {
    throw new BadGatewayError('The favicon response is too large');
  }

  if (!response.body) {
    throw new BadGatewayError('The favicon response contained no body');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_FAVICON_BYTES) {
        throw new BadGatewayError('The favicon response is too large');
      }

      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

const buildHeaders = (contentType: string, length: number, fresh: boolean) => {
  return new Headers({
    'Content-Length': String(length),
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Vercel-CDN-Cache-Control': fresh
      ? 'public, max-age=604800, stale-if-error=86400'
      : 'public, max-age=1800',
  });
};

// Fetch one candidate and turn it into a proxied Response, resizing rasters to
// the target size (like Google) and serving SVG/ICO as-is. Returns null on any
// miss so the caller can try the next candidate or source.
const tryCandidate = async (
  href: string,
  size: number,
  fetcher: FaviconFetcher,
  signal: AbortSignal,
  fresh: boolean,
): Promise<Response | null> => {
  try {
    // Icon URLs from third-party HTML/manifests get the same SSRF check.
    await assertSafeRemoteUrl(href, undefined, signal);

    const upstream = await fetcher(href, {
      headers: { accept: 'image/*' },
      redirect: 'follow',
      signal,
    });

    if (upstream.status !== 200) {
      return null;
    }

    const subtype = subtypeOf(upstream.headers.get('content-type'));

    if (!subtype) {
      return null;
    }

    const bytes = await readBytes(upstream);

    // Resizable raster → normalise to an exact-size PNG, matching Google.
    if (RESIZABLE_SUBTYPES.has(subtype)) {
      const png = await new Bun.Image(bytes)
        .resize(size, size, { fit: 'inside' })
        .png()
        .bytes();

      return new Response(png, {
        status: 200,
        headers: buildHeaders('image/png', png.byteLength, fresh),
      });
    }

    // SVG scales on its own; ICO we cannot resize — serve either as-is.
    if (SERVE_AS_IS_SUBTYPES.has(subtype)) {
      const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim();

      return new Response(bytes, {
        status: 200,
        headers: buildHeaders(contentType ?? `image/${subtype}`, bytes.byteLength, fresh),
      });
    }

    return null;
  } catch (cause) {
    if (cause instanceof ServerError) {
      throw cause;
    }

    if (signal.aborted) {
      throw cause;
    }

    return null;
  }
};

// Walk ranked candidates best-first. Skip an ICO when a later resizable raster
// exists; only fall back to serving the ICO as-is if nothing resizable worked.
const tryCandidates = async (
  candidates: IconCandidate[],
  size: number,
  fetcher: FaviconFetcher,
  signal: AbortSignal,
): Promise<Response | null> => {
  const hasResizable = candidates.some((candidate) => candidate.format === 'raster');

  let deferredIco: IconCandidate | null = null;

  for (const candidate of candidates) {
    // Defer ICO while a resizable raster remains to try — we prefer an
    // exact-size PNG over an unresizable ICO.
    if (candidate.format === 'ico' && hasResizable) {
      deferredIco ??= candidate;
      continue;
    }

    const response = await tryCandidate(candidate.href, size, fetcher, signal, true);

    if (response) {
      return response;
    }
  }

  if (deferredIco) {
    const response = await tryCandidate(deferredIco.href, size, fetcher, signal, true);

    if (response) {
      return response;
    }
  }

  return null;
};

/* ///////////////////////////////////////////////// */

/**
 * Resolve a site's favicon like Google's crawl, freshest source first:
 *   1. Origin: <link rel="icon"> + web app manifest icons, best-ranked.
 *   2. Conventional /favicon.ico at the resolved origin.
 *   3. Google's s2 service (may be stale).
 * Resizable rasters are resized to `size` and served as PNG; SVG/ICO served
 * as-is. Throws if all miss — the client shows its globe placeholder.
 */
export const getFaviconByUrl = async (
  url: string,
  size: number,
  options: FetchFaviconOptions = {},
) => {
  const {
    fetcher = globalThis.fetch,
    signal: requestSignal,
    timeout = REQUEST_TIMEOUT,
    documentOptions,
  } = options;

  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  const signal = requestSignal
    ? AbortSignal.any([controller.signal, requestSignal])
    : controller.signal;

  try {
    let resolvedUrl = url;

    // 1) Origin: HTML <link> icons plus manifest icons, merged and ranked.
    try {
      const document = await fetchDocument(url, { ...documentOptions, signal });
      resolvedUrl = document.url;

      const candidates = extractFaviconCandidates(document.root, resolvedUrl);
      const manifestUrl = extractManifestUrl(document.root, resolvedUrl);

      if (manifestUrl) {
        try {
          await assertSafeRemoteUrl(manifestUrl, undefined, signal);

          const manifestResponse = await fetcher(manifestUrl, {
            headers: { accept: 'application/manifest+json, application/json' },
            redirect: 'follow',
            signal,
          });

          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            candidates.push(...candidatesFromManifest(manifest, manifestUrl));
          }
        } catch {
          // manifest is best-effort; ignore and use <link> candidates
        }
      }

      const response = await tryCandidates(rankCandidates(candidates), size, fetcher, signal);

      if (response) {
        return response;
      }
    } catch (cause) {
      if (cause instanceof ServerError && signal.aborted) {
        throw cause;
      }
      // fall through to /favicon.ico
    }

    // 2) Conventional /favicon.ico at the resolved origin.
    try {
      const iconUrl = new URL('/favicon.ico', resolvedUrl).toString();
      const response = await tryCandidate(iconUrl, size, fetcher, signal, true);

      if (response) {
        return response;
      }
    } catch {
      // fall through to Google
    }

    // 3) Google s2 as last resort (stale-prone → short cache TTL).
    const googleResponse = await tryCandidate(
      buildGoogleFaviconUrl(resolvedUrl),
      size,
      fetcher,
      signal,
      false,
    );

    if (googleResponse) {
      return googleResponse;
    }

    throw new BadGatewayError('No favicon could be found for the requested URL');
  } catch (cause) {
    if (cause instanceof ServerError) {
      throw cause;
    }

    if (controller.signal.aborted) {
      throw new BadGatewayError(
        'The favicon service took too long to respond',
        undefined,
        cause,
      );
    }

    if (requestSignal?.aborted) {
      throw new BadGatewayError('The request was cancelled', undefined, cause);
    }

    throw new BadGatewayError('The favicon could not be fetched', undefined, cause);
  } finally {
    clearTimeout(timing);
  }
};
