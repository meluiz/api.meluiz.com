import type { ErrorHandler, NotFoundHandler } from 'hono';
import type { ServerContext } from '#util/types';

import { HTTPException } from 'hono/http-exception';
import { ZodError, z } from 'zod';

import {
  InternalServerError,
  NotFoundError,
  ServerError,
  UnprocessableError,
} from '#util/errors';
import { toFailResponse } from '#util/http';

import { env } from '../utils/env';

export const onError: ErrorHandler<ServerContext> = async (error, ctx) => {
  if (error instanceof ServerError) {
    return toFailResponse(error, ctx);
  }

  if (error instanceof ZodError) {
    const flattenError = z.flattenError(error);
    const unprocessable = new UnprocessableError(
      'The provided data is invalid',
      flattenError.fieldErrors,
    );

    return toFailResponse(unprocessable, ctx);
  }

  if (error instanceof HTTPException) {
    const server = new ServerError(error.message, {
      code: 'HTTP_EXCEPTION',
      status: error.status,
    });

    return toFailResponse(server, ctx);
  }

  if (env.NODE_ENV === 'development') {
    console.error({
      error,
      path: ctx.req.path,
      method: ctx.req.method,
      identifier: ctx.get('requestId'),
    });
  }

  const internalServer = new InternalServerError();

  return toFailResponse(internalServer, ctx);
};

export const onNotFound: NotFoundHandler<ServerContext> = async (ctx) => {
  const notFound = new NotFoundError();
  return toFailResponse(notFound, ctx);
};
