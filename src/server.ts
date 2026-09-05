import type { ServerContext } from '#util/types';

import { Hono } from 'hono';

import { bodyLimit } from '#plugin/body-limit';
import { compress } from '#plugin/compress';
import { cors } from '#plugin/cors';
import { onError, onNotFound } from '#plugin/error';
import { logger } from '#plugin/logger';
import { rateLimit } from '#plugin/rate-limit';
import { requestId } from '#plugin/request-id';
import { health } from '#routes/health';

const hono = new Hono<ServerContext>();

/* ------- setup ------- */

hono.use('*', requestId);
hono.use('*', cors);
hono.use('*', rateLimit);
hono.use('*', bodyLimit);
hono.use('*', compress);
hono.use('*', logger);

hono.onError(onError);
hono.notFound(onNotFound);

/* ------- routes ------- */

hono.route('/health', health);

export default hono;
