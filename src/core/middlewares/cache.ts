import { createMiddleware } from 'hono/factory';

export interface CacheOptions {
  maxAge: number;
  staleWhileRevalidate?: number;
}

export const cache = (options: CacheOptions) => {
  return createMiddleware(async (ctx, next) => {
    await next();

    if (ctx.res.status !== 200) {
      return;
    }

    const swr = options.staleWhileRevalidate ?? 0;
    const value = `public, s-maxage=${options.maxAge}, stale-while-revalidate=${swr}`;

    ctx.header('Cache-Control', 'public, max-age=0');
    ctx.header('Vercel-CDN-Cache-Control', value);
  });
};
