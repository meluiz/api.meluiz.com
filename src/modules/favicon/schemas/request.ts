import { z } from 'zod';

import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

export const GetFaviconQuery = z.object({
  url: UrlSchema.meta({
    description:
      'Site whose favicon is wanted. The protocol is optional and defaults to https.',
    example: 'https://meluiz.com',
  }),
  size: z.coerce.number().int().min(16).max(256).default(16).meta({
    description:
      'Edge of the square box raster icons are resized to fit. SVG and ICO are served as they are.',
    example: 64,
  }),
});

export const GetFaviconAssetParam = z.object({
  hash: z.string().min(1).meta({
    description:
      'Site URL encoded as base64url, optionally followed by an extension, as in aHR0cHM6Ly9tZWx1aXouY29tLw.png. Returned by every icon response as X-Favicon-Hash.',
    example: 'aHR0cHM6Ly9tZWx1aXouY29tLw.png',
  }),
});
