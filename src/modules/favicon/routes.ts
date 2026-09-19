import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { z } from 'zod';

import { BadGatewayError, toErrorResponse, validate } from '@/core/http';
import { createStore } from '@/shared/store';

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

const uint8ArraySchema: z.ZodType<Uint8Array<ArrayBufferLike>> = z.instanceof(Uint8Array);

const AssetKeyEntry = z.object({
  url: z.string(),
  bytes: z.string(),
  source: z.enum(['html', 'manifest', 'conventional', 'google']),
  contentType: z.enum(['image/png', 'image/svg+xml', 'image/x-icon']),
  createdAt: z.iso.datetime(),
});

const store = createStore({
  namespace: 'favicons',
  prefix: 'asset-key',
  schema: AssetKeyEntry,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function uint8ArrayToBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

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

    const exists = await store.get(hash);

    if (exists) {
      const decoded = base64ToUint8Array(exists.bytes);
      return toImageResponse({
        ...exists,
        bytes: decoded,
      });
    }

    const url = decodeAssetHash(hash);

    if (!url) {
      return ctx.notFound();
    }

    try {
      const asset = await getFaviconByUrl(url, ASSET_SIZE, { signal: ctx.req.raw.signal });

      const base64 = uint8ArrayToBase64(asset.bytes);

      store
        .set(
          hash,
          { ...asset, bytes: base64, url, createdAt: new Date().toISOString() },
          { ttl: 86400 },
        )
        .catch((error) => {
          console.error(error, 'Failed to cache favicon');
        });

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
