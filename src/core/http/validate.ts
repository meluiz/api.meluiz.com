import type { ZodType } from 'zod';

import { validator } from 'hono/validator';
import z from 'zod';

import { UnprocessableError } from './errors';

type Target = 'query' | 'json' | 'param' | 'header';

export const validate = <T extends ZodType>(target: Target, schema: T) => {
  return validator(target, (value) => {
    const result = schema.safeParse(value);

    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);

      throw new UnprocessableError(`The provided ${target} is invalid`, fieldErrors);
    }

    return result.data;
  });
};
