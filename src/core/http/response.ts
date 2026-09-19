import type { Context } from 'hono';
import type { ContentfulStatusCode, SuccessStatusCode } from 'hono/utils/http-status';
import type { ServerError } from './errors';
import type { ServerContext } from './types';

export interface ResponseOptions<T> {
  data?: T;
  status?: Extract<SuccessStatusCode, ContentfulStatusCode> | 204;
}

export const toResponse = <T = unknown>(
  ctx: Context<ServerContext>,
  options: ResponseOptions<T> = {},
) => {
  const { status = 200, data = null } = options;

  if (status === 204) {
    return ctx.body(null, 204);
  }

  return ctx.json(data, status);
};

export const toFailResponse = (error: ServerError, ctx: Context<ServerContext>) => {
  const payload = {
    status: error.status,
    error: {
      identifier: ctx.get('requestId'),
      path: ctx.req.path,
      ...error.toJSON(),
    },
  };

  return ctx.json(payload, error.status);
};
