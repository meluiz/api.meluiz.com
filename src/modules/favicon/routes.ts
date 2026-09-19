import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';

import { BadGatewayError, toErrorResponse, validate } from '@/core/http';

import { ASSET_SIZE, decodeAssetHash } from './hash';
import { toImageFallbackResponse, toImageResponse } from './response';
import {
  FALLBACK_RESPONSE,
  GetFaviconAssetParam,
  GetFaviconQuery,
  IMAGE_RESPONSE,
} from './schemas';
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
      'Returns the best icon of a site: declared in the page or its manifest, then conventional locations such as /favicon.ico, then Google as a last resort. When none of those answers, a placeholder icon is served with a 404.',
    responses: {
      200: IMAGE_RESPONSE,
      404: FALLBACK_RESPONSE,
      ...toErrorResponse(400, 422, 429),
    },
  }),
  validate('query', GetFaviconQuery),
  async (ctx) => {
    const { size, url } = ctx.req.valid('query');

    try {
      const asset = await getFaviconByUrl(url, size, {
        signal: ctx.req.raw.signal,
      });

      return toImageResponse(asset, url);
    } catch (cause) {
      // A site with no reachable icon still gets an image; a rejected URL is
      // the caller's mistake and keeps its error
      if (cause instanceof BadGatewayError) {
        return toImageFallbackResponse();
      }

      throw cause;
    }
  },
);

/* ///////////////////////////////////////////////// */

faviconStatic.get(
  '/favicon/:hash',
  describeRoute({
    tags: ['Favicon'],
    operationId: 'getFaviconAsset',
    summary: 'Get a favicon by hash',
    description: `Stable, cacheable URL for embedding a site icon in an <img>. Icons are ${ASSET_SIZE}px. Anything that yields no icon \u2014 an undecodable hash, a site without one \u2014 answers 404 with the placeholder, so the image never breaks.`,
    responses: {
      200: IMAGE_RESPONSE,
      404: FALLBACK_RESPONSE,
      ...toErrorResponse(400, 429),
    },
  }),
  validate('param', GetFaviconAssetParam),
  async (ctx) => {
    const { hash } = ctx.req.valid('param');
    const url = decodeAssetHash(hash);

    if (!url) {
      return toImageFallbackResponse();
    }

    try {
      const asset = await getFaviconByUrl(url, ASSET_SIZE, {
        signal: ctx.req.raw.signal,
      });

      return toImageResponse(asset, url);
    } catch (cause) {
      // An <img> cannot show an error body, so a site without a usable icon
      // gets the placeholder instead of a broken image
      if (cause instanceof BadGatewayError) {
        return toImageFallbackResponse();
      }

      throw cause;
    }
  },
);
