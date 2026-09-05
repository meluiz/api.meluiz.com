import type {
  ClientErrorStatusCode,
  ContentfulStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';

export interface ServerErrorOptions {
  code: string;
  status: ClientErrorStatusCode | ServerErrorStatusCode | (ContentfulStatusCode & {});
  details?: unknown;
}

export class ServerError extends Error {
  readonly code: string;
  readonly status: ContentfulStatusCode;

  readonly details?: unknown;

  constructor(message: string, options: ServerErrorOptions) {
    const { code = 'SERVER_ERROR', status = 500, details = null } = options;

    super(message);

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
  constructor(message = 'The request was malformed', details?: unknown) {
    super(message, { code: 'BAD_REQUEST', status: 400, details });
  }
}

export class ForbiddenError extends ServerError {
  constructor(message = 'The request was malformed', details?: unknown) {
    super(message, { code: 'FORBIDDEN', status: 403, details });
  }
}

export class NotFoundError extends ServerError {
  constructor(message = 'The requested resource was not found', details?: unknown) {
    super(message, { code: 'NOT_FOUND', status: 404, details });
  }
}

export class PayloadTooLargeError extends ServerError {
  constructor(
    message = 'You do not have permission to access this resource',
    details?: unknown,
  ) {
    super(message, { code: 'PAYLOAD_TOO_LARGE', status: 413, details });
  }
}

export class UnprocessableError extends ServerError {
  constructor(message = 'The provided data is invalid', details?: unknown) {
    super(message, { code: 'UNPROCESSABLE', status: 422, details });
  }
}

export class TooManyRequestsError extends ServerError {
  constructor(message = 'Too many requests were sent', details?: unknown) {
    super(message, { code: 'TOO_MANY_REQUESTS', status: 429, details });
  }
}

/* --------------------- (5xx) --------------------- */

export class InternalServerError extends ServerError {
  constructor(message = 'An internal server error occurred', details?: unknown) {
    super(message, { code: 'INTERNAL_SERVER_ERROR', status: 500, details });
  }
}

export class BadGatewayError extends ServerError {
  constructor(
    message = 'The upstream service returned an invalid response',
    details?: unknown,
  ) {
    super(message, { code: 'BAD_GATEWAY', status: 502, details });
  }
}
