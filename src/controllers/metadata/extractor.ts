import type { HTMLElement } from 'node-html-parser';
import type { Metadata, MetadataDocument } from './types';

import { InternalServerError } from '#util/errors';

import {
  extractCrawler,
  extractGeneral,
  extractMobile,
  extractOpengraph,
  extractTwitter,
} from './extractors';
import { createExtractorContext } from './extractors/context';

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
  const ctx = createExtractorContext(root, resolvedUrl);

  try {
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
    throw new InternalServerError(`Failed to parse metadata`, undefined, cause);
  }
};
