import type { AnalysisOutcome } from '../../schemas/analysis';
import type { CheckFactory } from './types';

import { parseHttpUrl } from '@/shared/url';

import { characterLength, clamp, coveredBy, pluralize, textValue } from '../helpers';
import { ANALYSIS_LIMITS } from '../limits';
import { createCheck, outcomeForScore, rampScore } from '../scoring';

/* ///////////////////////////////////////////////// */

const TWITTER_CARD_TYPES = new Set(['summary', 'summary_large_image', 'app', 'player']);

// Below this size a social image renders as a thumbnail instead of a large preview
const UNDERSIZED_SOCIAL_IMAGE = { width: 600, height: 315 } as const;

/* ------- open graph ------- */

const openGraph: CheckFactory = ({ metadata }) => {
  const og = metadata.opengraph;
  const required = {
    'og:title': textValue(og.title),
    'og:type': textValue(og.type),
    'og:image': textValue(og.image),
    'og:url': textValue(og.url),
  };

  const properties = Object.keys(required) as Array<keyof typeof required>;
  const present = properties.filter((property) => !!required[property]);
  const missing = properties.filter((property) => !required[property]);
  const requiredScore = present.length / properties.length;

  const description = textValue(og.description);
  const descriptionLength = description ? characterLength(description) : 0;
  const descriptionScore = description
    ? rampScore(descriptionLength, {
        errorBelow: 10,
        minimum: 30,
        maximum: 200,
        errorAbove: 320,
      })
    : 0;

  const image = textValue(og.image) ?? textValue(og.images?.[0]?.url);
  const parsedImage = parseHttpUrl(image);

  const firstImage = og.images?.[0];
  const imageAlt = textValue(firstImage?.alt ?? og.imageAlt);
  const width = firstImage?.width;
  const height = firstImage?.height;
  const hasDimensions = width !== undefined && height !== undefined;
  const dimensionsAreStrong =
    hasDimensions &&
    width >= ANALYSIS_LIMITS.socialImage.minimumWidth &&
    height >= ANALYSIS_LIMITS.socialImage.minimumHeight;

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
          : missing.length === 0
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
        minimum: ANALYSIS_LIMITS.socialImage.minimumWidth,
        ideal: 'At least 1200×630 pixels with descriptive alternative text',
      },
      weight: 4,
    }),
  ];
};

/* ------- twitter ------- */

const twitter: CheckFactory = ({ metadata }) => {
  const card = textValue(metadata.twitter.card)?.toLocaleLowerCase();
  const validCard = !!card && TWITTER_CARD_TYPES.has(card);

  // X falls back to Open Graph for every field the card leaves out
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

/* ------- identity ------- */

const socialIdentity: CheckFactory = ({ metadata }) => {
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

/* ------- deep probes ------- */

const remoteResourceIntegrity: CheckFactory = ({ context }) => {
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
  const undersized = graded.filter((resource) => {
    return (
      resource.kind !== 'favicon' &&
      resource.width !== undefined &&
      resource.height !== undefined &&
      (resource.width < UNDERSIZED_SOCIAL_IMAGE.width ||
        resource.height < UNDERSIZED_SOCIAL_IMAGE.height)
    );
  });

  const broken = new Set([...failed, ...invalidType]).size;
  const score =
    graded.length === 0
      ? 0
      : clamp(1 - broken / graded.length - (undersized.length / graded.length) * 0.3);

  const outcome: AnalysisOutcome =
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
            ? `${failed.length} declared ${pluralize(failed.length, 'resource is', 'resources are')} unavailable or invalid.`
            : invalidType.length > 0
              ? `${invalidType.length} ${pluralize(invalidType.length, 'resource does', 'resources do')} not return an image MIME type.`
              : undersized.length > 0
                ? `${undersized.length} social ${pluralize(undersized.length, 'image is', 'images are')} smaller than 600×315 pixels.`
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

/* ///////////////////////////////////////////////// */

export const socialChecks: CheckFactory[] = [
  openGraph,
  twitter,
  socialIdentity,
  remoteResourceIntegrity,
];
