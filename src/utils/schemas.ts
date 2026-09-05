import { z } from 'zod';

const withProtocol = (value: string) => {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

export const UrlSchema = z
  .string({ error: 'A URL was not provided' })
  .trim()
  .transform(withProtocol)
  .pipe(
    z.httpUrl({
      normalize: true,
      error: 'The provided URL is not a valid http or https address',
    }),
  );
