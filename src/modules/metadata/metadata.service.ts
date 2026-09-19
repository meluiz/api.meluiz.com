import type { FetchDocumentOptions } from './document/fetch-document';

import { fetchDocument } from './document/fetch-document';
import { extractMetadata } from './extraction';

/* ///////////////////////////////////////////////// */

export const getMetadataByUrl = async (url: string, options: FetchDocumentOptions = {}) => {
  const document = await fetchDocument(url, options);

  return extractMetadata(document.root, {
    requestedUrl: url,
    resolvedUrl: document.url,
    document: {
      bytes: document.bytes,
      status: document.status,
      truncated: document.truncated,
      redirects: document.redirects,
      contentType: document.contentType,
    },
  });
};
