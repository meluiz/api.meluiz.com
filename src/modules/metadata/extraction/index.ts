import type { HTMLElement } from 'node-html-parser';
import type { Metadata, MetadataDocument } from '../types';

import { InternalServerError } from '@/core/http';

import { createExtractorContext } from './context';
import {
  extractCrawler,
  extractGeneral,
  extractMobile,
  extractOpengraph,
  extractTwitter,
} from './extractors';

export interface ExtractMetadataOptions {
  requestedUrl: string;
  resolvedUrl?: string;
  document?: MetadataDocument;
}

export const extractMetadata = (
  root: HTMLElement,
  options: ExtractMetadataOptions,
): Metadata => {
  const { document, requestedUrl, resolvedUrl = requestedUrl } = options;

  try {
    const ctx = createExtractorContext(root, resolvedUrl);

    return {
      requestedUrl,
      resolvedUrl,
      document,
      general: extractGeneral(ctx),
      opengraph: extractOpengraph(ctx),
      twitter: extractTwitter(ctx),
      mobile: extractMobile(ctx),
      crawler: extractCrawler(ctx),
    };
  } catch (cause) {
    // Extractors are pure functions over an already parsed DOM: a throw here is
    // a bug in our code, not a problem with the page
    throw new InternalServerError('Failed to extract metadata', undefined, cause);
  }
};

/* ///////////////////////////////////////////////// */

export type { ExtractorContext } from './context';
export type { IconCandidate, IconFormat, IconPurpose, IconSource } from './extractors';

export { createExtractorContext } from './context';
export {
  candidatesFromManifest,
  extractCrawler,
  extractGeneral,
  extractIconCandidates,
  extractManifestUrl,
  extractMobile,
  extractOpengraph,
  extractTwitter,
  rankCandidates,
} from './extractors';
