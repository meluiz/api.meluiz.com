import type { ServerContext } from '#util/types';

import { Hono } from 'hono';
import { z } from 'zod';

import { getMetadataByUrl } from '#controller/metadata';
import { toResponse } from '#util/http';
import { UrlSchema } from '#util/schemas';
import { validate } from '#util/validate';

export const GetMetadataQuery = z.object({ url: UrlSchema });

export const metadata = new Hono<ServerContext>();

metadata.get('/', validate('query', GetMetadataQuery), async (ctx) => {
  const { url } = ctx.req.valid('query');

  const payload = await getMetadataByUrl(url, { signal: ctx.req.raw.signal });

  return toResponse(ctx, {
    status: 200,
    data: payload,
  });
});
