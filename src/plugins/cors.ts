import { cors as defineConfig } from 'hono/cors';

import { IS_DEVELOPMENT } from '#util/constants';

const ALLOWED_ORIGINS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/([a-z0-9-]+\.)*meluiz\.(com|dev)$/,
];

/* ///////////////////////////////////////////////// */

const isAllowedOrigin = (origin: string) => {
  return ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
};

/* ///////////////////////////////////////////////// */

export const cors = defineConfig({
  maxAge: 86400,
  credentials: true,
  allowMethods: ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin: (origin: string): string | null => {
    if (!origin) {
      return null;
    }

    if (IS_DEVELOPMENT || isAllowedOrigin(origin)) {
      return origin;
    }

    return null;
  },
});
