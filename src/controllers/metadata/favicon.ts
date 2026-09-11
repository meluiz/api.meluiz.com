import { BadGatewayError, ServerError } from '#util/errors';

const REQUEST_TIMEOUT = 4_000;
const MAX_FAVICON_BYTES = 1_000_000;
const ALLOWED_STATUSES = new Set([200, 404]);
const GOOGLE_FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';

export type FaviconFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFaviconOptions {
  fetcher?: FaviconFetcher;
  signal?: AbortSignal;
  timeout?: number;
}

const buildGoogleFaviconUrl = (url: string, size: number) => {
  const endpoint = new URL(GOOGLE_FAVICON_ENDPOINT);
  const siteOrigin = new URL('/', url).toString();

  endpoint.searchParams.set('domain_url', siteOrigin);
  endpoint.searchParams.set('sz', String(size));

  return endpoint.toString();
};

const readImage = async (response: Response) => {
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

  const image = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    image.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return image;
};

export const getFaviconByUrl = async (
  url: string,
  size: number,
  options: FetchFaviconOptions = {},
) => {
  const {
    fetcher = globalThis.fetch,
    signal: requestSignal,
    timeout = REQUEST_TIMEOUT,
  } = options;

  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  const signal = requestSignal
    ? AbortSignal.any([controller.signal, requestSignal])
    : controller.signal;

  try {
    const upstream = await fetcher(buildGoogleFaviconUrl(url, size), {
      headers: { accept: 'image/png' },
      redirect: 'follow',
      signal,
    });

    if (!ALLOWED_STATUSES.has(upstream.status)) {
      throw new BadGatewayError(`The favicon service responded with status ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim();

    if (contentType !== 'image/png') {
      throw new BadGatewayError('The favicon service returned an invalid content type');
    }

    const image = await readImage(upstream);
    const headers = new Headers({
      'Content-Length': String(image.byteLength),
      'Content-Type': 'image/png',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Vercel-CDN-Cache-Control':
        upstream.status === 200
          ? 'public, max-age=604800, stale-if-error=86400'
          : 'public, max-age=1800',
    });

    for (const name of ['cache-control', 'content-location', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);

      if (value) {
        headers.set(name, value);
      }
    }

    return new Response(image, { headers, status: upstream.status });
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
