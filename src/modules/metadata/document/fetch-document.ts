import type { Fetcher, HostResolver } from '@/shared/remote';

import parse from 'node-html-parser';

import { BadGatewayError, ServerError } from '@/core/http';
import { discard, readBody, safeFetch } from '@/shared/remote';

import { decodeDocument } from './decode';

/* ///////////////////////////////////////////////// */

const TIMEOUT = 8_000;
const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const DEFAULT_USER_AGENT = 'facebookexternalhit/1.1';

const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i;

const DOCUMENT_HEADERS = {
  accept: 'text/html, application/xhtml+xml;q=0.9',
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
} as const;

/* ///////////////////////////////////////////////// */

export interface FetchDocumentOptions {
  userAgent?: string;
  timeout?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
}

/* ///////////////////////////////////////////////// */

export const fetchDocument = async (input: string, options: FetchDocumentOptions = {}) => {
  const {
    fetcher,
    resolveHost,
    signal: requestSignal,
    timeout = TIMEOUT,
    maxBytes = MAX_BYTES,
    maxRedirects = MAX_REDIRECTS,
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  // One budget for the whole operation: DNS, every redirect hop and the body read
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = requestSignal
    ? AbortSignal.any([timeoutSignal, requestSignal])
    : timeoutSignal;

  try {
    const { response, url, redirects } = await safeFetch(input, {
      signal,
      fetcher,
      resolveHost,
      maxRedirects,
      headers: { ...DOCUMENT_HEADERS, 'user-agent': userAgent },
    });

    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok) {
      await discard(response);
      throw new BadGatewayError(`The resource responded with status ${response.status}`);
    }

    if (!HTML_CONTENT_TYPE.test(contentType)) {
      await discard(response);
      throw new BadGatewayError('The resource is not an HTML document');
    }

    // The whole document is read (up to maxBytes), not just the <head>: favicons,
    // touch icons and canonical links may be declared further down the page
    const body = await readBody(response, { maxBytes });
    const html = decodeDocument(body.bytes, contentType);

    return {
      root: parse(html),
      html,
      url,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      redirects,
      bytes: body.bytes.byteLength,
      truncated: body.truncated,
      contentType,
    };
  } catch (cause) {
    if (cause instanceof ServerError) {
      throw cause;
    }

    if (timeoutSignal.aborted) {
      throw new BadGatewayError('The resource took too long to respond', undefined, cause);
    }

    if (requestSignal?.aborted) {
      throw new BadGatewayError('The request was cancelled', undefined, cause);
    }

    throw new BadGatewayError('The resource could not be fetched', undefined, cause);
  }
};
