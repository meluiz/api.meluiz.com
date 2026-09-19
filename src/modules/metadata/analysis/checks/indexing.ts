import type { AnalysisOutcome } from '../../schemas/analysis';
import type { CheckFactory } from './types';

import { compareUrl, parseHttpUrl } from '@/shared/url';

import {
  classifyDirectives,
  directivesOf,
  headerDirectivesOf,
  httpCanonicalValues,
  textValue,
} from '../helpers';
import { createCheck, OUTCOME_SCORES } from '../scoring';

/* ///////////////////////////////////////////////// */

const CRAWLER_OVERRIDES = ['googlebot', 'bingbot'] as const;

/* ------- html directives ------- */

const robotsIndexing: CheckFactory = ({ metadata }) => {
  const value = textValue(metadata.crawler.robots);
  const { blocksIndexing, limitsDiscovery } = classifyDirectives(directivesOf(value));

  return createCheck({
    id: 'robots-indexing',
    name: 'Robots indexability',
    outcome: blocksIndexing ? 'fail' : limitsDiscovery ? 'warn' : 'pass',
    confidence: 1,
    value: value ?? 'index, follow (default)',
    description:
      'Evaluates whether robots directives allow the page to be indexed and discovered.',
    reason: blocksIndexing
      ? 'The robots directives explicitly prevent indexing.'
      : limitsDiscovery
        ? 'The page is indexable, but one or more directives limit links, snippets, or images.'
        : value
          ? 'The robots directives do not block indexing.'
          : 'No restrictive robots value was found, so index and follow are the defaults.',
    recommendation:
      'Remove noindex or restrictive directives from public pages that should appear fully in search results.',
    weight: 10,
  });
};

const crawlerOverrides: CheckFactory = ({ metadata }) => {
  const configured = CRAWLER_OVERRIDES.flatMap((name) => {
    const value = textValue(metadata.crawler[name]);
    return value ? [{ name, value, ...classifyDirectives(directivesOf(value)) }] : [];
  });

  const blocked = configured.filter((entry) => entry.blocksIndexing);
  const restricted = configured.filter((entry) => entry.limitsDiscovery);

  return createCheck({
    id: 'crawler-overrides',
    name: 'Crawler-specific directives',
    // No overrides declared means there is nothing to grade, not a free pass.
    outcome:
      configured.length === 0
        ? 'not-applicable'
        : blocked.length > 0
          ? 'fail'
          : restricted.length > 0
            ? 'warn'
            : 'pass',
    confidence: 1,
    value: configured.map(({ name, value }) => `${name}: ${value}`),
    description:
      'Checks whether Googlebot or Bingbot receives restrictions that differ from general crawler behavior.',
    reason:
      configured.length === 0
        ? 'No crawler-specific directives were declared.'
        : blocked.length > 0
          ? `${blocked.map(({ name }) => name).join(' and ')} is explicitly prevented from indexing the page.`
          : restricted.length > 0
            ? 'A crawler-specific directive limits discovery or search-result presentation.'
            : 'Crawler-specific directives do not prevent indexing.',
    recommendation:
      'Keep crawler-specific rules aligned with the intended public indexing policy and remove accidental restrictions.',
    weight: 4,
  });
};

/* ------- canonical ------- */

const canonicalUrl: CheckFactory = ({ context, metadata }) => {
  const canonical =
    textValue(metadata.general.url) ?? httpCanonicalValues(context, metadata.resolvedUrl)[0];
  const parsed = parseHttpUrl(canonical);

  const outcome: AnalysisOutcome = !canonical
    ? 'absent'
    : !parsed || parsed.hash
      ? 'fail'
      : parsed.protocol !== 'https:'
        ? 'warn'
        : 'pass';

  return createCheck({
    id: 'canonical-url',
    name: 'Canonical URL',
    outcome,
    confidence: 1,
    value: canonical ?? null,
    description:
      'Checks for a valid absolute canonical URL that identifies the preferred version of the page.',
    reason: !canonical
      ? 'No canonical URL is declared.'
      : !parsed
        ? 'The canonical value is not a valid HTTP or HTTPS URL.'
        : parsed.hash
          ? 'The canonical URL contains a fragment, which search engines generally do not support.'
          : parsed.protocol !== 'https:'
            ? 'The canonical URL uses HTTP instead of HTTPS.'
            : 'A valid absolute canonical URL is declared.',
    recommendation:
      'Declare one absolute, stable, fragment-free HTTPS canonical URL in HTML or an HTTP Link header.',
    weight: 8,
    source: metadata.general.url ? 'metadata' : 'http',
    evidence: canonical ? [`canonical: ${canonical}`] : [],
  });
};

const canonicalTarget: CheckFactory = ({ context, metadata }) => {
  const canonical = parseHttpUrl(
    metadata.general.url ?? httpCanonicalValues(context, metadata.resolvedUrl)[0],
  );
  const resolved = parseHttpUrl(metadata.resolvedUrl);
  const sameOrigin = !!canonical && !!resolved && canonical.origin === resolved.origin;
  const equivalent = compareUrl(canonical, resolved);

  const outcome: AnalysisOutcome = !canonical
    ? 'not-applicable'
    : !resolved
      ? 'unknown'
      : equivalent
        ? 'pass'
        : 'warn';

  return createCheck({
    id: 'canonical-target',
    name: 'Canonical alignment',
    outcome,
    // Cross-origin consolidation is a stronger signal than a path difference.
    score: outcome === 'warn' ? (sameOrigin ? 0.6 : 0.3) : OUTCOME_SCORES[outcome],
    dependsOn: 'canonical-url',
    value: canonical?.toString() ?? null,
    description: 'Compares the canonical target with the final URL reached after redirects.',
    reason: !canonical
      ? 'No canonical URL is available to compare.'
      : !resolved
        ? 'The fetched URL could not be parsed, so alignment cannot be verified.'
        : equivalent
          ? 'The canonical URL matches the fetched page URL.'
          : sameOrigin
            ? 'The canonical URL differs from the fetched URL; confirm that consolidation is intentional.'
            : 'The canonical URL points to a different origin; this may consolidate the page elsewhere.',
    recommendation:
      'Use a self-referencing canonical on the preferred page and keep internal links aligned with it.',
    weight: 4,
  });
};

/* ------- http headers ------- */

const httpRobots: CheckFactory = ({ context, metadata }) => {
  if (!context.http) {
    return null;
  }

  const value = context.http.headers['x-robots-tag'];
  const { blocksIndexing, limitsDiscovery } = classifyDirectives(headerDirectivesOf(value));
  const html = classifyDirectives(directivesOf(metadata.crawler.robots));

  // When the header only restates the HTML block, the defect belongs to the HTML
  // check; charging it twice would double-count one decision
  const duplicatesHtmlBlock = blocksIndexing && html.blocksIndexing;

  return createCheck({
    id: 'http-robots',
    name: 'HTTP robots directives',
    outcome:
      !value || duplicatesHtmlBlock
        ? 'not-applicable'
        : blocksIndexing
          ? 'fail'
          : limitsDiscovery
            ? 'warn'
            : 'pass',
    ...(duplicatesHtmlBlock ? { dependsOn: 'robots-indexing' } : {}),
    value: value ?? null,
    description:
      'Checks X-Robots-Tag response headers that can override or extend HTML directives.',
    reason: !value
      ? 'No X-Robots-Tag header is present.'
      : duplicatesHtmlBlock
        ? 'The header confirms the HTML noindex policy; it is reported without a second score penalty.'
        : blocksIndexing
          ? 'The X-Robots-Tag header prevents indexing.'
          : limitsDiscovery
            ? 'The X-Robots-Tag header restricts crawling or search-result presentation.'
            : 'The X-Robots-Tag header does not block indexing.',
    recommendation:
      'Remove restrictive X-Robots-Tag values from public pages and keep header and HTML policies aligned.',
    weight: 10,
    severity: 'critical',
    confidence: 1,
    source: 'http',
    evidence: value ? [`x-robots-tag: ${value}`] : [],
  });
};

const httpCanonical: CheckFactory = ({ context, metadata }) => {
  if (!context.http) {
    return null;
  }

  const values = httpCanonicalValues(context, metadata.resolvedUrl);
  const htmlCanonical = parseHttpUrl(metadata.general.url);
  const headerCanonical = parseHttpUrl(values[0]);
  const conflict =
    !!htmlCanonical && !!headerCanonical && !compareUrl(htmlCanonical, headerCanonical);
  const hasProblem = values.length > 1 || conflict || (values.length > 0 && !headerCanonical);

  return createCheck({
    id: 'http-canonical',
    name: 'HTTP canonical declaration',
    // A valid header earns its weight instead of only ever subtracting.
    outcome: values.length === 0 ? 'not-applicable' : hasProblem ? 'fail' : 'pass',
    value: values,
    numericValue: values.length,
    description:
      'Checks canonical Link response headers for validity, duplication, and conflicts with HTML.',
    reason:
      values.length === 0
        ? 'No canonical Link response header is present.'
        : values.length > 1
          ? 'Multiple canonical Link response headers were found.'
          : !headerCanonical
            ? 'The canonical Link response header contains an invalid URL.'
            : conflict
              ? 'The HTTP and HTML canonical declarations conflict.'
              : 'The HTTP canonical declaration is valid and agrees with HTML.',
    recommendation:
      'Declare one canonical target and keep HTTP Link and HTML canonical signals identical.',
    weight: 8,
    severity: 'critical',
    confidence: 1,
    source: 'http',
    evidence: values.map((value) => `canonical link: ${value}`),
  });
};

/* ------- deep probes ------- */

const robotsFilePolicy: CheckFactory = ({ context }) => {
  const robots = context.deep?.robots;

  if (!robots) {
    return null;
  }

  // A robots.txt we could not read leaves the policy unknown; scoring it would
  // penalize our own transport failure.
  const unavailable = !!robots.error || !!robots.timeout;

  return createCheck({
    id: 'robots-file-policy',
    name: 'robots.txt policy',
    outcome: unavailable ? 'unknown' : robots.allowed === false ? 'fail' : 'pass',
    value: robots.url,
    description: 'Checks whether robots.txt permits crawling of the analyzed URL.',
    reason: unavailable
      ? (robots.error ?? 'robots.txt could not be inspected.')
      : robots.allowed === false
        ? 'The applicable robots.txt group disallows crawling of this URL.'
        : robots.allowed === true
          ? 'The analyzed URL is allowed by the applicable robots.txt rules.'
          : 'No applicable robots.txt rule was found, so crawling is allowed by default.',
    recommendation:
      'Allow public indexable pages in robots.txt and use noindex, not robots.txt, when removal from search is intended.',
    weight: 8,
    severity: 'critical',
    confidence: 0.95,
    source: 'robots.txt',
    evidence: [
      `robots status: ${robots.status ?? 'unavailable'}`,
      `sitemaps declared: ${robots.sitemaps.length}`,
    ],
  });
};

const sitemapCanonical: CheckFactory = ({ context }) => {
  const sitemap = context.deep?.sitemap;

  if (!sitemap) {
    return null;
  }

  const unavailable =
    !!sitemap.timeout || !!sitemap.error || sitemap.containsCanonical === null;

  return createCheck({
    id: 'sitemap-canonical',
    name: 'Canonical in sitemap',
    outcome: unavailable ? 'unknown' : sitemap.containsCanonical ? 'pass' : 'warn',
    score: sitemap.containsCanonical ? 1 : 0.4,
    value: sitemap.url,
    numericValue: sitemap.inspected,
    description: 'Checks whether the canonical URL appears in the discovered XML sitemap.',
    reason: unavailable
      ? (sitemap.error ?? 'The sitemap could not be inspected completely.')
      : sitemap.containsCanonical
        ? 'The canonical URL appears in the sitemap.'
        : 'The canonical URL was not found in the inspected sitemap.',
    recommendation:
      'List canonical, indexable URLs in a maintained XML sitemap and declare it in robots.txt.',
    weight: 3,
    confidence: 0.9,
    source: 'sitemap',
    evidence: [
      `sitemap status: ${sitemap.status ?? 'unavailable'}`,
      `documents inspected: ${sitemap.inspected ?? 0}`,
    ],
  });
};

/* ///////////////////////////////////////////////// */

export const indexingChecks: CheckFactory[] = [
  robotsIndexing,
  crawlerOverrides,
  canonicalUrl,
  canonicalTarget,
  httpRobots,
  httpCanonical,
  robotsFilePolicy,
  sitemapCanonical,
];
