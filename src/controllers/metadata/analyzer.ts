import type { MetadataAnalysisContext } from './analysis/context';
import type {
  Metadata,
  MetadataAnalysis,
  MetadataAnalysisCategoryId,
  MetadataAnalysisCheck,
  MetadataAnalysisOutcome,
} from './types';

import {
  getTokensOf,
  getWordsOf,
  isKeywordStuffed,
  normalizeText,
  textSimilarity,
} from '#util/text';
import { compareUrl, parseHttpUrl } from '#util/url';

import {
  aggregateScore,
  CATEGORY_WEIGHTS,
  coverageOf,
  createCategory,
  createCheck,
  OUTCOME_SCORES,
  outcomeForScore,
  rampScore,
  resolveCheckDependencies,
  summarizeChecks,
  sumPoints,
} from './analysis/scoring';

/* ///////////////////////////////////////////////// */

export const METADATA_ANALYSIS_LIMITS = {
  title: {
    minimum: 30,
    maximum: 60,
  },
  description: {
    minimum: 70,
    maximum: 160,
  },
  url: {
    maximum: 100,
  },
  queryParameters: {
    maximum: 3,
  },
  socialImage: {
    minimumWidth: 1200,
    minimumHeight: 630,
  },
} as const;

const GENERIC_TITLES = new Set(
  [
    'document',
    'home',
    'homepage',
    'início',
    'new page',
    'page',
    'página',
    'página inicial',
    'sem título',
    'test',
    'untitled',
    'welcome',
  ].map(normalizeText),
);

const TWITTER_CARD_TYPES = new Set(['summary', 'summary_large_image', 'app', 'player']);

/* ///////////////////////////////////////////////// */

const textValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const characterLength = (value: string) => {
  return [...value].length;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const directivesOf = (...values: Array<string | undefined>) => {
  return values
    .flatMap(
      (value) =>
        value
          ?.toLocaleLowerCase()
          .replace(/:\s+/g, ':')
          .split(/[\s,]+/) ?? [],
    )
    .filter(Boolean);
};

const httpCanonicalValues = (context: MetadataAnalysisContext) => {
  const link = context.http?.headers.link;

  return link
    ? [...link.matchAll(/<([^>]+)>\s*;[^,]*\brel=["']?canonical["']?/gi)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      )
    : [];
};

const coveredBy = (parent: string) => {
  return { outcome: 'not-applicable' as const, dependsOn: parent };
};

/* ///////////////////////////////////////////////// */

const lengthCheck = (options: {
  id: string;
  name: string;
  value: string | undefined;
  description: string;
  recommendation: string;
  minimum: number;
  maximum: number;
  errorBelow: number;
  errorAbove: number;
  weight: number;
}) => {
  const value = textValue(options.value);
  const length = value ? characterLength(value) : 0;
  const score = value
    ? rampScore(length, {
        errorBelow: options.errorBelow,
        minimum: options.minimum,
        maximum: options.maximum,
        errorAbove: options.errorAbove,
      })
    : 0;

  const outcome: MetadataAnalysisOutcome = value ? outcomeForScore(score) : 'absent';

  return createCheck({
    id: options.id,
    name: options.name,
    outcome,
    score,
    // Presence is measured exactly; the ideal range is only a guideline.
    confidence: value ? 0.85 : 1,
    value: value ?? null,
    numericValue: length,
    description: options.description,
    reason: !value
      ? `${options.name} is missing or empty.`
      : score === 1
        ? `${options.name} is within the recommended range.`
        : `${options.name} has ${length} characters and is outside the recommended ${options.minimum}–${options.maximum} range.`,
    recommendation: options.recommendation,
    limits: {
      unit: 'characters',
      minimum: options.minimum,
      maximum: options.maximum,
      ideal: `${options.minimum}–${options.maximum} characters`,
    },
    weight: options.weight,
  });
};

const basicSeoChecks = (metadata: Metadata) => {
  return [
    lengthCheck({
      id: 'title-length',
      name: 'Page title',
      value: metadata.general.title,
      description:
        'Checks whether the HTML title is present, concise, and likely to display clearly in search results.',
      recommendation:
        'Write a unique, descriptive title that leads with the page topic and uses branding concisely.',
      minimum: METADATA_ANALYSIS_LIMITS.title.minimum,
      maximum: METADATA_ANALYSIS_LIMITS.title.maximum,
      errorBelow: 15,
      errorAbove: 80,
      weight: 10,
    }),
    lengthCheck({
      id: 'description-length',
      name: 'Meta description',
      value: metadata.general.description,
      description:
        'Checks whether the meta description can provide a useful and sufficiently detailed search snippet.',
      recommendation:
        'Summarize the page accurately in one or two useful sentences, with a clear reason to visit.',
      minimum: METADATA_ANALYSIS_LIMITS.description.minimum,
      maximum: METADATA_ANALYSIS_LIMITS.description.maximum,
      errorBelow: 30,
      errorAbove: 220,
      weight: 8,
    }),
  ];
};

const titleQualityCheck = (metadata: Metadata) => {
  const title = textValue(metadata.general.title);
  const normalized = title ? normalizeText(title) : '';
  const generic = !!title && GENERIC_TITLES.has(normalized);
  const stuffed = !!title && isKeywordStuffed(title);

  return createCheck({
    id: 'title-quality',
    name: 'Title quality',
    // The absence of a title is charged once, by Page title.
    ...(title
      ? { outcome: generic ? 'fail' : stuffed ? ('warn' as const) : ('pass' as const) }
      : coveredBy('title-length')),
    dependsOn: 'title-length',
    confidence: 0.72,
    value: title ?? null,
    description: 'Evaluates whether the title is specific rather than generic or repetitive.',
    reason: !title
      ? 'Title quality cannot be evaluated without a title.'
      : generic
        ? 'The title is generic and does not identify the page topic.'
        : stuffed
          ? 'The title repeats the same term or phrase heavily and may look keyword-stuffed.'
          : 'The title contains descriptive text without obvious keyword repetition.',
    recommendation:
      'Use natural, page-specific wording and remove generic labels or repeated keyword variants.',
    weight: 4,
  });
};

const descriptionQualityCheck = (metadata: Metadata) => {
  const title = textValue(metadata.general.title);
  const description = textValue(metadata.general.description);
  const duplicatesTitle =
    !!description && !!title && normalizeText(title) === normalizeText(description);
  const tooShort = !!description && getWordsOf(description).length < 6;
  const stuffed = !!description && isKeywordStuffed(description);

  const outcome: MetadataAnalysisOutcome = duplicatesTitle
    ? 'fail'
    : tooShort || stuffed
      ? 'warn'
      : 'pass';

  return createCheck({
    id: 'description-quality',
    name: 'Description quality',
    ...(description ? { outcome } : coveredBy('description-length')),
    dependsOn: 'description-length',
    confidence: 0.72,
    value: description ?? null,
    description:
      'Evaluates whether the description is informative, distinct, and naturally written.',
    reason: !description
      ? 'Description quality cannot be evaluated without a description.'
      : duplicatesTitle
        ? 'The description duplicates the title instead of summarizing the page.'
        : tooShort
          ? 'The description contains too little context to explain the page clearly.'
          : stuffed
            ? 'The description repeats terms heavily and may read as keyword stuffing.'
            : 'The description contains distinct, descriptive content.',
    recommendation:
      'Describe the page in natural language, avoid duplicating the title, and remove repeated keywords.',
    weight: 4,
  });
};

const languageCheck = (metadata: Metadata) => {
  const language = textValue(metadata.general.language);
  const isValid = language ? /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) : false;

  return createCheck({
    id: 'document-language',
    name: 'Document language',
    outcome: !language ? 'absent' : isValid ? 'pass' : 'fail',
    confidence: 1,
    value: language ?? null,
    description:
      'Checks the HTML lang value used by search engines, browsers, and assistive technologies.',
    reason: !language
      ? 'The document does not declare a language.'
      : isValid
        ? 'The document declares a valid language tag.'
        : 'The declared language is not a valid BCP 47-style language tag.',
    recommendation: 'Set a valid lang value on the html element, such as en, pt-BR, or es.',
    weight: 3,
  });
};

const structuredDataCheck = (metadata: Metadata) => {
  const structuredData = metadata.general.structuredData;
  const count = structuredData?.count ?? 0;
  const invalid = structuredData?.invalid ?? 0;
  const issues = structuredData?.issues ?? [];
  const semanticErrors = issues.filter((issue) => issue.severity === 'error');
  const semanticWarnings = issues.filter((issue) => issue.severity === 'warning');
  const score =
    count === 0
      ? 0
      : clamp(1 - (invalid + semanticErrors.length) / count - semanticWarnings.length * 0.1);

  return createCheck({
    id: 'structured-data',
    name: 'Structured data',
    // JSON-LD is an optional enhancement: its absence leaves the score alone
    // rather than being reported as a warning that never counted.
    outcome: count === 0 ? 'not-applicable' : outcomeForScore(score),
    score,
    value: structuredData?.types ?? [],
    numericValue: count,
    description:
      'Checks for parseable JSON-LD that can help eligible pages appear with enhanced search features.',
    reason:
      count === 0
        ? 'No JSON-LD structured data was found; it is optional and is not scored when absent.'
        : invalid > 0
          ? `${invalid} of ${count} JSON-LD blocks could not be parsed.`
          : semanticErrors.length > 0
            ? `${semanticErrors.length} semantic structured-data error${semanticErrors.length === 1 ? '' : 's'} found.`
            : semanticWarnings.length > 0
              ? `${semanticWarnings.length} structured-data improvement${semanticWarnings.length === 1 ? '' : 's'} found.`
              : `${count} valid JSON-LD block${count === 1 ? '' : 's'} found.`,
    recommendation:
      invalid > 0
        ? 'Fix invalid JSON-LD and validate each applicable schema with a structured-data testing tool.'
        : 'Use relevant, accurate schema.org JSON-LD when the page is eligible for a rich result.',
    limits: {
      unit: 'items',
      minimum: 1,
    },
    weight: 3,
    confidence: 0.88,
    evidence: issues.map((issue) => issue.message),
  });
};

const keywordsCheck = (metadata: Metadata) => {
  const keywords = textValue(metadata.general.keywords);

  return createCheck({
    id: 'meta-keywords',
    name: 'Meta keywords usage',
    outcome: keywords ? 'warn' : 'pass',
    value: keywords ?? null,
    description:
      'Detects the obsolete meta keywords field, which modern major search engines do not use for ranking.',
    reason: keywords
      ? 'A meta keywords value is present but does not provide modern SEO value.'
      : 'No obsolete meta keywords dependency was detected.',
    recommendation:
      'Invest effort in descriptive content, titles, internal links, and structured data instead of meta keywords.',
    weight: 1,
  });
};

const articleCheck = (metadata: Metadata) => {
  const isArticle = metadata.opengraph.type?.toLocaleLowerCase() === 'article';
  const authors = metadata.opengraph.articleAuthor ?? [];
  const published = textValue(metadata.opengraph.articlePublishedTime);
  const validPublished = published ? !Number.isNaN(Date.parse(published)) : false;
  const missing = [
    authors.length === 0 ? 'article:author' : null,
    !published ? 'article:published_time' : null,
  ].filter((value): value is string => value !== null);

  const score = published && !validPublished ? 0 : (2 - missing.length) / 2;

  return createCheck({
    id: 'article-metadata',
    name: 'Article metadata',
    // Emitted for every page so `notApplicable` stays a meaningful count
    // instead of the check silently disappearing from the report.
    outcome: isArticle ? outcomeForScore(score) : 'not-applicable',
    score,
    value: [
      ...authors.map((author) => `author: ${author}`),
      ...(published ? [`published: ${published}`] : []),
    ],
    numericValue: 2 - missing.length,
    description: 'Checks authorship and publication time for pages declared as articles.',
    reason: !isArticle
      ? 'The page is not declared as an article, so article metadata does not apply.'
      : published && !validPublished
        ? 'The article publication time is not a valid date.'
        : missing.length > 0
          ? `Recommended article fields are missing: ${missing.join(', ')}.`
          : 'The article includes authorship and a valid publication time.',
    recommendation:
      'Provide accurate article:author and ISO 8601 article:published_time values for article pages.',
    limits: { unit: 'items', minimum: 2 },
    weight: 3,
  });
};

const robotsCheck = (metadata: Metadata) => {
  const value = textValue(metadata.crawler.robots ?? metadata.general.robots);
  const directives = directivesOf(value);
  const blocksIndexing = directives.includes('noindex') || directives.includes('none');
  const limitsDiscovery =
    directives.includes('nofollow') ||
    directives.includes('nosnippet') ||
    directives.includes('noimageindex') ||
    directives.includes('max-snippet:0');

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

const crawlerOverridesCheck = (metadata: Metadata) => {
  const entries = [
    ['googlebot', textValue(metadata.crawler.googlebot)],
    ['bingbot', textValue(metadata.crawler.bingbot)],
  ] as const;

  const configured: Array<readonly [string, string]> = entries.flatMap(([name, value]) => {
    return value ? [[name, value] as const] : [];
  });

  const blocked = configured.filter(([, value]) => {
    const directives = directivesOf(value);
    return directives.includes('noindex') || directives.includes('none');
  });

  const restricted = configured.filter(([, value]) => {
    const directives = directivesOf(value);
    return directives.includes('nofollow') || directives.includes('nosnippet');
  });

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
    value: configured.map(([name, value]) => `${name}: ${value}`),
    description:
      'Checks whether Googlebot or Bingbot receives restrictions that differ from general crawler behavior.',
    reason:
      configured.length === 0
        ? 'No crawler-specific directives were declared.'
        : blocked.length > 0
          ? `${blocked.map(([name]) => name).join(' and ')} is explicitly prevented from indexing the page.`
          : restricted.length > 0
            ? 'A crawler-specific directive limits discovery or search-result presentation.'
            : 'Crawler-specific directives do not prevent indexing.',
    recommendation:
      'Keep crawler-specific rules aligned with the intended public indexing policy and remove accidental restrictions.',
    weight: 4,
  });
};

const canonicalCheck = (metadata: Metadata, context: MetadataAnalysisContext) => {
  const canonical = textValue(metadata.general.url) ?? httpCanonicalValues(context)[0];
  const parsed = parseHttpUrl(canonical);

  const outcome: MetadataAnalysisOutcome = !canonical
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

const canonicalTargetCheck = (metadata: Metadata, context: MetadataAnalysisContext) => {
  const canonical = parseHttpUrl(metadata.general.url ?? httpCanonicalValues(context)[0]);
  const resolved = parseHttpUrl(metadata.resolvedUrl);
  const sameOrigin = !!canonical && !!resolved && canonical.origin === resolved.origin;
  const equivalent = compareUrl(canonical, resolved);

  const outcome: MetadataAnalysisOutcome = !canonical
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

const openGraphChecks = (metadata: Metadata) => {
  const openGraph = metadata.opengraph;
  const required = {
    'og:title': textValue(openGraph.title),
    'og:type': textValue(openGraph.type),
    'og:image': textValue(openGraph.image),
    'og:url': textValue(openGraph.url),
  };

  const present = Object.entries(required)
    .filter(([, value]) => !!value)
    .map(([property]) => property);

  const missing = Object.keys(required).filter(
    (property) => !required[property as keyof typeof required],
  );

  const requiredScore = present.length / 4;

  const description = textValue(openGraph.description);
  const descriptionLength = description ? characterLength(description) : 0;
  const descriptionScore = description
    ? rampScore(descriptionLength, {
        errorBelow: 10,
        minimum: 30,
        maximum: 200,
        errorAbove: 320,
      })
    : 0;

  const image = textValue(openGraph.image) ?? textValue(openGraph.images?.[0]?.url);
  const parsedImage = parseHttpUrl(image);

  const firstImage = openGraph.images?.[0];
  const imageAlt = textValue(firstImage?.alt ?? openGraph.imageAlt);
  const width = firstImage?.width;
  const height = firstImage?.height;
  const hasDimensions = width !== undefined && height !== undefined;
  const dimensionsAreStrong =
    hasDimensions &&
    width >= METADATA_ANALYSIS_LIMITS.socialImage.minimumWidth &&
    height >= METADATA_ANALYSIS_LIMITS.socialImage.minimumHeight;

  // Partial credit across the three independent qualities of a preview image.
  const detailsScore =
    (imageAlt ? 0.4 : 0) + (hasDimensions ? 0.3 : 0) + (dimensionsAreStrong ? 0.3 : 0);

  return [
    createCheck({
      id: 'open-graph-required',
      name: 'Open Graph required fields',
      outcome:
        present.length === 0
          ? 'absent'
          : present.length === 4
            ? 'pass'
            : outcomeForScore(requiredScore),
      score: requiredScore,
      confidence: 1,
      value: present,
      numericValue: present.length,
      description: 'Checks the four properties required by the Open Graph protocol.',
      reason:
        missing.length === 0
          ? 'All required Open Graph properties are present.'
          : `Required Open Graph properties are missing: ${missing.join(', ')}.`,
      recommendation: 'Provide og:title, og:type, og:image, and an absolute canonical og:url.',
      limits: { unit: 'items', minimum: 4, ideal: 'All 4 required properties' },
      weight: 8,
    }),
    createCheck({
      id: 'open-graph-description',
      name: 'Open Graph description',
      outcome: description ? outcomeForScore(descriptionScore) : 'absent',
      score: descriptionScore,
      confidence: description ? 0.85 : 1,
      dependsOn: 'open-graph-required',
      value: description ?? null,
      numericValue: descriptionLength,
      description: 'Checks the optional social description used in rich link previews.',
      reason: !description
        ? 'No og:description is declared.'
        : descriptionScore === 1
          ? 'The Open Graph description has a useful preview length.'
          : `The Open Graph description has ${descriptionLength} characters and may be too sparse or verbose.`,
      recommendation:
        'Add a concise one- or two-sentence og:description tailored to social sharing.',
      limits: { unit: 'characters', minimum: 30, maximum: 200 },
      weight: 4,
    }),
    createCheck({
      id: 'open-graph-image-url',
      name: 'Open Graph image URL',
      // Presence of og:image is scored by the required-fields check; this one
      // only grades the URL once there is a URL to grade.
      ...(image
        ? {
            outcome: !parsedImage
              ? ('fail' as const)
              : parsedImage.protocol === 'https:'
                ? ('pass' as const)
                : ('warn' as const),
          }
        : coveredBy('open-graph-required')),
      confidence: 1,
      value: image ?? null,
      description: 'Checks whether the primary social image has a valid, secure absolute URL.',
      reason: !image
        ? 'No Open Graph image was found; the absence is scored by the required fields check.'
        : !parsedImage
          ? 'The Open Graph image is not a valid HTTP or HTTPS URL.'
          : parsedImage.protocol !== 'https:'
            ? 'The Open Graph image uses HTTP and may be blocked in secure previews.'
            : 'The Open Graph image uses a valid HTTPS URL.',
      recommendation: 'Use a stable, crawlable HTTPS URL for og:image.',
      weight: 5,
    }),
    createCheck({
      id: 'open-graph-image-details',
      name: 'Open Graph image details',
      outcome: image ? outcomeForScore(detailsScore) : 'not-applicable',
      score: detailsScore,
      dependsOn: 'open-graph-image-url',
      value: [
        ...(imageAlt ? [`alt: ${imageAlt}`] : []),
        ...(hasDimensions ? [`dimensions: ${width}x${height}`] : []),
      ],
      numericValue: width,
      description:
        'Checks image alternative text and declared dimensions for accessible, stable previews.',
      reason: !image
        ? 'Image details cannot be evaluated because og:image is missing.'
        : !imageAlt && !hasDimensions
          ? 'The Open Graph image has neither alternative text nor declared dimensions.'
          : !imageAlt
            ? 'The Open Graph image is missing og:image:alt.'
            : !hasDimensions
              ? 'The Open Graph image dimensions are not declared.'
              : !dimensionsAreStrong
                ? `The declared ${width}x${height} image is below the recommended large-preview dimensions.`
                : 'The Open Graph image has alternative text and strong preview dimensions.',
      recommendation:
        'Add descriptive og:image:alt plus og:image:width and og:image:height; prefer a 1200×630 image.',
      limits: {
        unit: 'pixels',
        minimum: METADATA_ANALYSIS_LIMITS.socialImage.minimumWidth,
        ideal: 'At least 1200×630 pixels with descriptive alternative text',
      },
      weight: 4,
    }),
  ];
};

const twitterChecks = (metadata: Metadata) => {
  const card = textValue(metadata.twitter.card)?.toLocaleLowerCase();
  const validCard = card ? TWITTER_CARD_TYPES.has(card) : false;

  const title = textValue(metadata.twitter.title) ?? textValue(metadata.opengraph.title);
  const description =
    textValue(metadata.twitter.description) ?? textValue(metadata.opengraph.description);

  const image = textValue(metadata.twitter.image) ?? textValue(metadata.opengraph.image);
  const imageAlt =
    textValue(metadata.twitter.imageAlt) ?? textValue(metadata.opengraph.imageAlt);

  const missing = [
    !title ? 'title' : null,
    !description ? 'description' : null,
    !image ? 'image' : null,
  ].filter((value): value is string => value !== null);

  const previewScore = ((3 - missing.length) / 3) * (image && !imageAlt ? 0.85 : 1);

  return [
    createCheck({
      id: 'twitter-card',
      name: 'Twitter Card type',
      outcome: !card ? 'absent' : validCard ? 'pass' : 'fail',
      // Platforms fall back to Open Graph, so a missing card costs half its
      // weight rather than all of it.
      score: !card ? 0.5 : validCard ? 1 : 0,
      confidence: 1,
      value: card ?? null,
      description: 'Checks whether a supported Twitter Card type is declared for X previews.',
      reason: !card
        ? 'No twitter:card value is declared; previews fall back to Open Graph.'
        : validCard
          ? 'A supported Twitter Card type is declared.'
          : 'The twitter:card value is not a supported card type.',
      recommendation:
        'Declare summary_large_image for rich editorial previews, or another valid card type.',
      weight: 5,
    }),
    createCheck({
      id: 'twitter-preview',
      name: 'Twitter Card content',
      outcome: card ? outcomeForScore(previewScore) : 'not-applicable',
      score: previewScore,
      dependsOn: 'twitter-card',
      value: [
        ...(title ? ['title'] : []),
        ...(description ? ['description'] : []),
        ...(image ? ['image'] : []),
        ...(imageAlt ? ['image alt'] : []),
      ],
      numericValue: 3 - missing.length,
      description:
        'Checks the title, description, image, and image text available to an X card, including Open Graph fallbacks.',
      reason: !card
        ? 'No card type is declared, so there is no card content to evaluate.'
        : missing.length > 0
          ? `Preview content is missing: ${missing.join(', ')}.`
          : image && !imageAlt
            ? 'Core preview content is available, but the image has no alternative text.'
            : 'The card has complete preview content and image alternative text.',
      recommendation:
        'Provide card-specific content or complete Open Graph fallbacks, including twitter:image:alt.',
      limits: { unit: 'items', minimum: 3, ideal: 'Title, description, image, and image alt' },
      weight: 5,
    }),
  ];
};

const socialIdentityCheck = (metadata: Metadata) => {
  const values = [
    textValue(metadata.opengraph.siteName),
    textValue(metadata.twitter.site),
    textValue(metadata.twitter.creator),
    textValue(metadata.opengraph.facebookAppId),
    ...(metadata.opengraph.facebookAdmins ?? []).map(textValue),
  ].filter((value): value is string => !!value);

  return createCheck({
    id: 'social-identity',
    name: 'Social identity',
    // Optional context: declaring it earns credit, omitting it is not scored.
    outcome: values.length > 0 ? 'pass' : 'not-applicable',
    value: values,
    numericValue: values.length,
    description:
      'Checks for site, creator, or platform identifiers that add context to shared links.',
    reason:
      values.length > 0
        ? 'At least one social or site identity is declared.'
        : 'No social or site identity is declared; this is optional and is not scored.',
    recommendation:
      'Add og:site_name and the relevant social account or platform identifiers for your publishing setup.',
    weight: 2,
  });
};

const httpsCheck = (metadata: Metadata) => {
  const resolved = parseHttpUrl(metadata.resolvedUrl);

  return createCheck({
    id: 'https-url',
    name: 'HTTPS delivery',
    outcome: resolved?.protocol === 'https:' ? 'pass' : 'fail',
    confidence: 1,
    value: metadata.resolvedUrl,
    description: 'Checks whether the final page URL uses HTTPS.',
    reason:
      resolved?.protocol === 'https:'
        ? 'The page is delivered over HTTPS.'
        : 'The final page URL does not use HTTPS.',
    recommendation:
      'Serve the page over HTTPS and redirect all HTTP variants to the HTTPS canonical.',
    weight: 6,
  });
};

const urlStructureCheck = (metadata: Metadata) => {
  const url = parseHttpUrl(metadata.resolvedUrl);
  const length = characterLength(metadata.resolvedUrl);
  const parameters = url ? [...url.searchParams].length : 0;
  const hasFragment = !!url?.hash;

  const lengthScore = rampScore(length, {
    errorBelow: 0,
    minimum: 0,
    maximum: METADATA_ANALYSIS_LIMITS.url.maximum,
    errorAbove: 200,
  });
  const parameterScore = rampScore(parameters, {
    errorBelow: 0,
    minimum: 0,
    maximum: METADATA_ANALYSIS_LIMITS.queryParameters.maximum,
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
      maximum: METADATA_ANALYSIS_LIMITS.url.maximum,
      ideal: `Up to ${METADATA_ANALYSIS_LIMITS.url.maximum} characters and ${METADATA_ANALYSIS_LIMITS.queryParameters.maximum} query parameters`,
    },
    weight: 4,
  });
};

const socialUrlAlignmentCheck = (metadata: Metadata) => {
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

const alternatesCheck = (metadata: Metadata) => {
  const alternates = (metadata.general.alternates ?? []).filter((alternate) => {
    return !!alternate.hrefLang;
  });

  const locales = metadata.opengraph.localeAlternate ?? [];
  const languagePattern = /^(?:x-default|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i;
  const languages = alternates.map(
    (alternate) => alternate.hrefLang?.toLocaleLowerCase() ?? '',
  );

  const invalid = alternates.filter((alternate) => {
    return !parseHttpUrl(alternate.href) || !languagePattern.test(alternate.hrefLang ?? '');
  });

  const duplicated = languages.some((language, index) => languages.indexOf(language) !== index);
  const declaresLocalization = alternates.length > 0 || locales.length > 0;
  const score =
    alternates.length === 0
      ? 0
      : clamp((alternates.length - invalid.length) / alternates.length) *
        (duplicated ? 0.5 : 1);

  const outcome: MetadataAnalysisOutcome = !declaresLocalization
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
          : `${alternates.length} valid hreflang alternate declaration${alternates.length === 1 ? '' : 's'} found.`,
    recommendation:
      'For localized pages, declare valid reciprocal hreflang URLs and include x-default when appropriate.',
    weight: 3,
  });
};

const charsetCheck = (metadata: Metadata) => {
  const charset = textValue(metadata.general.charset)?.toLocaleLowerCase();
  const isUtf8 = charset === 'utf-8' || charset === 'utf8';

  return createCheck({
    id: 'charset',
    name: 'Character encoding',
    outcome: !charset ? 'absent' : isUtf8 ? 'pass' : 'warn',
    confidence: 1,
    value: charset ?? null,
    description: 'Checks whether the page declares a predictable modern character encoding.',
    reason: !charset
      ? 'No character encoding declaration was found in metadata.'
      : isUtf8
        ? 'The document declares UTF-8 encoding.'
        : `The document declares ${charset}; UTF-8 is the interoperable modern default.`,
    recommendation: 'Declare <meta charset="utf-8"> near the beginning of the document head.',
    weight: 3,
  });
};

const viewportCheck = (metadata: Metadata) => {
  const viewport = textValue(metadata.general.viewport)?.toLocaleLowerCase();
  const hasDeviceWidth = !!viewport?.includes('width=device-width');
  const hasInitialScale = !!viewport && /initial-scale\s*=\s*1(?:\.0+)?(?:,|$)/.test(viewport);
  const configured = hasDeviceWidth && hasInitialScale;

  return createCheck({
    id: 'viewport',
    name: 'Mobile viewport',
    outcome: !viewport ? 'absent' : configured ? 'pass' : 'warn',
    score: configured ? 1 : hasDeviceWidth || hasInitialScale ? 0.6 : 0,
    confidence: 1,
    value: viewport ?? null,
    description: 'Checks the viewport metadata needed for a predictable mobile layout.',
    reason: !viewport
      ? 'No viewport metadata was found.'
      : configured
        ? 'The viewport is configured for device width and a 1:1 initial scale.'
        : 'The viewport does not include both width=device-width and initial-scale=1.',
    recommendation:
      'Use width=device-width, initial-scale=1 unless the interface has a specific need.',
    weight: 4,
  });
};

const iconSize = (sizes: string | undefined) => {
  if (!sizes) {
    return 0;
  }

  if (/\bany\b/i.test(sizes)) {
    return Number.POSITIVE_INFINITY;
  }

  return sizes.split(/\s+/).reduce((largest, size) => {
    const match = /^(\d+)x(\d+)$/i.exec(size);

    if (!match) {
      return largest;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    return width === height ? Math.max(largest, width) : largest;
  }, 0);
};

const faviconCheck = (metadata: Metadata) => {
  const icons = [
    ...(metadata.general.favicons ?? []),
    ...(metadata.mobile.appleTouchIcons ?? []).map((icon) => ({ ...icon, type: undefined })),
    ...(metadata.mobile.appleTouchIconsPrecomposed ?? []).map((icon) => ({
      ...icon,
      type: undefined,
    })),
  ];

  const invalid = icons.filter((icon) => !parseHttpUrl(icon.href));
  const hasScalableIcon = icons.some((icon) => {
    return (
      icon.type?.toLocaleLowerCase().includes('svg') ||
      icon.href?.toLowerCase().endsWith('.svg')
    );
  });
  const largest = icons.reduce((size, icon) => Math.max(size, iconSize(icon.sizes)), 0);
  const hasStrongSize = hasScalableIcon || largest >= 48;

  const score =
    icons.length === 0
      ? 0.2
      : clamp((icons.length - invalid.length) / icons.length) * (hasStrongSize ? 1 : 0.6);

  return createCheck({
    id: 'favicon',
    name: 'Favicon',
    outcome: icons.length === 0 ? 'absent' : outcomeForScore(score),
    score,
    confidence: 0.95,
    value: icons.flatMap((icon) => (icon.href ? [icon.href] : [])),
    numericValue: Number.isFinite(largest) ? largest : undefined,
    description: 'Checks favicon discovery, URL validity, and declared square image size.',
    reason:
      icons.length === 0
        ? 'No favicon declaration was found.'
        : invalid.length > 0
          ? `${invalid.length} favicon declaration${invalid.length === 1 ? ' has' : 's have'} an invalid URL.`
          : hasStrongSize
            ? 'A valid scalable or at least 48×48 favicon is declared.'
            : 'Favicon URLs are valid, but no scalable or at least 48×48 size is declared.',
    recommendation:
      'Declare a stable square favicon URL and provide an SVG or a raster size larger than 48×48 pixels.',
    limits: { unit: 'pixels', minimum: 48, ideal: 'Square and larger than 48×48 pixels' },
    weight: 4,
  });
};

const manifestCheck = (metadata: Metadata) => {
  const manifest = textValue(metadata.general.manifest);
  const parsed = parseHttpUrl(manifest);

  return createCheck({
    id: 'web-app-manifest',
    name: 'Web app manifest',
    outcome: !manifest
      ? 'not-applicable'
      : !parsed
        ? 'fail'
        : parsed.protocol === 'https:'
          ? 'pass'
          : 'warn',
    confidence: 1,
    value: manifest ?? null,
    description:
      'Checks the optional manifest link used for installable and application-like experiences.',
    reason: !manifest
      ? 'No web app manifest is declared; this optional enhancement is not scored when absent.'
      : !parsed
        ? 'The manifest URL is invalid.'
        : parsed.protocol === 'https:'
          ? 'A valid HTTPS manifest URL is declared.'
          : 'The manifest URL does not use HTTPS.',
    recommendation:
      'If the site provides an installable experience, link a valid HTTPS web app manifest.',
    weight: 1,
  });
};

const appearanceCheck = (metadata: Metadata) => {
  const colors = (metadata.general.themeColors ?? [])
    .map((color) => textValue(color.value))
    .filter((value): value is string => !!value);
  const colorScheme = textValue(metadata.general.colorScheme);
  const declared = colors.length > 0 || !!colorScheme;

  return createCheck({
    id: 'browser-appearance',
    name: 'Browser appearance metadata',
    outcome: declared ? 'pass' : 'not-applicable',
    value: [...colors, ...(colorScheme ? [`color-scheme: ${colorScheme}`] : [])],
    description:
      'Checks optional theme color and color-scheme metadata for consistent browser presentation.',
    reason: declared
      ? 'At least one browser appearance hint is declared.'
      : 'No theme-color or color-scheme metadata was found; this optional hint is not scored.',
    recommendation:
      'Declare theme-color and color-scheme values that match the interface and supported themes.',
    weight: 1,
  });
};

const documentMetadataCheck = (
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const document = context.document;

  if (!document) {
    return null;
  }

  const duplicated = [
    document.titleCount > 1 ? `${document.titleCount} title elements` : null,
    document.descriptionCount > 1 ? `${document.descriptionCount} meta descriptions` : null,
    document.canonicalCount > 1 ? `${document.canonicalCount} canonical links` : null,
  ].filter((value): value is string => value !== null);
  const misplaced = document.metadataOutsideHead;

  return createCheck({
    id: 'metadata-structure',
    name: 'Metadata structure',
    outcome: duplicated.length > 0 ? 'fail' : misplaced.length > 0 ? 'warn' : 'pass',
    score: duplicated.length > 0 ? 0 : misplaced.length > 0 ? 0.6 : 1,
    value: [...duplicated, ...misplaced.map((item) => `outside head: ${item}`)],
    description:
      'Checks for duplicate title, description, and canonical declarations and metadata outside the document head.',
    reason:
      duplicated.length > 0
        ? `Conflicting declarations were found: ${duplicated.join(', ')}.`
        : misplaced.length > 0
          ? `${misplaced.length} metadata declaration${misplaced.length === 1 ? ' is' : 's are'} outside the head.`
          : 'No duplicate core metadata or misplaced declarations were found.',
    recommendation:
      'Keep one title, one meta description, and one canonical declaration inside a valid document head.',
    weight: 7,
    severity: 'high',
    confidence: 1,
    source: 'html',
    evidence: [
      `title elements: ${document.titleCount}`,
      `description elements: ${document.descriptionCount}`,
      `canonical elements: ${document.canonicalCount}`,
      `metadata outside head: ${misplaced.length}`,
    ],
  });
};

const titleHeadingCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const title = textValue(metadata.general.title);
  const document = context.document;

  if (!document) {
    return null;
  }

  const heading = document.h1s[0];
  const comparable =
    !!title && !!heading && getTokensOf(title).length > 0 && getTokensOf(heading).length > 0;
  const similarity = comparable ? textSimilarity(title, heading) : 0;
  const score = rampScore(similarity, {
    errorBelow: 0.1,
    minimum: 0.5,
    maximum: 1,
    errorAbove: 2,
  });

  const outcome: MetadataAnalysisOutcome = !title
    ? 'not-applicable'
    : !heading
      ? 'absent'
      : // Neither side produced comparable tokens; the heuristic has nothing to
        // say, which is not the same as the page being wrong.
        !comparable
        ? 'unknown'
        : outcomeForScore(score);

  return createCheck({
    id: 'title-heading-alignment',
    name: 'Title and main heading alignment',
    outcome,
    score: outcome === 'absent' ? 0.3 : score,
    dependsOn: 'title-length',
    value: heading ?? null,
    numericValue: Math.round(similarity * 100),
    description:
      'Compares the page title with the primary H1 to identify potentially unrelated or unclear page labeling.',
    reason: !title
      ? 'There is no title to compare with the main heading.'
      : !heading
        ? 'No H1 was found to compare with the page title.'
        : !comparable
          ? 'The title and H1 did not produce comparable tokens, so alignment was not scored.'
          : `The title and H1 share ${Math.round(similarity * 100)}% of their terms.`,
    recommendation:
      'Use one descriptive H1 whose subject clearly aligns with the page title without requiring identical wording.',
    weight: 4,
    confidence: 0.65,
    source: 'html',
    evidence: [...(title ? [`title: ${title}`] : []), ...(heading ? [`h1: ${heading}`] : [])],
  });
};

const contentLanguageCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const declared = textValue(metadata.general.language)?.split('-')[0]?.toLocaleLowerCase();
  const detected = context.document?.detectedLanguage;

  if (!context.document) {
    return null;
  }

  const matches = !!declared && !!detected && declared === detected.code;
  const outcome: MetadataAnalysisOutcome = !detected
    ? // Not enough textual evidence: excluded instead of scored as a warning.
      'unknown'
    : !declared
      ? 'not-applicable'
      : matches
        ? 'pass'
        : 'fail';

  return createCheck({
    id: 'content-language-alignment',
    name: 'Declared and detected language',
    outcome,
    dependsOn: 'document-language',
    value: detected?.code ?? null,
    numericValue: detected ? Math.round(detected.confidence * 100) : undefined,
    description:
      'Uses a lightweight language heuristic to compare visible content with the HTML language declaration.',
    reason: !detected
      ? 'There was not enough textual evidence to infer the page language reliably.'
      : !declared
        ? 'The content language was inferred, but the document does not declare a language.'
        : matches
          ? `The inferred ${detected.code} content matches the declared ${declared} language.`
          : `The inferred ${detected.code} content differs from the declared ${declared} language.`,
    recommendation:
      'Confirm the content language and set the html lang value to the matching BCP 47 language tag.',
    weight: 3,
    confidence: detected?.confidence ?? 0.4,
    source: 'html',
    evidence: [
      ...(declared ? [`declared language: ${declared}`] : []),
      ...(detected
        ? [`detected language: ${detected.code} (${Math.round(detected.confidence * 100)}%)`]
        : []),
    ],
  });
};

const contentImageAltCheck = (
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const images = context.document?.images;

  if (!images) {
    return null;
  }

  const missing = images.filter((image) => image.alt === undefined).length;
  const score = images.length === 0 ? 0 : clamp(1 - missing / images.length);

  return createCheck({
    id: 'content-image-alternatives',
    name: 'Content image alternatives',
    outcome: images.length === 0 ? 'not-applicable' : outcomeForScore(score),
    score,
    value: images.flatMap((image) => (image.src && image.alt === undefined ? [image.src] : [])),
    numericValue: missing,
    description:
      'Checks whether content images declare alt attributes; empty alt remains valid for decorative images.',
    reason:
      images.length === 0
        ? 'The document has no content images to evaluate.'
        : missing === 0
          ? `All ${images.length} content images declare alt attributes.`
          : `${missing} of ${images.length} images do not declare an alt attribute.`,
    recommendation:
      'Add concise descriptive alt text to informative images and an empty alt attribute to decorative images.',
    weight: 4,
    confidence: 0.95,
    source: 'html',
    evidence: [`images: ${images.length}`, `missing alt attributes: ${missing}`],
  });
};

const httpRobotsCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const value = context.http?.headers['x-robots-tag'];

  if (!context.http) {
    return null;
  }

  const directives = directivesOf(value);
  const blocked = directives.includes('noindex') || directives.includes('none');
  const restricted = directives.includes('nofollow') || directives.includes('nosnippet');
  const htmlDirectives = directivesOf(metadata.crawler.robots ?? metadata.general.robots);
  const duplicatesHtmlBlock =
    blocked && (htmlDirectives.includes('noindex') || htmlDirectives.includes('none'));

  return createCheck({
    id: 'http-robots',
    name: 'HTTP robots directives',
    // When the header only restates the HTML policy, the defect belongs to the
    // HTML check; charging it twice would double-count one decision.
    outcome:
      !value || duplicatesHtmlBlock
        ? 'not-applicable'
        : blocked
          ? 'fail'
          : restricted
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
        : blocked
          ? 'The X-Robots-Tag header prevents indexing.'
          : restricted
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

const httpCanonicalCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  if (!context.http) {
    return null;
  }

  const values = httpCanonicalValues(context);
  const htmlCanonical = parseHttpUrl(metadata.general.url);
  const headerCanonical = parseHttpUrl(values[0]);
  const conflict =
    !!htmlCanonical && !!headerCanonical && !compareUrl(htmlCanonical, headerCanonical);
  const hasProblem = values.length > 1 || conflict || (values.length > 0 && !headerCanonical);

  return createCheck({
    id: 'http-canonical',
    name: 'HTTP canonical declaration',
    // A valid header now earns its weight instead of only ever subtracting.
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

const httpConsistencyCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const http = context.http;

  if (!http) {
    return null;
  }

  const contentType = http.headers['content-type'] ?? '';
  const headerCharset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLocaleLowerCase();
  const documentCharset = textValue(metadata.general.charset)?.toLocaleLowerCase();
  const contentLanguage = http.headers['content-language']
    ?.split(',')[0]
    ?.trim()
    .toLocaleLowerCase();
  const documentLanguage = textValue(metadata.general.language)?.toLocaleLowerCase();
  const charsetConflict =
    !!headerCharset && !!documentCharset && headerCharset !== documentCharset;
  const languageConflict =
    !!contentLanguage &&
    !!documentLanguage &&
    contentLanguage.split('-')[0] !== documentLanguage.split('-')[0];
  const conflicts = Number(charsetConflict) + Number(languageConflict);

  return createCheck({
    id: 'http-metadata-consistency',
    name: 'HTTP and HTML metadata consistency',
    outcome: conflicts > 0 ? 'warn' : 'pass',
    score: conflicts > 0 ? clamp(1 - conflicts * 0.5) : 1,
    value: [
      ...(headerCharset ? [`header charset: ${headerCharset}`] : []),
      ...(documentCharset ? [`document charset: ${documentCharset}`] : []),
      ...(contentLanguage ? [`content-language: ${contentLanguage}`] : []),
      ...(documentLanguage ? [`document language: ${documentLanguage}`] : []),
    ],
    description: 'Compares character encoding and language signals from HTTP and HTML.',
    reason:
      conflicts > 0
        ? 'The response headers and HTML contain conflicting encoding or language signals.'
        : 'No conflicts were found between response headers and HTML metadata.',
    recommendation:
      'Serve consistent UTF-8 and language declarations in both HTTP headers and the HTML document.',
    weight: 4,
    confidence: 0.95,
    source: 'http',
    evidence: [`status: ${http.status}`, `content-type: ${contentType || 'missing'}`],
  });
};

const redirectCheck = (
  metadata: Metadata,
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const redirects = context.http?.redirects;

  if (!redirects) {
    return null;
  }

  const canonical = parseHttpUrl(metadata.general.url);
  const resolved = parseHttpUrl(metadata.resolvedUrl);
  const aligned = !canonical || compareUrl(canonical, resolved);
  const score =
    redirects.length === 0 ? 1 : clamp(1 - (redirects.length - 1) * 0.35) * (aligned ? 1 : 0.5);

  return createCheck({
    id: 'redirect-chain',
    name: 'Redirect chain',
    // No redirect at all is the ideal outcome and now earns its weight.
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

const remoteResourcesCheck = (
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
  const resources = context.deep?.resources;

  if (!resources) {
    return null;
  }

  // Requests that ran out of time say nothing about the metadata; they are
  // dropped from the grade instead of being counted as broken assets.
  const timedOut = resources.filter((resource) => resource.timeout);
  const graded = resources.filter((resource) => !resource.timeout);
  const failed = graded.filter((resource) => !!resource.error || resource.status !== 200);
  const invalidType = graded.filter(
    (resource) => resource.contentType && !resource.contentType.startsWith('image/'),
  );
  const socialImages = graded.filter((resource) => resource.kind !== 'favicon');
  const undersized = socialImages.filter((resource) => {
    return (
      resource.width !== undefined &&
      resource.height !== undefined &&
      (resource.width < 600 || resource.height < 315)
    );
  });

  const broken = new Set([...failed, ...invalidType]).size;
  const score =
    graded.length === 0
      ? 0
      : clamp(1 - broken / graded.length - (undersized.length / graded.length) * 0.3);

  const outcome: MetadataAnalysisOutcome =
    resources.length === 0
      ? 'not-applicable'
      : graded.length === 0
        ? 'unknown'
        : outcomeForScore(score);

  return createCheck({
    id: 'remote-resource-integrity',
    name: 'Remote metadata resources',
    outcome,
    score,
    value: resources.map((resource) => resource.url),
    numericValue: resources.length,
    description:
      'Fetches declared social images and favicons to verify availability, MIME type, byte size, and actual dimensions.',
    reason:
      resources.length === 0
        ? 'No remote metadata resources were available to inspect.'
        : graded.length === 0
          ? `All ${timedOut.length} declared resources timed out, so their integrity is unknown.`
          : failed.length > 0
            ? `${failed.length} declared resource${failed.length === 1 ? ' is' : 's are'} unavailable or invalid.`
            : invalidType.length > 0
              ? `${invalidType.length} resource${invalidType.length === 1 ? ' does' : 's do'} not return an image MIME type.`
              : undersized.length > 0
                ? `${undersized.length} social image${undersized.length === 1 ? ' is' : 's are'} smaller than 600×315 pixels.`
                : 'All inspected resources are available and have valid image responses.',
    recommendation:
      'Keep metadata assets publicly accessible over HTTPS and use high-resolution social images with correct MIME types.',
    weight: 7,
    confidence: 0.98,
    source: 'remote-resource',
    evidence: resources.map((resource) => {
      const dimensions =
        resource.width && resource.height ? `, ${resource.width}x${resource.height}` : '';
      return `${resource.kind}: ${resource.status ?? 'failed'}, ${resource.contentType ?? 'unknown type'}${dimensions}`;
    }),
  });
};

const robotsFileCheck = (context: MetadataAnalysisContext): MetadataAnalysisCheck | null => {
  const robots = context.deep?.robots;

  if (!robots) {
    return null;
  }

  // A robots.txt we could not read leaves the policy unknown; scoring it as a
  // warning would penalize our own transport failure.
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

const sitemapCheck = (context: MetadataAnalysisContext): MetadataAnalysisCheck | null => {
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

const alternateReciprocityCheck = (
  context: MetadataAnalysisContext,
): MetadataAnalysisCheck | null => {
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

  const outcome: MetadataAnalysisOutcome =
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
            ? `${failed.length} alternate page${failed.length === 1 ? ' could' : 's could'} not be validated.`
            : missingReciprocal.length > 0
              ? `${missingReciprocal.length} alternate page${missingReciprocal.length === 1 ? ' does' : 's do'} not link back to this page.`
              : canonicalMismatch.length > 0
                ? `${canonicalMismatch.length} alternate page${canonicalMismatch.length === 1 ? ' is' : 's are'} not self-canonical.`
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

const compact = (checks: Array<MetadataAnalysisCheck | null>) => {
  return checks.filter((check): check is MetadataAnalysisCheck => check !== null);
};

export const analyzeMetadata = (
  metadata: Metadata,
  context: MetadataAnalysisContext = { mode: 'quick' },
): MetadataAnalysis => {
  const definitions = [
    {
      id: 'basic-seo' as const,
      name: 'Basic SEO',
      description: 'Core metadata used to identify and summarize the page in search results.',
      checks: basicSeoChecks(metadata),
    },
    {
      id: 'indexing' as const,
      name: 'Indexing',
      description:
        'Crawler directives and canonical signals that control discovery and indexing.',
      checks: compact([
        robotsCheck(metadata),
        crawlerOverridesCheck(metadata),
        canonicalCheck(metadata, context),
        canonicalTargetCheck(metadata, context),
        httpRobotsCheck(metadata, context),
        httpCanonicalCheck(metadata, context),
        robotsFileCheck(context),
        sitemapCheck(context),
      ]),
    },
    {
      id: 'content' as const,
      name: 'Content',
      description: 'Content quality, language, authorship, and machine-readable meaning.',
      checks: compact([
        titleQualityCheck(metadata),
        descriptionQualityCheck(metadata),
        languageCheck(metadata),
        structuredDataCheck(metadata),
        keywordsCheck(metadata),
        articleCheck(metadata),
        titleHeadingCheck(metadata, context),
        contentLanguageCheck(metadata, context),
        contentImageAltCheck(context),
      ]),
    },
    {
      id: 'social' as const,
      name: 'Social and Open Graph',
      description: 'Metadata used to create accurate and accessible social sharing previews.',
      checks: compact([
        ...openGraphChecks(metadata),
        ...twitterChecks(metadata),
        socialIdentityCheck(metadata),
        remoteResourcesCheck(context),
      ]),
    },
    {
      id: 'urls' as const,
      name: 'URLs',
      description: 'Security, readability, consistency, and localized URL declarations.',
      checks: compact([
        httpsCheck(metadata),
        urlStructureCheck(metadata),
        socialUrlAlignmentCheck(metadata),
        alternatesCheck(metadata),
        redirectCheck(metadata, context),
        alternateReciprocityCheck(context),
      ]),
    },
    {
      id: 'technical' as const,
      name: 'Technical metadata',
      description: 'Encoding, mobile presentation, icons, and application metadata.',
      checks: compact([
        charsetCheck(metadata),
        viewportCheck(metadata),
        faviconCheck(metadata),
        manifestCheck(metadata),
        appearanceCheck(metadata),
        documentMetadataCheck(context),
        httpConsistencyCheck(metadata, context),
      ]),
    },
  ];

  // Dependencies span categories, so they are resolved over the flat list
  // before categories are scored.
  const resolved = resolveCheckDependencies(definitions.flatMap((entry) => entry.checks));
  const byId = new Map(resolved.map((check) => [check.id, check]));

  const categories = definitions.map((entry) =>
    createCategory({
      ...entry,
      checks: entry.checks.map((check) => byId.get(check.id) ?? check),
    }),
  );

  const checks = categories.flatMap((category) => category.checks);
  const points = sumPoints(categories);
  const scoreFor = (...ids: MetadataAnalysisCategoryId[]) => {
    return aggregateScore(categories.filter((category) => ids.includes(category.id)));
  };

  return {
    requestedUrl: metadata.requestedUrl,
    resolvedUrl: metadata.resolvedUrl,
    mode: context.mode,
    score: aggregateScore(categories),
    scores: {
      technical: scoreFor('basic-seo', 'urls', 'technical'),
      indexability: scoreFor('indexing'),
      content: scoreFor('content'),
      social: scoreFor('social'),
    },
    summary: summarizeChecks(checks),
    scoring: {
      version: '3.0',
      method: 'weighted-category',
      outcomeScores: OUTCOME_SCORES,
      categoryWeights: CATEGORY_WEIGHTS,
      points,
      coverage: coverageOf(checks),
      skipped: checks.filter((check) => !check.applicable).map((check) => check.id),
    },
    categories,
  };
};
