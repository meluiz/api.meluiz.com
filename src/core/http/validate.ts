import type { ZodType } from 'zod';

import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { UnprocessableError } from './errors';

type Target = 'query' | 'json' | 'param' | 'header';

export const validate = <T extends ZodType, K extends Target>(target: K, schema: T) => {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);

      throw new UnprocessableError(`The provided ${target} is invalid`, fieldErrors);
    }
  });
};
