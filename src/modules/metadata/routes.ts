import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';

import { toErrorResponse, toJsonResponse, toResponse, validate } from '@/core/http';

import {
  Analysis,
  ClientHeaders,
  GetMetadataAnalysisQuery,
  GetMetadataQuery,
  Metadata,
} from './schemas';
import { getMetadataAnalysisByUrl, getMetadataByUrl } from './service';

/* ///////////////////////////////////////////////// */

const RESPONSE_ERRORS = toErrorResponse(400, 422, 429, 502);

/* ///////////////////////////////////////////////// */

export const metadata = new Hono<ServerContext>();

metadata.get(
  '/',
  describeRoute({
    tags: ['Metadata'],
    operationId: 'getMetadata',
    summary: 'Extract metadata',
    description:
      'Fetches the page and returns everything a search engine or social platform reads: general tags, Open Graph, Twitter Card, mobile and crawler directives. Pass resources=true to also fetch each declared image and report its measured size.',
    responses: {
      200: toJsonResponse('Metadata extracted from the page', Metadata),
      ...RESPONSE_ERRORS,
    },
  }),
  validate('query', GetMetadataQuery),
  validate('header', ClientHeaders),
  async (ctx) => {
    const { resources, url } = ctx.req.valid('query');
    const headers = ctx.req.valid('header');

    const payload = await getMetadataByUrl(url, {
      resources,
      signal: ctx.req.raw.signal,
      userAgent: headers['x-client-user-agent'],
      acceptLanguage: headers['x-client-accept-language'],
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
      acceptLanguage: headers['x-client-accept-language'],
    });

    return toResponse(ctx, { status: 200, data: payload });
  },
);
