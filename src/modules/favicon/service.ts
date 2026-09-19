import type { Fetcher, HostResolver } from '@/shared/remote';
import type { FetchDocumentOptions } from '../metadata/document';
import type { IconCandidate } from '../metadata/extraction';
import type { AssetOptions, FaviconAsset } from './assets';

import { BadGatewayError, ServerError } from '@/core/http';
import { assertSafeRemoteUrl } from '@/shared/remote';

import { fetchDocument } from '../metadata/document';
import {
  createExtractorContext,
  extractIconCandidates,
  extractManifestUrl,
  rankCandidates,
} from '../metadata/extraction';
import { loadCandidate, loadManifestCandidates } from './assets';
import { conventionalCandidates, googleCandidate } from './candidates';

/* ///////////////////////////////////////////////// */

export interface GetFaviconOptions {
  fetcher?: Fetcher;
  resolveHost?: HostResolver;
  signal?: AbortSignal;
  /** Budget for the whole lookup, including every fallback. */
  timeout?: number;
  /** Ceiling for each candidate or manifest download. */
  resourceTimeout?: number;
  maxBytes?: number;
  manifestMaxBytes?: number;
  maxRedirects?: number;
  documentOptions?: FetchDocumentOptions;
}

/* ///////////////////////////////////////////////// */

const MAX_REDIRECTS = 3;
const MAX_CANDIDATES = 24;
const MAX_MANIFEST_BYTES = 256_000;
const MAX_FAVICON_BYTES = 2_000_000;

const REQUEST_TIMEOUT = 8_000;
const DOCUMENT_TIMEOUT = 3_000;
const RESOURCE_TIMEOUT = 2_000;

/* ///////////////////////////////////////////////// */

/** First candidate that downloads and decodes, best-ranked first. */
const firstUsable = async (
  candidates: IconCandidate[],
  size: number,
  options: AssetOptions,
) => {
  for (const candidate of rankCandidates(candidates, size).slice(0, MAX_CANDIDATES)) {
    const asset = await loadCandidate(candidate, size, options);

    if (asset) {
      return asset;
    }
  }

  return null;
};

/** Candidates declared by the page and its manifest, plus the URL after redirects. */
const declaredCandidates = async (
  url: string,
  options: GetFaviconOptions,
  assetOptions: AssetOptions,
) => {
  const { documentOptions } = options;

  const document = await fetchDocument(url, {
    ...documentOptions,
    signal: assetOptions.signal,
    resolveHost: assetOptions.resolveHost,
    fetcher: documentOptions?.fetcher ?? assetOptions.fetcher,
    timeout: documentOptions?.timeout ?? DOCUMENT_TIMEOUT,
  });

  // One context for both lookups: they share the same DOM index
  const ctx = createExtractorContext(document.root, document.url);
  const candidates = extractIconCandidates(ctx);
  const manifestUrl = extractManifestUrl(ctx);

  if (manifestUrl) {
    const manifestCandidates = await loadManifestCandidates(manifestUrl, {
      ...assetOptions,
      maxBytes: options.manifestMaxBytes ?? MAX_MANIFEST_BYTES,
    });

    candidates.push(...manifestCandidates);
  }

  return { candidates, resolvedUrl: document.url };
};

/* ///////////////////////////////////////////////// */

/**
 * Find the best favicon for a site: icons declared by the page and its manifest,
 * then the conventional locations, then Google's favicon service.
 */
export const getFaviconByUrl = async (
  url: string,
  size: number,
  options: GetFaviconOptions = {},
): Promise<FaviconAsset> => {
  const {
    documentOptions,
    fetcher,
    maxBytes = MAX_FAVICON_BYTES,
    maxRedirects = MAX_REDIRECTS,
    resolveHost = documentOptions?.resolveHost,
    resourceTimeout = RESOURCE_TIMEOUT,
    signal: requestSignal,
    timeout = REQUEST_TIMEOUT,
  } = options;

  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = requestSignal
    ? AbortSignal.any([timeoutSignal, requestSignal])
    : timeoutSignal;

  const assetOptions: AssetOptions = {
    signal,
    fetcher,
    resolveHost,
    maxBytes,
    maxRedirects,
    resourceTimeout,
  };

  try {
    // Checked up front: document failures fall through to the fallbacks, and a
    // disallowed host must be refused instead of being handed to Google
    await assertSafeRemoteUrl(url, resolveHost, signal);

    let resolvedUrl = url;

    try {
      const declared = await declaredCandidates(url, options, assetOptions);
      resolvedUrl = declared.resolvedUrl;

      const asset = await firstUsable(declared.candidates, size, assetOptions);

      if (asset) {
        return asset;
      }
    } catch (cause) {
      // Without a readable document the fallbacks still apply
      if (signal.aborted) {
        throw cause;
      }
    }

    const asset =
      (await firstUsable(conventionalCandidates(resolvedUrl), size, assetOptions)) ??
      (await loadCandidate(googleCandidate(resolvedUrl), size, assetOptions));

    if (!asset) {
      throw new BadGatewayError('No favicon could be found for the requested URL');
    }

    return asset;
  } catch (cause) {
    if (cause instanceof ServerError) {
      throw cause;
    }

    if (timeoutSignal.aborted) {
      throw new BadGatewayError(
        'The favicon service took too long to respond',
        undefined,
        cause,
      );
    }

    if (requestSignal?.aborted) {
      throw new BadGatewayError('The request was cancelled', undefined, cause);
    }

    throw new BadGatewayError('The favicon could not be fetched', undefined, cause);
  }
};
