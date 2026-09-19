/*
 * Signal collectors. `deep.ts` composes the individual inspectors by relative
 * path, so only what the analysis layer itself consumes is re-exported here.
 */

export { extractDocumentSignals } from './document';
export { collectDeepAnalysisSignals } from './remote';
