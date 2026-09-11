export type { ExtractMetadataOptions } from './extractor';
export type { FetchFaviconOptions } from './favicon';
export type { FetchDocumentOptions } from './service';
export type {
  Author,
  Crawler,
  Favicon,
  General,
  Metadata,
  Mobile,
  Opengraph,
  OpengraphImage,
  ThemeColor,
  TouchIcon,
  Twitter,
} from './types';

export { extractMetadata } from './extractor';
export { getFaviconByUrl } from './favicon';
export { fetchDocument, getMetadataByUrl } from './service';
