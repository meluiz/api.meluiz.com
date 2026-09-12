import { z } from 'zod';

import { getNormalizedUrl } from './url';

export const UrlSchema = z
  .string({ error: 'A URL was not provided' })
  .trim()
  .transform(getNormalizedUrl)
  .pipe(
    z.httpUrl({
      normalize: true,
      error: 'The provided URL is not a valid http or https address',
    }),
  );
