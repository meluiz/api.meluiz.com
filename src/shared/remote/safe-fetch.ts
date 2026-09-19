import type { Fetcher } from './types';
import type { HostResolver } from './url-policy';

import { BadGatewayError, BadRequestError } from '@/core/http';

import { assertSafeRemoteUrl } from './url-policy';

/* ///////////////////////////////////////////////// */

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ///////////////////////////////////////////////// */

export interface SafeFetchOptions {
  signal: AbortSignal;
  headers?: Record<string, string>;
  fetcher?: Fetcher;
  maxRedirects?: number;
  resolveHost?: HostResolver;
}

export interface SafeFetchResult {
  /** Final response; its body has not been read. */
  response: Response;
  /** URL of the final response, after every redirect. */
  url: string;
  /** URLs followed after the requested one, in order. */
  redirects: string[];
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

  const redirects: string[] = [];

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

    const response = await fetcher(url, { headers, signal, redirect: 'manual' });
    const location = REDIRECT_STATUSES.has(response.status)
      ? response.headers.get('location')
      : null;

    if (!location) {
      return { response, url, redirects };
    }

    // Redirect bodies are never read; release the connection before the next hop
    await discard(response);

    if (hop >= maxRedirects) {
      throw new BadGatewayError('Too many redirects were followed');
    }

    const next = URL.parse(location, url);

    if (!next) {
      throw new BadGatewayError('The resource returned an invalid redirect');
    }

    url = next.toString();
    redirects.push(url);
  }
};
