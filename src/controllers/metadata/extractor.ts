import type { HTMLElement } from 'node-html-parser';
import type { Metadata } from './types';

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
}

export const extractMetadata = (
  root: HTMLElement,
  options: ExtractMetadataOptions,
): Metadata => {
  const { requestedUrl, resolvedUrl = requestedUrl } = options;
  const ctx = createExtractorContext(root, resolvedUrl);

  try {
    return {
      requestedUrl,
      resolvedUrl,
      general: extractGeneral(ctx),
      opengraph: extractOpengraph(ctx),
      twitter: extractTwitter(ctx),
      mobile: extractMobile(ctx),
      crawler: extractCrawler(ctx),
    };
  } catch (error) {
    throw new InternalServerError(`Failed to parse metadata`, error);
  }
};
