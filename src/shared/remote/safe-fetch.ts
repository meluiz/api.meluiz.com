import type { Fetcher } from './types';
import type { HostResolver } from './url-policy';

import { BadGatewayError, BadRequestError } from '@/core/http';

import { assertSafeRemoteUrl } from './url-policy';

/* ///////////////////////////////////////////////// */

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ///////////////////////////////////////////////// */

/** Thrown when a resource keeps redirecting past the allowed number of hops. */
export class TooManyRedirectsError extends BadGatewayError {
  constructor() {
    super('Too many redirects were followed');
  }
}

/* ///////////////////////////////////////////////// */

export interface SafeFetchOptions {
  signal: AbortSignal;
  headers?: Record<string, string>;
  fetcher?: Fetcher;
  maxRedirects?: number;
  resolveHost?: HostResolver;
}

/**
 * One hop of a redirect chain. The status is what makes the chain auditable:
 * a 301 and a 302 to the same place mean very different things to a crawler.
 */
export interface RedirectHop {
  to: string;
  from: string;
  status: number;
}

export interface SafeFetchResult {
  /** URL of the final response, after every redirect. */
  url: string;
  /** Final response; its body has not been read. */
  response: Response;

  /** Hops followed after the requested one, in order. */
  redirects: RedirectHop[];
}

/* ///////////////////////////////////////////////// */

/** Release a response whose body will not be read, so its connection is freed. */
export const discard = async (response: Response) => {
  await response.body?.cancel().catch(() => {});
};

/**
 * Fetch a user-supplied URL, following redirects manually so the SSRF policy is
 * enforced on every hop, not just on the initial URL.
 */
export const safeFetch = async (
  input: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> => {
  const {
    fetcher = globalThis.fetch,
    headers,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    resolveHost,
    signal,
  } = options;

  const redirects: RedirectHop[] = [];

  let url = input;

  for (let hop = 0; ; hop += 1) {
    try {
      await assertSafeRemoteUrl(url, resolveHost, signal);
    } catch (cause) {
      // The requested URL was valid; a redirect to a blocked target is an upstream problem
      if (hop > 0 && cause instanceof BadRequestError) {
        throw new BadGatewayError(
          'The resource redirected to a disallowed location',
          undefined,
          cause,
        );
      }

      throw cause;
    }

    const response = await fetcher(url, {
      signal,
      headers,
      redirect: 'manual',
    });
    const location = REDIRECT_STATUSES.has(response.status)
      ? response.headers.get('location')
      : null;

    if (!location) {
      return { response, url, redirects };
    }

    // Redirect bodies are never read; release the connection before the next hop
    await discard(response);

    if (hop >= maxRedirects) {
      throw new TooManyRedirectsError();
    }

    const next = URL.parse(location, url);

    if (!next) {
      throw new BadGatewayError('The resource returned an invalid redirect');
    }

    const target = next.toString();

    redirects.push({ from: url, to: target, status: response.status });

    url = target;
  }
};
