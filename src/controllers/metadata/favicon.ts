import { BadGatewayError, ServerError } from '#util/errors';

import {
  candidatesFromManifest,
  extractFaviconCandidates,
  extractManifestUrl,
  type IconCandidate,
  type IconSource,
  rankCandidates,
} from './extractors';
import { type FetchDocumentOptions, fetchDocument } from './service';
import { assertSafeRemoteUrl, type HostResolver } from './url-policy';

const REQUEST_TIMEOUT = 8_000;
const DOCUMENT_TIMEOUT = 3_000;
const RESOURCE_TIMEOUT = 2_000;
const MAX_FAVICON_BYTES = 2_000_000;
const MAX_MANIFEST_BYTES = 256_000;
const MAX_REDIRECTS = 3;
const MAX_CANDIDATES = 24;
const GOOGLE_FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';
const UPSTREAM_SIZE = 128;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type FaviconFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFaviconOptions {
  fetcher?: FaviconFetcher;
  signal?: AbortSignal;
  timeout?: number;
  maxBytes?: number;
  manifestMaxBytes?: number;
  maxRedirects?: number;
  resourceTimeout?: number;
  resolveHost?: HostResolver;
  documentOptions?: FetchDocumentOptions;
}

interface RemoteResourceOptions {
  fetcher: FaviconFetcher;
  signal: AbortSignal;
  resolveHost?: HostResolver;
  maxRedirects: number;
  accept: string;
}

interface CandidateOptions extends RemoteResourceOptions {
  maxBytes: number;
  resourceTimeout: number;
}

const buildGoogleFaviconUrl = (url: string) => {
  const endpoint = new URL(GOOGLE_FAVICON_ENDPOINT);
  endpoint.searchParams.set('domain_url', new URL('/', url).toString());
  endpoint.searchParams.set('sz', String(UPSTREAM_SIZE));
  return endpoint.toString();
};

const withTimeout = async <Value>(
  timeout: number,
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Value>,
) => {
  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  try {
    return await operation(AbortSignal.any([signal, controller.signal]));
  } finally {
    clearTimeout(timing);
  }
};

const fetchRemoteResource = async (input: string, options: RemoteResourceOptions) => {
  const { accept, fetcher, maxRedirects, resolveHost, signal } = options;
  let url = input;

  for (let hop = 0; ; hop += 1) {
    await assertSafeRemoteUrl(url, resolveHost, signal);

    const response = await fetcher(url, {
      headers: {
        accept,
        'user-agent': 'Mozilla/5.0 (compatible; MetadataFaviconBot/1.0)',
      },
      redirect: 'manual',
      signal,
    });

    const responseUrl = response.url || url;

    if (response.redirected) {
      await assertSafeRemoteUrl(responseUrl, resolveHost, signal);
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, url: responseUrl };
    }

    const location = response.headers.get('location');

    if (!location) {
      return { response, url: responseUrl };
    }

    if (hop >= maxRedirects) {
      await response.body?.cancel().catch(() => {});
      throw new BadGatewayError('Too many favicon redirects were followed');
    }

    try {
      url = new URL(location, url).toString();
    } catch (cause) {
      await response.body?.cancel().catch(() => {});
      throw new BadGatewayError('The favicon returned an invalid redirect', undefined, cause);
    }

    await response.body?.cancel().catch(() => {});
  }
};

const readBytes = async (response: Response, maximum: number) => {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new BadGatewayError('The remote resource is too large');
  }

  if (!response.body) {
    throw new BadGatewayError('The remote resource contained no body');
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

      if (totalBytes > maximum) {
        throw new BadGatewayError('The remote resource is too large');
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

const readDataUrl = (url: string, maximum: number) => {
  const match = /^data:(image\/[^;,]+)(;[^,]*)?,(.*)$/is.exec(url);

  if (!match) {
    throw new BadGatewayError('The inline favicon is invalid');
  }

  const parameters = match[2] ?? '';
  const payload = match[3] ?? '';
  const bytes = /(?:^|;)base64(?:;|$)/i.test(parameters)
    ? Uint8Array.from(Buffer.from(payload.replace(/\s+/g, ''), 'base64'))
    : new TextEncoder().encode(decodeURIComponent(payload));

  if (bytes.byteLength > maximum) {
    throw new BadGatewayError('The inline favicon is too large');
  }

  return bytes;
};

const isIco = (bytes: Uint8Array) => {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    (bytes[2] === 1 || bytes[2] === 2) &&
    bytes[3] === 0
  );
};

const isSvg = (bytes: Uint8Array) => {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 8_192));
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)?(?:<!doctype\s+svg[^>]*>\s*)?<svg(?:\s|>)/i.test(
    prefix,
  );
};

const buildHeaders = (
  contentType: string,
  length: number,
  source: IconSource,
  fresh: boolean,
) => {
  const cacheControl = fresh
    ? 'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400'
    : 'public, max-age=1800, stale-if-error=86400';
  const headers = new Headers({
    'Cache-Control': cacheControl,
    'Content-Length': String(length),
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Vercel-CDN-Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Favicon-Source': source,
  });

  if (contentType === 'image/svg+xml') {
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  }

  return headers;
};

const tryCandidate = async (
  candidate: IconCandidate,
  size: number,
  options: CandidateOptions,
): Promise<Response | null> => {
  const source = candidate.source ?? 'html';

  try {
    return await withTimeout(options.resourceTimeout, options.signal, async (signal) => {
      let bytes: Uint8Array;

      if (candidate.href.toLowerCase().startsWith('data:')) {
        bytes = readDataUrl(candidate.href, options.maxBytes);
      } else {
        const { response: upstream } = await fetchRemoteResource(candidate.href, {
          ...options,
          signal,
        });

        if (!upstream.ok) {
          await upstream.body?.cancel().catch(() => {});
          return null;
        }

        bytes = await readBytes(upstream, options.maxBytes);
      }

      if (isIco(bytes)) {
        return new Response(bytes, {
          status: 200,
          headers: buildHeaders('image/x-icon', bytes.byteLength, source, source !== 'google'),
        });
      }

      if (isSvg(bytes)) {
        return new Response(bytes, {
          status: 200,
          headers: buildHeaders('image/svg+xml', bytes.byteLength, source, source !== 'google'),
        });
      }

      const image = new Bun.Image(bytes);
      const png = await image.resize(size, size, { fit: 'inside' }).png().bytes();

      return new Response(png, {
        status: 200,
        headers: buildHeaders('image/png', png.byteLength, source, source !== 'google'),
      });
    });
  } catch (cause) {
    if (options.signal.aborted) {
      throw cause;
    }

    return null;
  }
};

const tryCandidates = async (
  candidates: IconCandidate[],
  size: number,
  options: CandidateOptions,
) => {
  for (const candidate of rankCandidates(candidates, size).slice(0, MAX_CANDIDATES)) {
    const response = await tryCandidate(candidate, size, options);

    if (response) {
      return response;
    }
  }

  return null;
};

const loadManifestCandidates = async (manifestUrl: string, options: CandidateOptions) => {
  try {
    return await withTimeout(options.resourceTimeout, options.signal, async (signal) => {
      const { response, url: resolvedManifestUrl } = await fetchRemoteResource(manifestUrl, {
        ...options,
        accept: 'application/manifest+json, application/json;q=0.9, */*;q=0.1',
        signal,
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return [];
      }

      const bytes = await readBytes(response, options.maxBytes);
      const source = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
      const manifest: unknown = JSON.parse(source);
      return candidatesFromManifest(manifest, resolvedManifestUrl);
    });
  } catch (cause) {
    if (options.signal.aborted) {
      throw cause;
    }

    return [];
  }
};

const conventionalCandidates = (url: string): IconCandidate[] => {
  const definitions = [
    ['/favicon.svg', Number.POSITIVE_INFINITY, 'svg'],
    ['/apple-touch-icon.png', 180, 'raster'],
    ['/favicon.png', 64, 'raster'],
    ['/favicon.ico', 32, 'ico'],
  ] as const;

  return definitions.map(([pathname, size, format]) => ({
    href: new URL(pathname, url).toString(),
    size,
    format,
    purposes: ['any'],
    source: 'conventional',
  }));
};

/** Resolve, validate, normalize, and proxy the best favicon available for a website. */
export const getFaviconByUrl = async (
  url: string,
  size: number,
  options: FetchFaviconOptions = {},
) => {
  const {
    documentOptions,
    fetcher = globalThis.fetch,
    manifestMaxBytes = MAX_MANIFEST_BYTES,
    maxBytes = MAX_FAVICON_BYTES,
    maxRedirects = MAX_REDIRECTS,
    resolveHost = documentOptions?.resolveHost,
    resourceTimeout = RESOURCE_TIMEOUT,
    signal: requestSignal,
    timeout = REQUEST_TIMEOUT,
  } = options;
  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);
  const signal = requestSignal
    ? AbortSignal.any([controller.signal, requestSignal])
    : controller.signal;
  const resourceOptions: RemoteResourceOptions = {
    accept: 'image/avif,image/webp,image/svg+xml,image/*;q=0.9,*/*;q=0.1',
    fetcher,
    maxRedirects,
    resolveHost,
    signal,
  };

  try {
    await assertSafeRemoteUrl(url, resolveHost, signal);

    let resolvedUrl = url;

    try {
      const document = await fetchDocument(url, {
        ...documentOptions,
        fetcher: documentOptions?.fetcher ?? fetcher,
        resolveHost,
        signal,
        timeout: documentOptions?.timeout ?? DOCUMENT_TIMEOUT,
      });
      resolvedUrl = document.url;

      const candidates = extractFaviconCandidates(document.root, resolvedUrl);
      const manifestUrl = extractManifestUrl(document.root, resolvedUrl);

      if (manifestUrl) {
        candidates.push(
          ...(await loadManifestCandidates(manifestUrl, {
            ...resourceOptions,
            maxBytes: manifestMaxBytes,
            resourceTimeout,
          })),
        );
      }

      const response = await tryCandidates(candidates, size, {
        ...resourceOptions,
        maxBytes,
        resourceTimeout,
      });

      if (response) {
        return response;
      }
    } catch (cause) {
      if (signal.aborted) {
        throw cause;
      }
    }

    const conventional = await tryCandidates(conventionalCandidates(resolvedUrl), size, {
      ...resourceOptions,
      maxBytes,
      resourceTimeout,
    });

    if (conventional) {
      return conventional;
    }

    const google = await tryCandidate(
      {
        href: buildGoogleFaviconUrl(resolvedUrl),
        size: UPSTREAM_SIZE,
        format: 'raster',
        purposes: ['any'],
        source: 'google',
      },
      size,
      { ...resourceOptions, maxBytes, resourceTimeout },
    );

    if (google) {
      return google;
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
