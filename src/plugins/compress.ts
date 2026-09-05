import { compress as defineConfig } from 'hono/compress';

const COMPRESS_THRESHOLD = 1024 * 1024;

export const compress = defineConfig({
  threshold: COMPRESS_THRESHOLD,
});
