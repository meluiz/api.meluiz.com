import type { DocumentFetcher } from '../service';
import type { Metadata } from '../types';
import type { HostResolver } from '../url-policy';
import type {
  AlternatePageSignal,
  DeepAnalysisSignals,
  RemoteResourceKind,
  RemoteResourceSignal,
  RobotsSignals,
  SitemapSignals,
} from './context';

import parse from 'node-html-parser';

import { getComparableUrl } from '#util/url';

import { assertSafeRemoteUrl } from '../url-policy';

/* ///////////////////////////////////////////////// */

export interface DeepAnalysisOptions {
  fetcher?: DocumentFetcher;
  resolveHost?: HostResolver;
  signal?: AbortSignal;
  /** Overall budget for the whole deep phase. */
  timeout?: number;
  /** Ceiling for any single remote request inside that budget. */
  requestTimeout?: number;
  maxAlternates?: number;
  concurrency?: number;
}

interface RemoteResponse {
  response: Response;
  url: string;
  bytes: Uint8Array;
  truncated: boolean;
}

interface RobotsRule {
  directive: 'allow' | 'disallow';
  path: string;
}

interface RemoteContext {
  fetcher: DocumentFetcher;
  resolveHost: HostResolver | undefined;
  signal: AbortSignal;
  requestTimeout: number;
}

interface FetchOptions {
  maximum: number;
  accept: string;
  /** Keep the prefix instead of failing when the byte ceiling is reached. */
  truncate?: boolean;
}

/* ///////////////////////////////////////////////// */

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_TEXT_BYTES = 1_000_000;
const MAX_HTML_BYTES = 400_000;
const MAX_ROBOTS_BYTES = 100_000;
const MAX_SITEMAP_CHILDREN = 3;
const DEFAULT_TIMEOUT = 8_000;
const DEFAULT_REQUEST_TIMEOUT = 4_000;
const DEFAULT_CONCURRENCY = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ///////////////////////////////////////////////// */

class ResourceLimitError extends Error {}

const isAbortLike = (cause: unknown) => {
  return (
    cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')
  );
};

/**
 * Failures are reduced to a fixed vocabulary. Raw `cause.message` values leak
 * internal detail (DNS resolution, policy internals) to API consumers, and a
 * timeout has to stay distinguishable from a genuinely broken resource.
 */
const describeFailure = (cause: unknown): { error: string; timeout: boolean } => {
  if (isAbortLike(cause)) {
    return { error: 'The resource did not respond within the analysis budget', timeout: true };
  }

  if (cause instanceof ResourceLimitError) {
    return { error: cause.message, timeout: false };
  }

  return { error: 'The resource could not be inspected', timeout: false };
};

/**
 * Bounds a single request without consuming the shared budget: one slow asset
 * can no longer abort every other request and make a slow site look like a site
 * with broken metadata.
 */
const requestSignal = (context: RemoteContext) => {
  return AbortSignal.any([context.signal, AbortSignal.timeout(context.requestTimeout)]);
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;

      const item = items[index];

      if (index >= items.length || item === undefined) {
        return;
      }

      results[index] = await task(item);
    }
  });

  await Promise.all(workers);

  return results;
};

const readLimitedBytes = async (response: Response, maximum: number, truncate: boolean) => {
  const declared = Number(response.headers.get('content-length'));

  if (!truncate && Number.isFinite(declared) && declared > maximum) {
    throw new ResourceLimitError(`The response exceeds the ${maximum}-byte analysis limit`);
  }

  if (!response.body) {
    return { bytes: new Uint8Array(), truncated: false };
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();

  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      if (total + value.byteLength > maximum) {
        if (!truncate) {
          throw new ResourceLimitError(
            `The response exceeds the ${maximum}-byte analysis limit`,
          );
        }

        const chunk = value.subarray(0, maximum - total);

        if (chunk.byteLength > 0) {
          chunks.push(chunk);
          total += chunk.byteLength;
        }

        truncated = true;
        break;
      }

      total += value.byteLength;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, truncated };
};

const fetchRemote = async (
  input: string,
  context: RemoteContext,
  options: FetchOptions,
): Promise<RemoteResponse> => {
  const signal = requestSignal(context);
  let url = input;

  for (let hop = 0; ; hop += 1) {
    // Re-validated on every hop so a redirect cannot walk into a blocked host.
    await assertSafeRemoteUrl(url, context.resolveHost, signal);

    const response = await context.fetcher(url, {
      signal,
      redirect: 'manual',
      headers: {
        accept: options.accept,
        'user-agent': 'metadata-seo-audit/1.0',
      },
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      const { bytes, truncated } = await readLimitedBytes(
        response,
        options.maximum,
        options.truncate ?? false,
      );

      return { response, url, bytes, truncated };
    }

    const location = response.headers.get('location');

    if (!location) {
      return { response, url, bytes: new Uint8Array(), truncated: false };
    }

    if (hop >= MAX_REDIRECTS) {
      throw new ResourceLimitError(
        'Too many redirects were followed while inspecting the resource',
      );
    }

    url = new URL(location, url).toString();
  }
};

/* ///////////////////////////////////////////////// */

const inspectImage = async (
  kind: RemoteResourceKind,
  url: string,
  context: RemoteContext,
): Promise<RemoteResourceSignal> => {
  try {
    const { bytes, response } = await fetchRemote(url, context, {
      maximum: MAX_IMAGE_BYTES,
      accept: 'image/*',
    });

    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    const result: RemoteResourceSignal = {
      kind,
      url,
      status: response.status,
      contentType,
      bytes: bytes.byteLength,
    };

    if (response.status !== 200) {
      result.error = `The resource responded with status ${response.status}`;
      return result;
    }

    if (!contentType?.startsWith('image/')) {
      result.error = 'The resource did not return an image MIME type';
      return result;
    }

    try {
      if (contentType === 'image/svg+xml') {
        const svg = new TextDecoder().decode(bytes);
        const width = /\bwidth=["'](\d+(?:\.\d+)?)/i.exec(svg)?.[1];
        const height = /\bheight=["'](\d+(?:\.\d+)?)/i.exec(svg)?.[1];
        const viewBox = /\bviewBox=["'][^"']*?([\d.]+)\s+([\d.]+)["']/i.exec(svg);

        result.width = Number(width ?? viewBox?.[1]) || undefined;
        result.height = Number(height ?? viewBox?.[2]) || undefined;
      } else {
        const image = await new Bun.Image(bytes).metadata();
        result.width = image.width;
        result.height = image.height;
      }
    } catch {
      result.error = 'The image body could not be decoded';
    }

    return result;
  } catch (cause) {
    return { kind, url, ...describeFailure(cause) };
  }
};

const decodeText = (bytes: Uint8Array) => {
  return new TextDecoder().decode(bytes);
};

const escapePattern = (value: string) => {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
};

const robotsPathMatches = (rule: string, path: string) => {
  const endAnchored = rule.endsWith('$');
  const source = escapePattern(endAnchored ? rule.slice(0, -1) : rule);
  return new RegExp(`^${source}${endAnchored ? '$' : ''}`).test(path);
};

const parseRobots = (body: string, pageUrl: string) => {
  const sitemaps: string[] = [];
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];

  let group: { agents: string[]; rules: RobotsRule[] } | undefined;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim();

    if (!line) {
      continue;
    }

    const separator = line.indexOf(':');

    if (separator < 0) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      try {
        sitemaps.push(new URL(value, pageUrl).toString());
      } catch {
        // Invalid sitemap declarations are ignored and surfaced by absence.
      }
      continue;
    }

    if (field === 'user-agent') {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }

      group.agents.push(value.toLocaleLowerCase());
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && group && value) {
      group.rules.push({ directive: field, path: value });
    }
  }

  const matchingGroups = groups.filter(({ agents }) => {
    return agents.some((agent) => agent === '*' || 'googlebot'.startsWith(agent));
  });

  const specificity = Math.max(
    0,
    ...matchingGroups.flatMap(({ agents }) =>
      agents
        .filter((agent) => agent === '*' || 'googlebot'.startsWith(agent))
        .map((agent) => (agent === '*' ? 0 : agent.length)),
    ),
  );

  const genericRules = matchingGroups
    .filter(({ agents }) => {
      return agents.some(
        (agent) =>
          (agent === '*' || 'googlebot'.startsWith(agent)) &&
          (agent === '*' ? 0 : agent.length) === specificity,
      );
    })
    .flatMap(({ rules }) => rules);

  const path = `${new URL(pageUrl).pathname}${new URL(pageUrl).search}`;
  const matching = genericRules
    .filter((rule) => robotsPathMatches(rule.path, path))
    .sort((left, right) => {
      const byLength = right.path.length - left.path.length;
      return byLength !== 0 ? byLength : left.directive === 'allow' ? -1 : 1;
    });

  return {
    allowed: matching[0] ? matching[0].directive === 'allow' : null,
    sitemaps,
  };
};

const inspectRobots = async (
  pageUrl: string,
  context: RemoteContext,
): Promise<RobotsSignals> => {
  const url = new URL('/robots.txt', pageUrl).toString();

  try {
    const { bytes, response } = await fetchRemote(url, context, {
      maximum: MAX_ROBOTS_BYTES,
      accept: 'text/plain,*/*;q=0.1',
    });

    if (response.status === 404) {
      return { url, status: 404, allowed: null, sitemaps: [] };
    }

    if (!response.ok) {
      return {
        url,
        status: response.status,
        allowed: null,
        sitemaps: [],
        error: `robots.txt responded with status ${response.status}`,
      };
    }

    const parsed = parseRobots(decodeText(bytes), pageUrl);
    return { url, status: response.status, ...parsed };
  } catch (cause) {
    return { url, allowed: null, sitemaps: [], ...describeFailure(cause) };
  }
};

const xmlValue = (value: string) => {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
};

const locationsOf = (body: string) => {
  return [...body.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => xmlValue(match[1]?.trim() ?? ''))
    .filter(Boolean);
};

/**
 * Follows one `<sitemapindex>` level. Large sites almost always declare an
 * index in robots.txt, and treating it as a flat sitemap reported every URL as
 * missing from the sitemap.
 */
const inspectSitemap = async (
  pageUrl: string,
  canonical: string | undefined,
  declared: string[],
  context: RemoteContext,
): Promise<SitemapSignals> => {
  const url = declared[0] ?? new URL('/sitemap.xml', pageUrl).toString();
  const preferred = getComparableUrl(canonical ?? pageUrl);

  try {
    const { bytes, response } = await fetchRemote(url, context, {
      maximum: MAX_TEXT_BYTES,
      accept: 'application/xml,text/xml,*/*;q=0.1',
    });

    if (!response.ok) {
      return {
        url,
        status: response.status,
        containsCanonical: null,
        error: `The sitemap responded with status ${response.status}`,
      };
    }

    const body = decodeText(bytes);
    const locations = locationsOf(body);
    const matches = (candidates: string[]) => {
      return candidates.some((location) => getComparableUrl(location) === preferred);
    };

    if (!/<sitemapindex\b/i.test(body)) {
      return {
        url,
        status: response.status,
        inspected: 1,
        containsCanonical: matches(locations),
      };
    }

    const children = await mapWithConcurrency(
      locations.slice(0, MAX_SITEMAP_CHILDREN),
      MAX_SITEMAP_CHILDREN,
      async (child) => {
        try {
          const nested = await fetchRemote(child, context, {
            maximum: MAX_TEXT_BYTES,
            accept: 'application/xml,text/xml,*/*;q=0.1',
          });

          return nested.response.ok ? locationsOf(decodeText(nested.bytes)) : null;
        } catch {
          return null;
        }
      },
    );

    const reachable = children.filter((child): child is string[] => child !== null);
    const found = reachable.some(matches);

    return {
      url,
      status: response.status,
      inspected: 1 + reachable.length,
      // A partial index walk can prove presence but never absence.
      containsCanonical: found ? true : reachable.length < locations.length ? null : false,
      ...(found || reachable.length === locations.length
        ? {}
        : { error: 'Only part of the sitemap index could be inspected' }),
    };
  } catch (cause) {
    return { url, containsCanonical: null, ...describeFailure(cause) };
  }
};

const inspectAlternate = async (
  url: string,
  hrefLang: string | undefined,
  returnUrl: string,
  context: RemoteContext,
): Promise<AlternatePageSignal> => {
  try {
    const {
      bytes,
      response,
      truncated,
      url: resolvedUrl,
    } = await fetchRemote(url, context, {
      maximum: MAX_HTML_BYTES,
      accept: 'text/html,application/xhtml+xml;q=0.9',
      truncate: true,
    });

    if (!response.ok) {
      return {
        url,
        hrefLang,
        status: response.status,
        reciprocal: null,
        error: `The alternate responded with status ${response.status}`,
      };
    }

    const html = decodeText(bytes);
    // A cut before </head> means canonical/hreflang were never seen; reporting
    // that as a mismatch would invent a defect out of our own byte ceiling.
    const incomplete = truncated && !/<\/head\s*>/i.test(html);

    if (incomplete) {
      return {
        url,
        hrefLang,
        status: response.status,
        reciprocal: null,
        truncated: true,
        error: 'The alternate document was larger than the inspection limit',
      };
    }

    const root = parse(html);
    const canonicalValue = root.querySelector('link[rel=canonical]')?.getAttribute('href');
    const canonical = canonicalValue
      ? new URL(canonicalValue, resolvedUrl).toString()
      : undefined;

    const reciprocal = root.querySelectorAll('link[rel~=alternate]').some((element) => {
      const href = element.getAttribute('href');

      if (!href || !element.getAttribute('hreflang')) {
        return false;
      }

      try {
        const target = getComparableUrl(new URL(href, resolvedUrl).toString());
        return target !== null && target === getComparableUrl(returnUrl);
      } catch {
        return false;
      }
    });

    return { url, hrefLang, status: response.status, canonical, reciprocal };
  } catch (cause) {
    return { url, hrefLang, reciprocal: null, ...describeFailure(cause) };
  }
};

/* ///////////////////////////////////////////////// */

export const collectDeepAnalysisSignals = async (
  metadata: Metadata,
  options: DeepAnalysisOptions = {},
): Promise<DeepAnalysisSignals> => {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    fetcher = globalThis.fetch,
    maxAlternates = 5,
    requestTimeout = DEFAULT_REQUEST_TIMEOUT,
    resolveHost,
    signal: callerSignal,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  const budget = callerSignal
    ? AbortSignal.any([controller.signal, callerSignal])
    : controller.signal;

  const context: RemoteContext = { fetcher, resolveHost, signal: budget, requestTimeout };

  try {
    const resourceEntries: Array<[RemoteResourceKind, string]> = [];
    const addResource = (kind: RemoteResourceKind, value: string | undefined) => {
      if (value && !resourceEntries.some(([, url]) => url === value)) {
        resourceEntries.push([kind, value]);
      }
    };

    addResource('open-graph-image', metadata.opengraph.image);
    addResource('twitter-image', metadata.twitter.image);

    for (const icon of (metadata.general.favicons ?? []).slice(0, 2)) {
      addResource('favicon', icon.href);
    }

    const alternateEntries = (metadata.general.alternates ?? [])
      .filter(
        (alternate): alternate is typeof alternate & { href: string } =>
          !!alternate.href && !!alternate.hrefLang,
      )
      .slice(0, maxAlternates);

    const returnUrl = metadata.general.url ?? metadata.resolvedUrl;

    const [resources, robots, alternates] = await Promise.all([
      mapWithConcurrency(resourceEntries, concurrency, ([kind, url]) =>
        inspectImage(kind, url, context),
      ),
      inspectRobots(metadata.resolvedUrl, context),
      mapWithConcurrency(alternateEntries, concurrency, (alternate) =>
        inspectAlternate(alternate.href, alternate.hrefLang, returnUrl, context),
      ),
    ]);

    const sitemap = await inspectSitemap(
      metadata.resolvedUrl,
      metadata.general.url,
      robots.sitemaps,
      context,
    );

    return { resources, robots, sitemap, alternates };
  } finally {
    clearTimeout(timing);
  }
};
