/*
 * The response is an image, not JSON, so there is no Zod schema to derive it
 * from: this is the OpenAPI shape of what the routes return.
 */

const BINARY = { schema: { type: 'string' as const, format: 'binary' } };

export const IMAGE_RESPONSE = {
  description: 'The favicon: PNG resized to fit the requested size, or the original SVG or ICO',
  headers: {
    'X-Favicon-Source': {
      description: 'Where the icon came from: html, manifest, conventional or google',
      schema: { type: 'string' as const, enum: ['html', 'manifest', 'conventional', 'google'] },
    },
  },
  content: {
    'image/png': BINARY,
    'image/svg+xml': BINARY,
    'image/x-icon': BINARY,
  },
};
