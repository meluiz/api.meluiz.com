import type { CheckFactory } from './types';

import { parseHttpUrl } from '@/shared/url';

import { canonicalCharset, clamp, pluralize, textValue } from '../helpers';
import { createCheck, outcomeForScore } from '../scoring';

/* ///////////////////////////////////////////////// */

const UTF8 = 'utf-8';

// A favicon at least this large (or scalable) stays sharp on high-density screens
const STRONG_ICON_SIZE = 48;

// "initial-scale=1" or "initial-scale=1.0", followed by a separator or the end
const INITIAL_SCALE_ONE = /initial-scale\s*=\s*1(?:\.0+)?\s*(?:[,;]|$)/;

/* ///////////////////////////////////////////////// */

/** Inline data:image icons are valid declarations, not broken URLs. */
const isValidIconHref = (href: string | undefined) => {
  return !!parseHttpUrl(href) || /^data:image\//i.test(href ?? '');
};

const isScalableIcon = (icon: { href?: string; type?: string }) => {
  const href = icon.href?.toLowerCase() ?? '';

  return (
    !!icon.type?.toLocaleLowerCase().includes('svg') ||
    href.endsWith('.svg') ||
    href.startsWith('data:image/svg+xml')
  );
};

/** Largest square size declared in a sizes attribute; "any" means scalable. */
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

/* ------- document ------- */

const charset: CheckFactory = ({ metadata }) => {
  const declared = textValue(metadata.general.charset)?.toLocaleLowerCase();
  // Compared by canonical name, so "utf8" and "UTF-8" both count as UTF-8
  const isUtf8 = canonicalCharset(declared) === UTF8;

  return createCheck({
    id: 'charset',
    name: 'Character encoding',
    outcome: !declared ? 'absent' : isUtf8 ? 'pass' : 'warn',
    confidence: 1,
    value: declared ?? null,
    description: 'Checks whether the page declares a predictable modern character encoding.',
    reason: !declared
      ? 'No character encoding declaration was found in metadata.'
      : isUtf8
        ? 'The document declares UTF-8 encoding.'
        : `The document declares ${declared}; UTF-8 is the interoperable modern default.`,
    recommendation: 'Declare <meta charset="utf-8"> near the beginning of the document head.',
    weight: 3,
  });
};

const viewport: CheckFactory = ({ metadata }) => {
  const value = textValue(metadata.general.viewport)?.toLocaleLowerCase();
  const hasDeviceWidth = !!value && /width\s*=\s*device-width/.test(value);
  const hasInitialScale = !!value && INITIAL_SCALE_ONE.test(value);
  const configured = hasDeviceWidth && hasInitialScale;
  const score = configured ? 1 : hasDeviceWidth || hasInitialScale ? 0.6 : 0;

  return createCheck({
    id: 'viewport',
    name: 'Mobile viewport',
    // Outcome follows the score, so a viewport with neither setting reports an
    // error instead of a warning that earns nothing
    outcome: !value ? 'absent' : outcomeForScore(score),
    score,
    confidence: 1,
    value: value ?? null,
    description: 'Checks the viewport metadata needed for a predictable mobile layout.',
    reason: !value
      ? 'No viewport metadata was found.'
      : configured
        ? 'The viewport is configured for device width and a 1:1 initial scale.'
        : 'The viewport does not include both width=device-width and initial-scale=1.',
    recommendation:
      'Use width=device-width, initial-scale=1 unless the interface has a specific need.',
    weight: 4,
  });
};

/* ------- icons and appearance ------- */

const favicon: CheckFactory = ({ metadata }) => {
  const touchIcons = [
    ...(metadata.mobile.appleTouchIcons ?? []),
    ...(metadata.mobile.appleTouchIconsPrecomposed ?? []),
  ];

  // Touch icons carry no type attribute, so only rel="icon" links contribute one
  const icons = [
    ...(metadata.general.favicons ?? []).map(({ href, sizes, type }) => ({
      href,
      sizes,
      type,
    })),
    ...touchIcons.map(({ href, sizes }) => ({ href, sizes, type: undefined })),
  ];

  const invalid = icons.filter((icon) => !isValidIconHref(icon.href));
  const hasScalableIcon = icons.some(isScalableIcon);
  const largest = icons.reduce((size, icon) => Math.max(size, iconSize(icon.sizes)), 0);
  const hasStrongSize = hasScalableIcon || largest >= STRONG_ICON_SIZE;

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
          ? `${invalid.length} favicon ${pluralize(invalid.length, 'declaration has', 'declarations have')} an invalid URL.`
          : hasStrongSize
            ? 'A valid scalable or at least 48×48 favicon is declared.'
            : 'Favicon URLs are valid, but no scalable or at least 48×48 size is declared.',
    recommendation:
      'Declare a stable square favicon URL and provide an SVG or a raster size larger than 48×48 pixels.',
    limits: { unit: 'pixels', minimum: 48, ideal: 'Square and larger than 48×48 pixels' },
    weight: 4,
  });
};

const webAppManifest: CheckFactory = ({ metadata }) => {
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

const browserAppearance: CheckFactory = ({ metadata }) => {
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

/* ------- document structure and http ------- */

const metadataStructure: CheckFactory = ({ context }) => {
  const document = context.document;

  if (!document) {
    return null;
  }

  const misplaced = document.metadataOutsideHead;
  const duplicated = [
    document.titleCount > 1 ? `${document.titleCount} title elements` : null,
    document.descriptionCount > 1 ? `${document.descriptionCount} meta descriptions` : null,
    document.canonicalCount > 1 ? `${document.canonicalCount} canonical links` : null,
  ].filter((value): value is string => value !== null);

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
          ? `${misplaced.length} metadata ${pluralize(misplaced.length, 'declaration is', 'declarations are')} outside the head.`
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

const httpMetadataConsistency: CheckFactory = ({ context, metadata }) => {
  const http = context.http;

  if (!http) {
    return null;
  }

  const contentType = http.headers['content-type'] ?? '';
  const headerCharset = canonicalCharset(/charset=([^;]+)/i.exec(contentType)?.[1]);
  const documentCharset = canonicalCharset(textValue(metadata.general.charset));
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

/* ///////////////////////////////////////////////// */

export const technicalChecks: CheckFactory[] = [
  charset,
  viewport,
  favicon,
  webAppManifest,
  browserAppearance,
  metadataStructure,
  httpMetadataConsistency,
];
