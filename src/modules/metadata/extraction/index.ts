/*
 * The boundary of the extraction layer. The individual extractors are composed
 * by `extract.ts` and reached by relative path inside this folder, so only what
 * the service and the favicon lookup consume is re-exported here.
 */

export type { IconCandidate, IconSource } from './extractors';

export { createExtractorContext } from './context';
export { extractMetadata } from './extract';
export {
  ASSUMED_APPLE_SIZE,
  ASSUMED_DEFAULT_SIZE,
  candidatesFromManifest,
  extractIconCandidates,
  extractManifestUrl,
  rankCandidates,
  SCALABLE_SIZE,
} from './extractors';
