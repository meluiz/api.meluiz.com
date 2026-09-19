import { z } from 'zod';

import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

export const GetMetadataQuery = z.object({
  url: UrlSchema,
});

export const GetMetadataAnalysisQuery = GetMetadataQuery.extend({
  mode: z.enum(['quick', 'deep']).default('quick'),
});

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
      'Site URL encoded as base64url, optionally followed by an extension, as in aHR0cHM6Ly9tZWx1aXouY29t.png',
    example: 'aHR0cHM6Ly9tZWx1aXouY29t.png',
  }),
});

// Lets a client fetch the page as a specific crawler would see it. Header names
// arrive lowercased; the length cap keeps an arbitrary value from being forwarded.
export const ClientHeaders = z.object({
  'x-client-user-agent': z.string().trim().min(1).max(512).optional(),
});
