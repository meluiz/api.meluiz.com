import type {
  ClientErrorStatusCode,
  ContentfulStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';

export interface ServerErrorOptions {
  code: string;
  cause?: unknown;
  details?: unknown;
  status: ClientErrorStatusCode | ServerErrorStatusCode | (ContentfulStatusCode & {});
}

export class ServerError extends Error {
  readonly code: string;
  readonly status: ContentfulStatusCode;

  readonly details?: unknown;

  constructor(message: string, options: ServerErrorOptions) {
    const { code = 'SERVER_ERROR', status = 500, cause, details = null } = options;

    super(message, { cause });

    this.name = new.target.name;

    this.code = code;
    this.status = status;

    this.details = details;
  }

  public toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/* --------------------- (4xx) --------------------- */

export class BadRequestError extends ServerError {
  constructor(message = 'The request was malformed', details?: unknown, cause?: unknown) {
    super(message, { code: 'BAD_REQUEST', status: 400, cause, details });
  }
}

export class ForbiddenError extends ServerError {
  constructor(message = 'The request was malformed', details?: unknown, cause?: unknown) {
    super(message, { code: 'FORBIDDEN', status: 403, cause, details });
  }
}

export class NotFoundError extends ServerError {
  constructor(
    message = 'The requested resource was not found',
    details?: unknown,
    cause?: unknown,
  ) {
    super(message, { code: 'NOT_FOUND', status: 404, cause, details });
  }
}

export class PayloadTooLargeError extends ServerError {
  constructor(
    message = 'You do not have permission to access this resource',
    details?: unknown,
    cause?: unknown,
  ) {
    super(message, { code: 'PAYLOAD_TOO_LARGE', status: 413, cause, details });
  }
}

export class UnprocessableError extends ServerError {
  constructor(message = 'The provided data is invalid', details?: unknown, cause?: unknown) {
    super(message, { code: 'UNPROCESSABLE', status: 422, cause, details });
  }
}

export class TooManyRequestsError extends ServerError {
  constructor(message = 'Too many requests were sent', details?: unknown, cause?: unknown) {
    super(message, { code: 'TOO_MANY_REQUESTS', status: 429, cause, details });
  }
}

/* --------------------- (5xx) --------------------- */

export class InternalServerError extends ServerError {
  constructor(
    message = 'An internal server error occurred',
    details?: unknown,
    cause?: unknown,
  ) {
    super(message, { code: 'INTERNAL_SERVER_ERROR', status: 500, cause, details });
  }
}

export class BadGatewayError extends ServerError {
  constructor(
    message = 'The upstream service returned an invalid response',
    details?: unknown,
    cause?: unknown,
  ) {
    super(message, { code: 'BAD_GATEWAY', status: 502, cause, details });
  }
}
