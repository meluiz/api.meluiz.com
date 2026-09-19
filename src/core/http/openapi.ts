import type { ZodType } from 'zod';

import { resolver } from 'hono-openapi';
import { z } from 'zod';

/* ///////////////////////////////////////////////// */

/** Envelope produced by the error handler for every failed request. */
export const ErrorResponseSchema = z.object({
  status: z.number().int(),
  error: z.object({
    identifier: z.string(),
    path: z.string(),
    code: z.string(),
    message: z.string(),
    details: z.unknown(),
  }),
});

/* ///////////////////////////////////////////////// */

const ERROR_DEFINITIONS = {
  400: {
    name: 'BadRequestError',
    code: 'BAD_REQUEST',
    description: 'The request was malformed',
  },
  403: {
    name: 'ForbiddenError',
    code: 'FORBIDDEN',
    description: 'The request is forbidden',
  },
  404: {
    name: 'NotFoundError',
    code: 'NOT_FOUND',
    description: 'The requested resource was not found',
  },
  413: {
    name: 'PayloadTooLargeError',
    code: 'PAYLOAD_TOO_LARGE',
    description: 'The request payload is too large',
  },
  422: {
    name: 'UnprocessableError',
    code: 'UNPROCESSABLE',
    description: 'The provided data is invalid',
  },
  429: {
    name: 'TooManyRequestsError',
    code: 'TOO_MANY_REQUESTS',
    description: 'Too many requests were sent',
  },
  500: {
    name: 'InternalServerError',
    code: 'INTERNAL_SERVER_ERROR',
    description: 'An internal server error occurred',
  },
  502: {
    name: 'BadGatewayError',
    code: 'BAD_GATEWAY',
    description: 'The upstream service returned an invalid response',
  },
} as const;

type DocumentedErrorStatus = keyof typeof ERROR_DEFINITIONS;

/* ///////////////////////////////////////////////// */

const createErrorResponseSchema = (status: DocumentedErrorStatus) => {
  const error = ERROR_DEFINITIONS[status];

  return ErrorResponseSchema.extend({
    status: z.literal(status),
    error: z.object({
      identifier: z.uuid(),
      path: z.httpUrl(),
      code: z.literal(error.code),
      message: z.string(),
      details: z.unknown(),
    }),
  }).meta({
    id: error.name,
    description: error.description,
  });
};

/* ///////////////////////////////////////////////// */

/** A JSON response documented with a Zod schema. */
export const toJsonResponse = (description: string, schema: ZodType) => {
  return {
    description,
    content: {
      'application/json': {
        schema: resolver(schema),
      },
    },
  };
};

/** Error responses for a route, all sharing the ErrorResponse envelope. */
export const toErrorResponse = (...statuses: DocumentedErrorStatus[]) => {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      toJsonResponse(ERROR_DEFINITIONS[status].description, createErrorResponseSchema(status)),
    ]),
  );
};
