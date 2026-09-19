import type { AnalysisOutcome } from '../../schemas';
import type { CheckFactory } from './types';

import { compareUrl, parseHttpUrl } from '@/shared/url';

import { characterLength, clamp, coveredBy, pluralize, textValue } from '../helpers';
import { ANALYSIS_LIMITS } from '../limits';
import { createCheck, outcomeForScore, rampScore } from '../scoring';

/* ///////////////////////////////////////////////// */

// hreflang accepts a language tag or the special "x-default" fallback
const HREFLANG = /^(?:x-default|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i;

/* ------- page url ------- */

const httpsUrl: CheckFactory = ({ metadata }) => {
  const secure = parseHttpUrl(metadata.resolvedUrl)?.protocol === 'https:';

  return createCheck({
    id: 'https-url',
    name: 'HTTPS delivery',
    outcome: secure ? 'pass' : 'fail',
    confidence: 1,
    value: metadata.resolvedUrl,
    description: 'Checks whether the final page URL uses HTTPS.',
    reason: secure
      ? 'The page is delivered over HTTPS.'
      : 'The final page URL does not use HTTPS.',
    recommendation:
      'Serve the page over HTTPS and redirect all HTTP variants to the HTTPS canonical.',
    weight: 6,
  });
};

const urlStructure: CheckFactory = ({ metadata }) => {
  const url = parseHttpUrl(metadata.resolvedUrl);
  const length = characterLength(metadata.resolvedUrl);
  const parameters = url ? [...url.searchParams].length : 0;
  const hasFragment = !!url?.hash;

  const lengthScore = rampScore(length, {
    errorBelow: 0,
    minimum: 0,
    maximum: ANALYSIS_LIMITS.url.maximum,
    errorAbove: 200,
  });
  const parameterScore = rampScore(parameters, {
    errorBelow: 0,
    minimum: 0,
    maximum: ANALYSIS_LIMITS.queryParameters.maximum,
    errorAbove: 8,
  });
  const score = url ? Math.min(lengthScore, parameterScore) * (hasFragment ? 0.8 : 1) : 0;

  return createCheck({
    id: 'url-structure',
    name: 'URL structure',
    outcome: url ? outcomeForScore(score) : 'fail',
    score,
    confidence: 0.9,
    value: metadata.resolvedUrl,
    numericValue: length,
    description: 'Evaluates URL validity, length, fragments, and query-string complexity.',
    reason: !url
      ? 'The resolved URL is invalid.'
      : score === 1
        ? `The URL is concise and readable (${length} characters and ${parameters} query parameters).`
        : `The URL could be simplified (${length} characters and ${parameters} query parameters${hasFragment ? ', with a fragment' : ''}).`,
    recommendation:
      'Use a short, stable, descriptive path and remove unnecessary query parameters or fragments from indexable URLs.',
    limits: {
      unit: 'characters',
      maximum: ANALYSIS_LIMITS.url.maximum,
      ideal: `Up to ${ANALYSIS_LIMITS.url.maximum} characters and ${ANALYSIS_LIMITS.queryParameters.maximum} query parameters`,
    },
    weight: 4,
  });
};

const socialUrlAlignment: CheckFactory = ({ metadata }) => {
  const preferred = parseHttpUrl(metadata.general.url) ?? parseHttpUrl(metadata.resolvedUrl);
  const social = parseHttpUrl(metadata.opengraph.url);
  const aligned = compareUrl(preferred, social);

  return createCheck({
    id: 'social-url-alignment',
    name: 'Open Graph URL alignment',
    ...(social
      ? { outcome: aligned ? ('pass' as const) : ('warn' as const) }
      : coveredBy('open-graph-required')),
    value: social?.toString() ?? null,
    description: 'Compares og:url with the canonical or final page URL.',
    reason: !social
      ? 'No valid og:url is available; the absence is scored by the required fields check.'
      : aligned
        ? 'The Open Graph URL matches the preferred page URL.'
        : 'The Open Graph URL differs from the preferred page URL and may split sharing identity.',
    recommendation:
      'Keep og:url aligned with the canonical URL unless the difference is intentional.',
    weight: 4,
  });
};

/* ------- localization ------- */

const alternateUrls: CheckFactory = ({ metadata }) => {
  const alternates = (metadata.general.alternates ?? []).filter((alternate) => {
    return !!alternate.hrefLang;
  });

  const locales = metadata.opengraph.localeAlternate ?? [];
  const languages = alternates.map(
    (alternate) => alternate.hrefLang?.toLocaleLowerCase() ?? '',
  );

  const invalid = alternates.filter((alternate) => {
    return !parseHttpUrl(alternate.href) || !HREFLANG.test(alternate.hrefLang ?? '');
  });

  const duplicated = new Set(languages).size !== languages.length;
  const declaresLocalization = alternates.length > 0 || locales.length > 0;
  const score =
    alternates.length === 0
      ? 0
      : clamp((alternates.length - invalid.length) / alternates.length) *
        (duplicated ? 0.5 : 1);

  const outcome: AnalysisOutcome = !declaresLocalization
    ? 'not-applicable'
    : alternates.length === 0
      ? 'absent'
      : outcomeForScore(score);

  return createCheck({
    id: 'alternate-urls',
    name: 'Alternate language URLs',
    outcome,
    score,
    confidence: 0.95,
    value: alternates.map((alternate) => `${alternate.hrefLang}: ${alternate.href}`),
    numericValue: alternates.length,
    description:
      'Checks declared hreflang alternates for valid, unique language and URL pairs.',
    reason: !declaresLocalization
      ? 'The page does not declare localized variants, so hreflang does not apply.'
      : alternates.length === 0
        ? 'Open Graph alternate locales exist, but no hreflang URL alternates were found.'
        : invalid.length > 0 || duplicated
          ? 'One or more hreflang declarations has an invalid URL/language or a duplicate language.'
          : `${alternates.length} valid hreflang alternate ${pluralize(alternates.length, 'declaration')} found.`,
    recommendation:
      'For localized pages, declare valid reciprocal hreflang URLs and include x-default when appropriate.',
    weight: 3,
  });
};

/* ------- http ------- */

const redirectChain: CheckFactory = ({ context, metadata }) => {
  const redirects = context.http?.redirects;

  if (!redirects) {
    return null;
  }

  const canonical = parseHttpUrl(textValue(metadata.general.url));
  const resolved = parseHttpUrl(metadata.resolvedUrl);
  const aligned = !canonical || compareUrl(canonical, resolved);
  const score =
    redirects.length === 0 ? 1 : clamp(1 - (redirects.length - 1) * 0.35) * (aligned ? 1 : 0.5);

  return createCheck({
    id: 'redirect-chain',
    name: 'Redirect chain',
    // No redirect at all is the ideal outcome and earns its weight.
    outcome: outcomeForScore(score),
    score,
    value: redirects,
    numericValue: redirects.length,
    description:
      'Checks redirect depth and whether the final destination matches the canonical URL.',
    reason:
      redirects.length === 0
        ? 'The requested URL did not redirect.'
        : redirects.length > 1
          ? `The request followed ${redirects.length} redirects before reaching the page.`
          : aligned
            ? 'A single redirect reaches the canonical URL.'
            : 'The redirect destination and canonical URL are not aligned.',
    recommendation:
      'Redirect obsolete URLs directly to the canonical destination and avoid multi-hop redirect chains.',
    weight: 4,
    confidence: 1,
    source: 'http',
    evidence: redirects,
  });
};

/* ------- deep probes ------- */

const alternateReciprocity: CheckFactory = ({ context }) => {
  const alternates = context.deep?.alternates;

  if (!alternates) {
    return null;
  }

  const graded = alternates.filter((alternate) => !alternate.timeout && !alternate.truncated);
  const failed = graded.filter((alternate) => !!alternate.error || alternate.status !== 200);
  const missingReciprocal = graded.filter((alternate) => alternate.reciprocal === false);
  const canonicalMismatch = graded.filter((alternate) => {
    return alternate.canonical !== undefined && !compareUrl(alternate.canonical, alternate.url);
  });

  const broken = new Set([...failed, ...missingReciprocal]).size;
  const score =
    graded.length === 0
      ? 0
      : clamp(1 - broken / graded.length - (canonicalMismatch.length / graded.length) * 0.4);

  const outcome: AnalysisOutcome =
    alternates.length === 0
      ? 'not-applicable'
      : graded.length === 0
        ? 'unknown'
        : outcomeForScore(score);

  return createCheck({
    id: 'alternate-reciprocity',
    name: 'Hreflang reciprocity',
    outcome,
    score,
    dependsOn: 'alternate-urls',
    value: alternates.map((alternate) => `${alternate.hrefLang}: ${alternate.url}`),
    numericValue: alternates.length,
    description:
      'Visits declared language alternates to confirm availability, self-canonicalization, and reciprocal hreflang links.',
    reason:
      alternates.length === 0
        ? 'No hreflang alternates were declared.'
        : graded.length === 0
          ? 'No alternate page could be inspected within the analysis budget.'
          : failed.length > 0
            ? `${failed.length} alternate ${pluralize(failed.length, 'page')} could not be validated.`
            : missingReciprocal.length > 0
              ? `${missingReciprocal.length} alternate ${pluralize(missingReciprocal.length, 'page does', 'pages do')} not link back to this page.`
              : canonicalMismatch.length > 0
                ? `${canonicalMismatch.length} alternate ${pluralize(canonicalMismatch.length, 'page is', 'pages are')} not self-canonical.`
                : 'All inspected alternate pages are reachable, reciprocal, and self-canonical.',
    recommendation:
      'Make every localized page self-canonical and declare the complete reciprocal hreflang set.',
    weight: 7,
    confidence: 0.95,
    source: 'remote-resource',
    evidence: alternates.map(
      (alternate) =>
        `${alternate.url}: status ${alternate.status ?? 'failed'}, reciprocal ${alternate.reciprocal ?? 'unknown'}`,
    ),
  });
};

/* ///////////////////////////////////////////////// */

export const urlChecks: CheckFactory[] = [
  httpsUrl,
  urlStructure,
  socialUrlAlignment,
  alternateUrls,
  redirectChain,
  alternateReciprocity,
];
