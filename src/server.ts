import type { ServerContext } from './core/http';

import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';

import {
  bodyLimit,
  cors,
  logger,
  onError,
  onNotFound,
  rateLimit,
  requestId,
} from './core/middlewares';
import { metadata } from './modules/metadata';

const hono = new Hono<ServerContext>();

/* ------- setup ------- */

hono.use('*', requestId);
hono.use('*', cors);
hono.use('*', rateLimit);
hono.use('*', bodyLimit);
hono.use('*', logger);

hono.onError(onError);
hono.notFound(onNotFound);

/* ------- routes ------- */

hono.route('/metadata', metadata);

/* ------- openapi ------- */

hono.get('/docs', Scalar({ theme: 'saturn', title: 'api.meluiz.com', url: '/openapi.json' }));
hono.get(
  '/openapi.json',
  openAPIRouteHandler(hono, {
    documentation: {
      info: {
        version: '0.1.0',
        title: 'api.meluiz.com',
        description: 'API for meluiz.com services',
      },
    },
  }),
);

export default hono;
