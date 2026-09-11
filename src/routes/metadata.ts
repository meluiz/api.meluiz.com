import type { ServerContext } from '#util/types';

import { Hono } from 'hono';
import { z } from 'zod';

import { getFaviconByUrl, getMetadataByUrl } from '#controller/metadata';
import { toResponse } from '#util/http';
import { UrlSchema } from '#util/schemas';
import { validate } from '#util/validate';

export const GetMetadataQuery = z.object({ url: UrlSchema });
export const GetFaviconQuery = z
  .object({
    url: UrlSchema,
    size: z.coerce.number().int().min(16).max(256).optional(),
  })
  .transform(({ size, url }) => ({ size: size ?? 16, url }));

export const metadata = new Hono<ServerContext>();

metadata.get('/', validate('query', GetMetadataQuery), async (ctx) => {
  const { url } = ctx.req.valid('query');

  const payload = await getMetadataByUrl(url, { signal: ctx.req.raw.signal });

  return toResponse(ctx, {
    status: 200,
    data: payload,
  });
});

metadata.get('/favicon', validate('query', GetFaviconQuery), async (ctx) => {
  const { size, url } = ctx.req.valid('query');

  return getFaviconByUrl(url, size, { signal: ctx.req.raw.signal });
});
