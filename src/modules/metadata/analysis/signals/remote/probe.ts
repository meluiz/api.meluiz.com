import type { Fetcher, HostResolver } from '@/shared/remote';

import { ResourceTooLargeError, safeFetch, TooManyRedirectsError } from '@/shared/remote';

/* ///////////////////////////////////////////////// */

const PROBE_USER_AGENT = 'metadata-seo-audit/1.0';

/* ///////////////////////////////////////////////// */

export interface ProbeContext {
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
  /** Shared budget of the whole deep phase. */
  signal: AbortSignal;
  /** Ceiling for any single request inside that budget. */
  requestTimeout: number;
}

export interface ProbeFailure {
  error: string;
  timeout: boolean;
}

/* ///////////////////////////////////////////////// */

const isAbortLike = (cause: unknown) => {
  return (
    cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
  );
};

/**
 * Fetch a probe target through the SSRF-safe client. Each request gets its own
 * timeout on top of the shared budget, so one slow asset cannot abort every other
 * probe and make a slow site look like a site with broken metadata.
 */
export const probe = (url: string, context: ProbeContext, accept: string) => {
  return safeFetch(url, {
    fetcher: context.fetcher,
    resolveHost: context.resolveHost,
    signal: AbortSignal.any([context.signal, AbortSignal.timeout(context.requestTimeout)]),
    headers: { accept, 'user-agent': PROBE_USER_AGENT },
  });
};

/**
 * Reduce a failure to a fixed vocabulary. Raw messages would leak internal detail
 * (DNS, policy internals) to API consumers, and a timeout has to stay
 * distinguishable from a genuinely broken resource.
 */
export const describeFailure = (cause: unknown): ProbeFailure => {
  if (isAbortLike(cause)) {
    return { error: 'The resource did not respond within the analysis budget', timeout: true };
  }

  if (cause instanceof ResourceTooLargeError || cause instanceof TooManyRedirectsError) {
    return { error: cause.message, timeout: false };
  }

  return { error: 'The resource could not be inspected', timeout: false };
};
