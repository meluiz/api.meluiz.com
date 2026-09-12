import type { ServerContext } from '#util/types';

import { Hono } from 'hono';
import z from 'zod';

import { getFaviconByUrl } from '#controller/metadata';
import { BadGatewayError } from '#util/errors';
import { validate } from '#util/validate';

export const assets = new Hono<ServerContext>();

export const GetFaviconAssetParam = z.object({
  hash: z.string().min(1),
});

assets.get('/favicon/:hash', validate('param', GetFaviconAssetParam), async (ctx) => {
  const { hash } = ctx.req.valid('param');
  const encoded = hash.split('.').at(0);

  if (!encoded) {
    return ctx.notFound();
  }

  let targetUrl: string;

  try {
    const decoded = Buffer.from(encoded, 'base64url').toString();
    targetUrl = new URL(decoded).toString();
  } catch {
    return ctx.notFound();
  }

  try {
    return await getFaviconByUrl(targetUrl, 64, {
      signal: ctx.req.raw.signal,
    });
  } catch (cause) {
    if (cause instanceof BadGatewayError) {
      return ctx.notFound();
    }

    throw cause;
  }
});
