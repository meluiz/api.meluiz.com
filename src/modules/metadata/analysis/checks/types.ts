import type { AnalysisCategoryId, AnalysisCheck, CheckInput } from '../../schemas';

/**
 * A check reads the metadata and context and returns its result. It returns
 * `null` when the signal it needs was not collected (no HTTP response, quick
 * mode), which removes it from the report instead of scoring a guess.
 */
export type CheckFactory = (input: CheckInput) => AnalysisCheck | AnalysisCheck[] | null;

export interface CategoryDefinition {
  id: AnalysisCategoryId;
  name: string;
  description: string;
  /** Checks in report order. */
  checks: readonly CheckFactory[];
}
