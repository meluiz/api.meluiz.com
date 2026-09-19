import { z } from 'zod';

import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

export const GetMetadataQuery = z.object({
  url: UrlSchema,
});

export const GetMetadataAnalysisQuery = GetMetadataQuery.extend({
  mode: z.enum(['quick', 'deep']).default('quick'),
});

// Lets a client fetch the page as a specific crawler would see it. Header names
// arrive lowercased; the length cap keeps an arbitrary value from being forwarded.
export const ClientHeaders = z.object({
  'x-client-user-agent': z.string().trim().min(1).max(512).optional(),
});
