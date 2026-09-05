import parse from 'node-html-parser';

import { BadGatewayError, BadRequestError } from '#util/errors';

import { extractMetadata } from './extractor';

const TIMEOUT = 4_000;
const MAX_BYTES = 60_000;
const MAX_REDIRECTS = 3;

const isPrivateHost = (hostname: string) => {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
    hostname,
  );
};

const charsetFromContentType = (contentType: string) => {
  const match = /charset=([^;]+)/i.exec(contentType);

  return (match?.[1]?.trim() || 'utf-8') as Bun.Encoding;
};

export interface FetchDocumentOptions {
  timeout?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export const fetchDocument = async (input: string, options: FetchDocumentOptions = {}) => {
  const { maxBytes = MAX_BYTES, timeout = TIMEOUT, maxRedirects = MAX_REDIRECTS } = options;
  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  try {
    let url = input;
    let response: Response;

    for (let hop = 0; ; hop += 1) {
      const parsed = new URL(url);

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestError('The URL protocol is not supported');
      }

      if (isPrivateHost(parsed.hostname)) {
        throw new BadRequestError('The URL resolves to a disallowed host');
      }

      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'user-agent': 'facebookexternalhit/1.1',
          accept: 'text/html',
        },
      });

      const isRedirect = response.status >= 300 && response.status < 400;

      if (!isRedirect) {
        break;
      }

      const location = response.headers.get('location');

      if (!location) {
        break;
      }

      if (hop >= maxRedirects) {
        throw new BadGatewayError('Too many redirects were followed');
      }

      url = new URL(location, url).toString();
    }

    if (!response.ok) {
      throw new BadGatewayError(`The resource responded with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/html')) {
      throw new BadGatewayError('The resource is not an HTML document');
    }

    if (!response.body) {
      throw new BadGatewayError('The response contained no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder(charsetFromContentType(contentType));

    let html = '';
    let bytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          bytes += value.length;
          html += decoder.decode(value, { stream: true });
        }

        // Read the whole document (up to maxBytes) — this extractor needs more
        // than the <head>: favicons, apple-touch-icons and canonical links may
        // sit outside it, so no </head> early-cut here.
        if (done || bytes >= maxBytes) {
          break;
        }
      }
    } finally {
      html += decoder.decode();
      await reader.cancel().catch(() => {});
    }

    return { root: parse(html), html, url };
  } catch (error) {
    // The abort signal surfaces as a generic error — translate it
    if (error instanceof Error) {
      throw new BadGatewayError('The resource took too long to respond', error.message);
    }

    throw error;
  } finally {
    clearTimeout(timing);
  }
};

export const getMetadataByUrl = async (url: string) => {
  const { root, url: resolvedUrl } = await fetchDocument(url);
  return extractMetadata(root, { resolvedUrl, requestedUrl: url });
};
