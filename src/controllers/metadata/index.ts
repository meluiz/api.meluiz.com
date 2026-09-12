export type { ExtractMetadataOptions } from './extractor';
export type { IconCandidate, IconFormat, IconPurpose, IconSource } from './extractors';
export type { FaviconFetcher, FetchFaviconOptions } from './favicon';
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
export type { HostResolver, ResolvedAddress } from './url-policy';

export { extractMetadata } from './extractor';
export { getFaviconByUrl } from './favicon';
export { fetchDocument, getMetadataByUrl } from './service';
export { assertSafeRemoteUrl, resolveHost } from './url-policy';
