import type { ServerContext } from '#util/types';

import { fromMilliseconds } from '@motiro/string';
import { createMiddleware } from 'hono/factory';
import { blue, dim, green, red, white, yellow } from 'picocolors';

const getColoredStatus = (statusCode: number) => {
  if (statusCode < 200) {
    return white(statusCode);
  }

  if (statusCode < 300) {
    return green(statusCode);
  }

  if (statusCode < 400) {
    return blue(statusCode);
  }

  if (statusCode < 500) {
    return yellow(statusCode);
  }

  return red(statusCode);
};

export const logger = createMiddleware<ServerContext>(async (ctx, next) => {
  const { method, url } = ctx.req;

  const { pathname, search } = new URL(url);
  const requestStartTime = performance.now();

  try {
    await next();
  } finally {
    const status = ctx.res.status;
    const identifier = ctx.get('requestId');

    const requestEndTime = performance.now();
    const totalRequestTime = requestEndTime - requestStartTime;

    process.stdout.write(
      `${method} ${pathname}${dim(search)} ${getColoredStatus(status)} in ${fromMilliseconds(totalRequestTime)} ${dim(`(${identifier})`)}\n`,
    );
  }
});
