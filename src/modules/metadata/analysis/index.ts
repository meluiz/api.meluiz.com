/*
 * The boundary of the analysis layer. Checks, scoring, helpers and signal
 * collectors are internal: files inside this folder reach each other by
 * relative path, so only the three entry points the service calls are exposed.
 */

export { analyzeMetadata } from './analyze';
export { collectDeepAnalysisSignals, extractDocumentSignals } from './signals';
