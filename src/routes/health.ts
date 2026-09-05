import type { ServerContext } from '#util/types';

import { Hono } from 'hono';

import { toResponse } from '#util/http';

export const health = new Hono<ServerContext>();

health.get('/', (ctx) => {
  return toResponse(ctx, {
    status: 200,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});
