import type { ServerContext } from './core/http';

import { Hono } from 'hono';

import { registerDocumentation } from './core/http';
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

registerDocumentation(hono);

export default hono;
