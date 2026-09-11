import parse from 'node-html-parser';

import { BadGatewayError, ServerError } from '#util/errors';

import { extractMetadata } from './extractor';
import { assertSafeRemoteUrl, type HostResolver } from './url-policy';

const TIMEOUT = 4_000;
const MAX_BYTES = 60_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const charsetFromContentType = (contentType: string) => {
  const match = /charset=([^;]+)/i.exec(contentType);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'utf-8';
};

export type DocumentFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchDocumentOptions {
  timeout?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  fetcher?: DocumentFetcher;
  resolveHost?: HostResolver;
}

export const fetchDocument = async (input: string, options: FetchDocumentOptions = {}) => {
  const {
    fetcher = globalThis.fetch,
    maxBytes = MAX_BYTES,
    maxRedirects = MAX_REDIRECTS,
    resolveHost,
    signal: requestSignal,
    timeout = TIMEOUT,
  } = options;

  const controller = new AbortController();
  const timing = setTimeout(() => controller.abort(), timeout);

  const signal = requestSignal
    ? AbortSignal.any([controller.signal, requestSignal])
    : controller.signal;

  try {
    let url = input;
    let response: Response;

    for (let hop = 0; ; hop += 1) {
      await assertSafeRemoteUrl(url, resolveHost, signal);

      response = await fetch(url, {
        signal: signal,
        redirect: 'manual',
        headers: {
          'user-agent': 'facebookexternalhit/1.1',
          accept: 'text/html, application/xhtml+xml;q=0.9',
        },
      });

      const isRedirect = REDIRECT_STATUSES.has(response.status);

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

      try {
        url = new URL(location, url).toString();
      } catch (error) {
        throw new BadGatewayError('The resource returned an invalid redirect', error);
      }
    }

    if (!response.ok) {
      throw new BadGatewayError(`The resource responded with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!/^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType)) {
      throw new BadGatewayError('The resource is not an HTML document');
    }

    if (!response.body) {
      throw new BadGatewayError('The response contained no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder(charsetFromContentType(contentType) as Bun.Encoding);

    let html = '';
    let bytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          bytes += value.length;
          html += decoder.decode(value, { stream: true });

          const remaining = maxBytes - bytes;
          const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;

          bytes += chunk.byteLength;
          html += decoder.decode(chunk, { stream: true });
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
    if (error instanceof ServerError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new BadGatewayError('The resource took too long to respond', error);
    }

    if (requestSignal?.aborted) {
      throw new BadGatewayError('The request was cancelled', error);
    }

    throw new BadGatewayError('The resource could not be fetched', error);
  } finally {
    clearTimeout(timing);
  }
};

export const getMetadataByUrl = async (url: string, options: FetchDocumentOptions = {}) => {
  const { root, url: resolvedUrl } = await fetchDocument(url, options);
  return extractMetadata(root, { resolvedUrl, requestedUrl: url });
};
