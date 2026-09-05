import { getConnInfo as getVercelConnInfo } from 'hono/vercel';
import { rateLimiter as defineConfig } from 'hono-rate-limiter';

import { TooManyRequestsError } from '#util/errors';

const REQUEST_LIMIT = 100;
const WINDOW_SECONDS = 60;
const WINDOW_DURATION = WINDOW_SECONDS * 1000;

export const rateLimit = defineConfig({
  limit: REQUEST_LIMIT,
  windowMs: WINDOW_DURATION,
  keyGenerator: (ctx) => {
    const connection = getVercelConnInfo(ctx);
    return connection.remote.address ?? crypto.randomUUID();
  },
  handler: (ctx) => {
    ctx.header('Retry-After', String(WINDOW_SECONDS));

    throw new TooManyRequestsError('Too many requests were sent', {
      retryAfter: WINDOW_DURATION,
    });
  },
});
