import { z } from 'zod';

import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

export const GetMetadataQuery = z.object({
  url: UrlSchema,

  // Off by default: each declared image costs one outbound request, so the
  // caller decides whether measured dimensions are worth the latency.
  resources: z
    .stringbool()
    .default(false)
    .meta({ description: 'Fetch and measure the declared images and icons' }),
});

export const GetMetadataAnalysisQuery = GetMetadataQuery.omit({ resources: true }).extend({
  mode: z.enum(['quick', 'deep']).default('quick'),
});

// Lets a client fetch the page as a specific crawler would see it. Header names
// arrive lowercased; the length cap keeps an arbitrary value from being forwarded.
export const ClientHeaders = z.object({
  'x-client-user-agent': z.string().trim().min(1).max(512).optional(),

  // Pages serve different metadata per language; without this the reader is
  // stuck with whatever the API server's default happens to be.
  'x-client-accept-language': z.string().trim().min(1).max(256).optional(),
});
