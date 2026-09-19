import type { Fetcher, HostResolver } from '@/shared/remote';
import type { IconCandidate, IconSource } from '../metadata/extraction';

import { BadGatewayError } from '@/core/http';
import { discard, readBody, safeFetch } from '@/shared/remote';

import { candidatesFromManifest } from '../metadata/extraction';

/* ///////////////////////////////////////////////// */

const USER_AGENT = 'Mozilla/5.0 (compatible; MetadataFaviconBot/1.0)';
const IMAGE_ACCEPT = 'image/avif,image/webp,image/svg+xml,image/*;q=0.9,*/*;q=0.1';
const MANIFEST_ACCEPT = 'application/manifest+json, application/json;q=0.9, */*;q=0.1';

// How far into a file to look for the <svg> root element
const SVG_SNIFF_BYTES = 8_192;

/* ///////////////////////////////////////////////// */

export type FaviconContentType = 'image/png' | 'image/svg+xml' | 'image/x-icon';

/** A favicon ready to be served; how it is served is the route's concern. */
export interface FaviconAsset {
  bytes: Uint8Array;
  contentType: FaviconContentType;
  source: IconSource;
}

export interface AssetOptions {
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
  /** Budget of the whole favicon request. */
  signal: AbortSignal;
  /** Ceiling for a single candidate or manifest inside that budget. */
  resourceTimeout: number;
  maxBytes: number;
  maxRedirects: number;
}

/* ///////////////////////////////////////////////// */

const isIco = (bytes: Uint8Array) => {
  // ICONDIR header: reserved 0, then type 1 (icon) or 2 (cursor)
  return (
    bytes.length >= 4 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    (bytes[2] === 1 || bytes[2] === 2) &&
    bytes[3] === 0
  );
};

const isSvg = (bytes: Uint8Array) => {
  const prefix = new TextDecoder().decode(bytes.subarray(0, SVG_SNIFF_BYTES));

  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)?(?:<!doctype\s+svg[^>]*>\s*)?<svg(?:\s|>)/i.test(
    prefix,
  );
};

const readDataUrl = (url: string, maxBytes: number) => {
  const match = /^data:(image\/[^;,]+)(;[^,]*)?,(.*)$/is.exec(url);

  if (!match) {
    throw new BadGatewayError('The inline favicon is invalid');
  }

  const parameters = match[2] ?? '';
  const payload = match[3] ?? '';
  const bytes = /(?:^|;)base64(?:;|$)/i.test(parameters)
    ? Uint8Array.from(Buffer.from(payload.replace(/\s+/g, ''), 'base64'))
    : new TextEncoder().encode(decodeURIComponent(payload));

  if (bytes.byteLength > maxBytes) {
    throw new BadGatewayError('The inline favicon is too large');
  }

  return bytes;
};

/** Per-candidate signal: the candidate timeout on top of the request budget. */
const candidateSignal = (options: AssetOptions) => {
  return AbortSignal.any([options.signal, AbortSignal.timeout(options.resourceTimeout)]);
};

const fetchBytes = async (url: string, accept: string, options: AssetOptions) => {
  const { response, url: resolvedUrl } = await safeFetch(url, {
    fetcher: options.fetcher,
    resolveHost: options.resolveHost,
    maxRedirects: options.maxRedirects,
    signal: candidateSignal(options),
    headers: { accept, 'user-agent': USER_AGENT },
  });

  if (!response.ok) {
    await discard(response);
    return null;
  }

  // A cut image is useless, so oversized bodies are rejected instead of truncated
  const { bytes } = await readBody(response, { maxBytes: options.maxBytes, overflow: 'throw' });

  return { bytes, url: resolvedUrl };
};

/**
 * Serve SVG and ICO as they are (SVG scales, ICO already holds several sizes)
 * and re-encode everything else as a PNG that fits the requested size.
 */
const normalize = async (
  bytes: Uint8Array,
  size: number,
  source: IconSource,
): Promise<FaviconAsset> => {
  if (isIco(bytes)) {
    return { bytes, contentType: 'image/x-icon', source };
  }

  if (isSvg(bytes)) {
    return { bytes, contentType: 'image/svg+xml', source };
  }

  const png = await new Bun.Image(bytes).resize(size, size, { fit: 'inside' }).png().bytes();

  return { bytes: png, contentType: 'image/png', source };
};

/* ///////////////////////////////////////////////// */

/**
 * Download and normalize one candidate. Any failure of the candidate itself
 * returns `null` so the next one is tried; only the end of the request budget
 * propagates.
 */
export const loadCandidate = async (
  candidate: IconCandidate,
  size: number,
  options: AssetOptions,
): Promise<FaviconAsset | null> => {
  const source = candidate.source ?? 'html';

  try {
    if (candidate.href.toLowerCase().startsWith('data:')) {
      return await normalize(readDataUrl(candidate.href, options.maxBytes), size, source);
    }

    const fetched = await fetchBytes(candidate.href, IMAGE_ACCEPT, options);

    return fetched ? await normalize(fetched.bytes, size, source) : null;
  } catch (cause) {
    if (options.signal.aborted) {
      throw cause;
    }

    return null;
  }
};

/** Icons declared in the web app manifest; an unusable manifest yields none. */
export const loadManifestCandidates = async (manifestUrl: string, options: AssetOptions) => {
  try {
    const fetched = await fetchBytes(manifestUrl, MANIFEST_ACCEPT, options);

    if (!fetched) {
      return [];
    }

    // TextDecoder drops a UTF-8 BOM, which JSON.parse would reject
    const manifest: unknown = JSON.parse(new TextDecoder().decode(fetched.bytes));

    return candidatesFromManifest(manifest, fetched.url);
  } catch (cause) {
    if (options.signal.aborted) {
      throw cause;
    }

    return [];
  }
};
