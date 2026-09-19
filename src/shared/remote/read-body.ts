import { BadGatewayError } from '@/core/http';

import { discard } from './safe-fetch';

/* ///////////////////////////////////////////////// */

export interface ReadBodyOptions {
  maxBytes: number;
  /**
   * What to do when the body exceeds maxBytes: 'truncate' keeps the prefix
   * (HTML, robots.txt, sitemaps); 'throw' rejects the resource (images, manifests).
   */
  overflow?: 'truncate' | 'throw';
}

export interface ReadBodyResult {
  bytes: Uint8Array;
  /** True only when the stream had more data than maxBytes allowed. */
  truncated: boolean;
}

/* ///////////////////////////////////////////////// */

const tooLarge = () => {
  return new BadGatewayError('The remote resource is too large');
};

const concat = (chunks: Uint8Array[], size: number) => {
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

/* ///////////////////////////////////////////////// */

/** Read a response body without ever buffering more than maxBytes. */
export const readBody = async (
  response: Response,
  options: ReadBodyOptions,
): Promise<ReadBodyResult> => {
  const { maxBytes, overflow = 'truncate' } = options;

  if (overflow === 'throw') {
    const declaredLength = Number(response.headers.get('content-length'));

    // Reject early when the server already announces an oversized body
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await discard(response);
      throw tooLarge();
    }
  }

  if (!response.body) {
    throw new BadGatewayError('The response contained no body');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  let size = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const remaining = maxBytes - size;

      if (value.byteLength > remaining) {
        if (overflow === 'throw') {
          throw tooLarge();
        }

        chunks.push(value.subarray(0, remaining));
        size = maxBytes;
        truncated = true;
        break;
      }

      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return { bytes: concat(chunks, size), truncated };
};
