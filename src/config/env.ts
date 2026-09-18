import { defineEnv } from 'envin';
import { vercel } from 'envin/presets/zod';
import { z } from 'zod';

export const env = defineEnv({
  env: process.env,
  extends: [vercel],
  shared: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  },
});
