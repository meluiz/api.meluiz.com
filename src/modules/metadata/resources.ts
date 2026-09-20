import type { Fetcher, HostResolver } from '@/shared/remote';
import type { ProbeContext } from './analysis';
import type { Metadata, RemoteResourceKind, RemoteResourceSignal } from './schemas';

import { mapWithConcurrency } from '@/shared/concurrency';
import { parseHttpUrl } from '@/shared/url';

import { inspectImage } from './analysis';

/* ///////////////////////////////////////////////// */

const DEFAULT_TIMEOUT = 8_000;
const DEFAULT_REQUEST_TIMEOUT = 4_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RESOURCES = 12;

/* ///////////////////////////////////////////////// */

export interface InspectResourcesOptions {
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
  signal?: AbortSignal;
  /** Overall budget for the whole probing phase. */
  timeout?: number;
  /** Ceiling for any single request inside that budget. */
  requestTimeout?: number;
  concurrency?: number;
  maxResources?: number;
}

/* ///////////////////////////////////////////////// */

/**
 * Every declared image worth fetching, deduplicated by URL and in the order a
 * reader cares about. Social images come first so they are never the entries
 * dropped by the cap, and `data:` icons are skipped since there is nothing to
 * request.
 */
const resourceEntries = (metadata: Metadata, limit: number) => {
  const entries: Array<{ kind: RemoteResourceKind; url: string }> = [];
  const seen = new Set<string>();

  const add = (kind: RemoteResourceKind, url: string | undefined) => {
    if (!url || !parseHttpUrl(url) || seen.has(url) || entries.length >= limit) {
      return;
    }

    seen.add(url);
    entries.push({ kind, url });
  };

  for (const image of metadata.opengraph.images ?? []) {
    add('open-graph-image', image.url);
  }

  add('twitter-image', metadata.twitter.image);

  for (const icon of metadata.general.favicons ?? []) {
    add('favicon', icon.href);
  }

  for (const icon of metadata.mobile.appleTouchIcons ?? []) {
    add('touch-icon', icon.href);
  }

  for (const icon of metadata.mobile.appleTouchIconsPrecomposed ?? []) {
    add('touch-icon', icon.href);
  }

  return entries;
};

/* ///////////////////////////////////////////////// */

/**
 * Fetch and measure the images a page declares. Runs through the SSRF-safe
 * client, so a consumer never has to request a third-party URL itself just to
 * learn how big an icon is.
 */
export const inspectResources = async (
  metadata: Metadata,
  options: InspectResourcesOptions = {},
): Promise<RemoteResourceSignal[]> => {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    fetcher,
    maxResources = DEFAULT_MAX_RESOURCES,
    requestTimeout = DEFAULT_REQUEST_TIMEOUT,
    resolveHost,
    signal: callerSignal,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const entries = resourceEntries(metadata, maxResources);

  if (entries.length === 0) {
    return [];
  }

  const budget = AbortSignal.timeout(timeout);
  const signal = callerSignal ? AbortSignal.any([budget, callerSignal]) : budget;
  const context: ProbeContext = { fetcher, resolveHost, signal, requestTimeout };

  return mapWithConcurrency(entries, concurrency, ({ kind, url }) => {
    return inspectImage(kind, url, context);
  });
};
