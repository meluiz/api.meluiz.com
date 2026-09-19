import type { ServerContext } from '@/core/http';

import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';

import { toErrorResponse, toJsonResponse, toResponse, validate } from '@/core/http';

import { ClientHeaders, GetMetadataAnalysisQuery, GetMetadataQuery } from './schemas';
import { getMetadataAnalysisByUrl, getMetadataByUrl } from './service';
import { Analysis, Metadata } from './types';

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
