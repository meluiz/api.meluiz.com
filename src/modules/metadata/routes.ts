import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';

import {
  BadGatewayError,
  toErrorResponse,
  toJsonResponse,
  toResponse,
  validate,
} from '@/core/http';

import { ASSET_SIZE, decodeAssetHash, IMAGE_RESPONSE, toImageResponse } from './favicon';
import {
  ClientHeaders,
  GetFaviconAssetParam,
  GetFaviconQuery,
  GetMetadataAnalysisQuery,
  GetMetadataQuery,
} from './schemas';
import { getFaviconByUrl, getMetadataAnalysisByUrl, getMetadataByUrl } from './service';
import { Analysis, Metadata } from './types';

/* ///////////////////////////////////////////////// */

const RESPONSE_ERRORS = toErrorResponse(400, 422, 429, 502);

/* ///////////////////////////////////////////////// */

export const metadata = new Hono<ServerContext>();
export const metadataStatic = new Hono<ServerContext>();

metadata.get(
  '/',
  describeRoute({
    tags: ['Metadata'],
    operationId: 'getMetadata',
    summary: 'Extract metadata',
    description:
      'Fetches the page and returns everything a search engine or social platform reads: general tags, Open Graph, Twitter Card, mobile and crawler directives.',
    responses: {
      200: toJsonResponse('Metadata extracted from the page', Metadata),
      ...RESPONSE_ERRORS,
    },
  }),
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

/* ///////////////////////////////////////////////// */

metadata.get(
  '/analyze',
  describeRoute({
    tags: ['Metadata'],
    operationId: 'analyzeMetadata',
    summary: 'Analyze metadata',
    description:
      'Scores the page metadata across six weighted categories. Deep mode also fetches images, robots.txt, the sitemap and language alternates.',
    responses: {
      200: toJsonResponse('Weighted SEO analysis of the page metadata', Analysis),
      ...RESPONSE_ERRORS,
    },
  }),
  validate('query', GetMetadataAnalysisQuery),
  validate('header', ClientHeaders),
  async (ctx) => {
    const { mode, url } = ctx.req.valid('query');
    const headers = ctx.req.valid('header');

    const payload = await getMetadataAnalysisByUrl(url, {
      mode,
      signal: ctx.req.raw.signal,
      userAgent: headers['x-client-user-agent'],
    });

    return toResponse(ctx, { status: 200, data: payload });
  },
);

/* ///////////////////////////////////////////////// */

metadata.get(
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

metadataStatic.get(
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
    const url = decodeAssetHash(ctx.req.valid('param').hash);

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
