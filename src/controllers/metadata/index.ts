export type { ExtractMetadataOptions } from './extractor';
export type { IconCandidate, IconFormat, IconPurpose, IconSource } from './extractors';
export type { FaviconFetcher, FetchFaviconOptions } from './favicon';
export type { FetchDocumentOptions, GetMetadataAnalysisOptions } from './service';
export type {
  Alternate,
  Author,
  Crawler,
  Favicon,
  General,
  Metadata,
  MetadataAnalysis,
  MetadataAnalysisCategory,
  MetadataAnalysisCategoryId,
  MetadataAnalysisCheck,
  MetadataAnalysisCoverage,
  MetadataAnalysisLimits,
  MetadataAnalysisLimitUnit,
  MetadataAnalysisMode,
  MetadataAnalysisOutcome,
  MetadataAnalysisPoints,
  MetadataAnalysisScores,
  MetadataAnalysisScoring,
  MetadataAnalysisSeverity,
  MetadataAnalysisSource,
  MetadataAnalysisStatus,
  MetadataAnalysisSummary,
  MetadataAnalysisValue,
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

export { analyzeMetadata, METADATA_ANALYSIS_LIMITS } from './analyzer';
export { extractMetadata } from './extractor';
export { getFaviconByUrl } from './favicon';
export { fetchDocument, getMetadataAnalysisByUrl, getMetadataByUrl } from './service';
export { assertSafeRemoteUrl, resolveHost } from './url-policy';
