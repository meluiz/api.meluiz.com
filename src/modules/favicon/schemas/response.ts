/*
 * The response is an image, not JSON, so there is no Zod schema to derive it
 * from: this is the OpenAPI shape of what the routes return.
 */

import { FALLBACK_SIZE } from '../fallback';

/* ///////////////////////////////////////////////// */

const BINARY = { schema: { type: 'string' as const, format: 'binary' } };

const EXAMPLE_HASH = 'aHR0cHM6Ly9tZWx1aXouY29tLw';

/* ------- headers ------- */

/** Where the icon came from. The placeholder answers `fallback`. */
const sourceHeader = (values: string[], description: string) => ({
  'X-Favicon-Source': {
    description,
    schema: { type: 'string' as const, enum: values },
  },
});

/*
 * Handed back so a caller that looked a site up by URL can embed the icon by
 * hash afterwards, without encoding the URL itself.
 */
const HASH_HEADER = {
  'X-Favicon-Hash': {
    description:
      'The site as a base64url hash: the {hash} of the asset route (getFaviconAsset), a stable and cacheable address for this same icon. The URL is normalized first, so every spelling of a site gives one hash.',
    schema: { type: 'string' as const, example: EXAMPLE_HASH },
  },
};

/* ------- responses ------- */

export const IMAGE_RESPONSE = {
  description: 'The favicon: PNG resized to fit the requested size, or the original SVG or ICO',
  headers: {
    ...sourceHeader(
      ['html', 'manifest', 'conventional', 'google'],
      'Where the icon came from: html, manifest, conventional or google',
    ),
    ...HASH_HEADER,
  },
  content: {
    'image/png': BINARY,
    'image/svg+xml': BINARY,
    'image/x-icon': BINARY,
  },
};

/*
 * A 404 carries the placeholder icon rather than the usual error JSON: the
 * status reports the missing favicon, the body keeps an <img> from breaking.
 * No hash header, because there is no icon of the site's to address.
 */
export const FALLBACK_RESPONSE = {
  description: `No favicon could be found: a ${FALLBACK_SIZE}px grey globe placeholder, as Google's favicon service answers for an unknown domain`,
  headers: sourceHeader(['fallback'], "Always fallback: this is not the site's own icon"),
  content: { 'image/png': BINARY },
};
