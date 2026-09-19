import type { FetchDocumentOptions } from './document';
import type { AnalysisContext, AnalysisMode } from './types';

import {
  analyzeMetadata,
  collectDeepAnalysisSignals,
  extractDocumentSignals,
} from './analysis';
import { fetchDocument } from './document';
import { extractMetadata } from './extraction';

/* ///////////////////////////////////////////////// */

export interface GetMetadataAnalysisOptions extends FetchDocumentOptions {
  mode?: AnalysisMode;
  /** Overall budget for the deep phase. */
  deepTimeout?: number;
  /** Ceiling for any single remote request inside that budget. */
  deepRequestTimeout?: number;
  deepConcurrency?: number;
  maxAlternates?: number;
}

/* ///////////////////////////////////////////////// */

export const getMetadataByUrl = async (url: string, options: FetchDocumentOptions = {}) => {
  const document = await fetchDocument(url, options);

  return extractMetadata(document.root, {
    requestedUrl: url,
    resolvedUrl: document.url,
    document: {
      status: document.status,
      contentType: document.contentType,
      bytes: document.bytes,
      truncated: document.truncated,
      redirects: document.redirects,
    },
  });
};

export const getMetadataAnalysisByUrl = async (
  url: string,
  options: GetMetadataAnalysisOptions = {},
) => {
  const {
    deepConcurrency,
    deepRequestTimeout,
    deepTimeout,
    maxAlternates,
    mode = 'quick',
    ...documentOptions
  } = options;

  const document = await fetchDocument(url, documentOptions);
  const metadata = extractMetadata(document.root, {
    requestedUrl: url,
    resolvedUrl: document.url,
  });

  const context: AnalysisContext = {
    mode,
    document: extractDocumentSignals(document.root),
    http: {
      status: document.status,
      headers: document.headers,
      redirects: document.redirects,
    },
  };

  if (mode === 'deep') {
    context.deep = await collectDeepAnalysisSignals(metadata, {
      maxAlternates,
      signal: documentOptions.signal,
      fetcher: documentOptions.fetcher,
      concurrency: deepConcurrency,
      resolveHost: documentOptions.resolveHost,
      timeout: deepTimeout,
      requestTimeout: deepRequestTimeout,
    });
  }

  return analyzeMetadata(metadata, context);
};
