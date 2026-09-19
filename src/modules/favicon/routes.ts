import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';

import { BadGatewayError, toErrorResponse, validate } from '@/core/http';

import { ASSET_SIZE, decodeAssetHash } from './hash';
import { toImageResponse } from './response';
import { GetFaviconAssetParam, GetFaviconQuery, IMAGE_RESPONSE } from './schemas';
import { getFaviconByUrl } from './service';

/* ///////////////////////////////////////////////// */

/*
 * Two routers because the two routes live under different prefixes: the lookup
 * answers a query string, the asset route a hash inside the path. Where each is
 * mounted is the server's decision, not the module's.
 */

export const favicon = new Hono<ServerContext>();
export const faviconStatic = new Hono<ServerContext>();

/* ///////////////////////////////////////////////// */

favicon.get(
  '/favicon',
  describeRoute({
    tags: ['Favicon'],
    operationId: 'getFavicon',
    summary: 'Get a favicon',
    description:
      'Returns the best icon of a site: declared in the page or its manifest, then conventional locations such as /favicon.ico, then Google as a last resort.',
    responses: {
      200: IMAGE_RESPONSE,
      ...toErrorResponse(400, 422, 429, 502),
    },
  }),
  validate('query', GetFaviconQuery),
  async (ctx) => {
    const { size, url } = ctx.req.valid('query');
    const asset = await getFaviconByUrl(url, size, { signal: ctx.req.raw.signal });

    return toImageResponse(asset);
  },
);

/* ///////////////////////////////////////////////// */

faviconStatic.get(
  '/favicon/:hash',
  describeRoute({
    tags: ['Favicon'],
    operationId: 'getFaviconAsset',
    summary: 'Get a favicon by hash',
    description: `Stable, cacheable URL for embedding a site icon in an <img>. Icons are ${ASSET_SIZE}px. Any failure to find one answers 404, so the image falls back cleanly.`,
    responses: {
      200: IMAGE_RESPONSE,
      ...toErrorResponse(400, 404, 429),
    },
  }),
  validate('param', GetFaviconAssetParam),
  async (ctx) => {
    const { hash } = ctx.req.valid('param');
    const url = decodeAssetHash(hash);

    if (!url) {
      return ctx.notFound();
    }

    try {
      const asset = await getFaviconByUrl(url, ASSET_SIZE, { signal: ctx.req.raw.signal });
      return toImageResponse(asset);
    } catch (cause) {
      // An <img> cannot show an error body; a 404 lets it fall back instead
      if (cause instanceof BadGatewayError) {
        return ctx.notFound();
      }

      throw cause;
    }
  },
);
