import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';

import { toResponse, validate } from '@/core/http';

import { ClientHeaders, GetMetadataQuery } from './metadata.schemas';
import { getMetadataByUrl } from './metadata.service';

/* ///////////////////////////////////////////////// */

export const metadata = new Hono<ServerContext>();

metadata.get(
  '/',
  validate('query', GetMetadataQuery),
  validate('header', ClientHeaders),
  async (ctx) => {
    const { url } = ctx.req.valid('query');
    const headers = ctx.req.valid('header');

    const payload = await getMetadataByUrl(url, {
      signal: ctx.req.raw.signal,
      userAgent: headers['x-client-user-agent'],
    });

    return toResponse(ctx, { status: 200, data: payload });
  },
);
