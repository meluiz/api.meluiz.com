import type {
  Analysis,
  AnalysisCategoryId,
  AnalysisCheck,
  AnalysisContext,
  CheckInput,
  Metadata,
} from '../types';
import type { CheckFactory } from './checks';

import { CATEGORIES } from './checks';
import {
  aggregateScore,
  CATEGORY_WEIGHTS,
  coverageOf,
  createCategory,
  OUTCOME_SCORES,
  resolveCheckDependencies,
  summarizeChecks,
  sumPoints,
} from './scoring';

/* ///////////////////////////////////////////////// */

const runChecks = (factories: readonly CheckFactory[], input: CheckInput) => {
  return factories.flatMap((factory): AnalysisCheck[] => {
    const result = factory(input);

    if (result === null) {
      return [];
    }

    return Array.isArray(result) ? result : [result];
  });
};

/* ///////////////////////////////////////////////// */

/**
 * Grade the metadata. Quick and deep are not branches in here: every check emits
 * whatever its input supports, and deep mode simply provides more input.
 */
export const analyzeMetadata = (
  metadata: Metadata,
  context: AnalysisContext = { mode: 'quick' },
): Analysis => {
  const input: CheckInput = { metadata, context };

  const definitions = CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    checks: runChecks(category.checks, input),
  }));

  // Dependencies span categories, so they are resolved over the flat list
  // before any category is scored
  const resolved = resolveCheckDependencies(definitions.flatMap((entry) => entry.checks));
  const byId = new Map(resolved.map((check) => [check.id, check]));

  const categories = definitions.map((entry) => {
    return createCategory({
      ...entry,
      checks: entry.checks.map((check) => byId.get(check.id) ?? check),
    });
  });

  const checks = categories.flatMap((category) => category.checks);

  const scoreFor = (...ids: AnalysisCategoryId[]) => {
    return aggregateScore(categories.filter((category) => ids.includes(category.id)));
  };

  return {
    requestedUrl: metadata.requestedUrl,
    resolvedUrl: metadata.resolvedUrl,
    mode: context.mode,
    score: aggregateScore(categories),
    scores: {
      technical: scoreFor('basic-seo', 'urls', 'technical'),
      indexability: scoreFor('indexing'),
      content: scoreFor('content'),
      social: scoreFor('social'),
    },
    summary: summarizeChecks(checks),
    scoring: {
      version: '3.0',
      method: 'weighted-category',
      outcomeScores: OUTCOME_SCORES,
      categoryWeights: CATEGORY_WEIGHTS,
      points: sumPoints(categories),
      coverage: coverageOf(checks),
      skipped: checks.filter((check) => !check.applicable).map((check) => check.id),
    },
    categories,
  };
};
