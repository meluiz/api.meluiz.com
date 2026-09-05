import { bodyLimit as defineConfig } from 'hono/body-limit';

import { PayloadTooLargeError } from '#util/errors';

const MAX_BODY_SIZE = 1_048_576 * 500; // 500MB

export const bodyLimit = defineConfig({
  maxSize: MAX_BODY_SIZE,
  onError: () => {
    throw new PayloadTooLargeError();
  },
});
