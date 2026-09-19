import type { SitemapSignals } from '../../../types/analysis';
import type { ProbeContext } from './probe';

import { mapWithConcurrency } from '@/shared/concurrency';
import { discard, readBody } from '@/shared/remote';
import { getComparableUrl } from '@/shared/url';

import { describeFailure, probe } from './probe';

/* ///////////////////////////////////////////////// */

const ACCEPT = 'application/xml,text/xml,*/*;q=0.1';

// Bytes kept per sitemap document, compressed or not. Enough to prove that a URL
// is listed; past it, absence can no longer be proven.
const MAX_SITEMAP_BYTES = 1_000_000;

// Child sitemaps followed from an index
const MAX_SITEMAP_CHILDREN = 3;

/* ///////////////////////////////////////////////// */

interface SitemapDocument {
  locations: string[];
  isIndex: boolean;
  /** Only a prefix was read, so a missing URL may still be listed further on. */
  truncated: boolean;
}

/* ///////////////////////////////////////////////// */

const isGzip = (bytes: Uint8Array) => {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
};

/**
 * Decompress as much of a gzip body as fits in maxBytes. A truncated or corrupt
 * stream keeps what was decompressed before the error instead of losing it all.
 */
const gunzipPrefix = async (bytes: Uint8Array, maxBytes: number) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  let size = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (size + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - size));
        size = maxBytes;
        truncated = true;
        break;
      }

      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    truncated = true;
  } finally {
    await reader.cancel().catch(() => {});
  }

  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
};

const xmlValue = (value: string) => {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
};

const parseSitemap = (text: string, truncated: boolean): SitemapDocument => {
  const locations = [...text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => xmlValue(match[1]?.trim() ?? ''))
    .filter(Boolean);

  return { locations, isIndex: /<sitemapindex\b/i.test(text), truncated };
};

/** Read a sitemap response, transparently handling .xml.gz files. */
const readSitemap = async (response: Response) => {
  const body = await readBody(response, { maxBytes: MAX_SITEMAP_BYTES });

  // Servers usually send .xml.gz as application/gzip without Content-Encoding,
  // so fetch hands over the compressed bytes
  if (isGzip(body.bytes)) {
    const { text, truncated } = await gunzipPrefix(body.bytes, MAX_SITEMAP_BYTES);
    return parseSitemap(text, truncated || body.truncated);
  }

  return parseSitemap(new TextDecoder().decode(body.bytes), body.truncated);
};

const fetchChild = async (url: string, context: ProbeContext) => {
  try {
    const { response } = await probe(url, context, ACCEPT);

    if (!response.ok) {
      await discard(response);
      return null;
    }

    return await readSitemap(response);
  } catch {
    return null;
  }
};

/* ///////////////////////////////////////////////// */

/**
 * Look for the canonical URL in the sitemap, following one `<sitemapindex>`
 * level. A partial read (truncated file, unreachable or skipped children) can
 * prove presence but never absence, so it reports `null` instead of `false`.
 */
export const inspectSitemap = async (
  pageUrl: string,
  canonical: string | undefined,
  declared: string[],
  context: ProbeContext,
): Promise<SitemapSignals> => {
  const url = declared[0] ?? new URL('/sitemap.xml', pageUrl).toString();
  const preferred = getComparableUrl(canonical ?? pageUrl);

  const lists = (document: SitemapDocument) => {
    return document.locations.some((location) => getComparableUrl(location) === preferred);
  };

  try {
    const { response } = await probe(url, context, ACCEPT);

    if (!response.ok) {
      await discard(response);

      return {
        url,
        status: response.status,
        containsCanonical: null,
        error: `The sitemap responded with status ${response.status}`,
      };
    }

    const root = await readSitemap(response);
    const documents = root.isIndex
      ? await mapWithConcurrency(
          root.locations.slice(0, MAX_SITEMAP_CHILDREN),
          MAX_SITEMAP_CHILDREN,
          (child) => fetchChild(child, context),
        )
      : [root];

    const read = documents.filter((document): document is SitemapDocument => !!document);
    const found = read.some(lists);

    const complete =
      read.length === documents.length &&
      !read.some((document) => document.truncated) &&
      (!root.isIndex || (!root.truncated && read.length === root.locations.length));

    return {
      url,
      status: response.status,
      inspected: root.isIndex ? 1 + read.length : 1,
      containsCanonical: found ? true : complete ? false : null,
      ...(found || complete ? {} : { error: 'Only part of the sitemap could be inspected' }),
    };
  } catch (cause) {
    return { url, containsCanonical: null, ...describeFailure(cause) };
  }
};
