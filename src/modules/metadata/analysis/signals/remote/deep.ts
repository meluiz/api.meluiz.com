import type { Fetcher, HostResolver } from '@/shared/remote';
import type { DeepAnalysisSignals, Metadata, RemoteResourceKind } from '../../../types';
import type { ProbeContext } from './probe';

import { mapWithConcurrency } from '@/shared/concurrency';
import { compareUrl, getComparableUrl, parseHttpUrl } from '@/shared/url';

import { inspectAlternate } from './alternate';
import { inspectImage } from './image';
import { inspectRobots } from './robots';
import { inspectSitemap } from './sitemap';

/* ///////////////////////////////////////////////// */

const DEFAULT_TIMEOUT = 8_000;
const DEFAULT_REQUEST_TIMEOUT = 4_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ALTERNATES = 5;
const MAX_FAVICONS = 2;

/* ///////////////////////////////////////////////// */

export interface DeepAnalysisOptions {
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
  signal?: AbortSignal;
  /** Overall budget for the whole deep phase. */
  timeout?: number;
  /** Ceiling for any single remote request inside that budget. */
  requestTimeout?: number;
  maxAlternates?: number;
  concurrency?: number;
}

/* ///////////////////////////////////////////////// */

/** Images worth fetching: social images and the first favicons, http(s) only, once each. */
const resourceEntries = (metadata: Metadata) => {
  const entries: Array<{ kind: RemoteResourceKind; url: string }> = [];

  const add = (kind: RemoteResourceKind, url: string | undefined) => {
    // Inline data: icons have nothing to fetch
    if (!url || !parseHttpUrl(url) || entries.some((entry) => entry.url === url)) {
      return;
    }

    entries.push({ kind, url });
  };

  add('open-graph-image', metadata.opengraph.image);
  add('twitter-image', metadata.twitter.image);

  for (const icon of (metadata.general.favicons ?? []).slice(0, MAX_FAVICONS)) {
    add('favicon', icon.href);
  }

  return entries;
};

/**
 * Alternates worth visiting. The page's own entry (a self-referencing hreflang is
 * standard practice) and repeated URLs (x-default often duplicates a language)
 * are skipped, so the visit budget goes to pages that can actually fail.
 */
const alternateEntries = (metadata: Metadata, returnUrl: string, limit: number) => {
  const seen = new Set<string>();

  return (metadata.general.alternates ?? [])
    .flatMap((alternate) => {
      const key = getComparableUrl(alternate.href);

      if (!alternate.href || !alternate.hrefLang || !key || seen.has(key)) {
        return [];
      }

      seen.add(key);

      if (
        compareUrl(alternate.href, returnUrl) ||
        compareUrl(alternate.href, metadata.resolvedUrl)
      ) {
        return [];
      }

      return [{ url: alternate.href, hrefLang: alternate.hrefLang }];
    })
    .slice(0, limit);
};

/* ///////////////////////////////////////////////// */

/** Network probes for deep mode: images, robots.txt, sitemap and language alternates. */
export const collectDeepAnalysisSignals = async (
  metadata: Metadata,
  options: DeepAnalysisOptions = {},
): Promise<DeepAnalysisSignals> => {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    fetcher,
    maxAlternates = DEFAULT_MAX_ALTERNATES,
    requestTimeout = DEFAULT_REQUEST_TIMEOUT,
    resolveHost,
    signal: callerSignal,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const budget = AbortSignal.timeout(timeout);
  const signal = callerSignal ? AbortSignal.any([budget, callerSignal]) : budget;
  const context: ProbeContext = { fetcher, resolveHost, signal, requestTimeout };

  const returnUrl = metadata.general.url ?? metadata.resolvedUrl;

  const [resources, robots, alternates] = await Promise.all([
    mapWithConcurrency(resourceEntries(metadata), concurrency, ({ kind, url }) => {
      return inspectImage(kind, url, context);
    }),
    inspectRobots(metadata.resolvedUrl, context),
    mapWithConcurrency(
      alternateEntries(metadata, returnUrl, maxAlternates),
      concurrency,
      ({ hrefLang, url }) => inspectAlternate(url, hrefLang, returnUrl, context),
    ),
  ]);

  // The sitemap location comes from robots.txt, so it runs after it
  const sitemap = await inspectSitemap(
    metadata.resolvedUrl,
    metadata.general.url,
    robots.sitemaps,
    context,
  );

  return { resources, robots, sitemap, alternates };
};
