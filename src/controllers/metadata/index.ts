export type { ExtractMetadataOptions } from './extractor';
export type { FetchFaviconOptions } from './favicon';
export type { FetchDocumentOptions } from './service';
export type {
  Alternate,
  Author,
  Crawler,
  Favicon,
  General,
  Metadata,
  MetadataDocument,
  Mobile,
  Opengraph,
  OpengraphImage,
  OpengraphMedia,
  SiteVerification,
  StructuredData,
  StructuredDataIssue,
  ThemeColor,
  TouchIcon,
  Twitter,
  TwitterLabel,
} from './types';

export { extractMetadata } from './extractor';
export { getFaviconByUrl } from './favicon';
export { fetchDocument, getMetadataByUrl } from './service';
