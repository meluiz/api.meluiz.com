import type {
  AnalysisCategory,
  AnalysisCategoryId,
  AnalysisCheck,
  AnalysisCoverage,
  AnalysisLimits,
  AnalysisOutcome,
  AnalysisPoints,
  AnalysisStatus,
  AnalysisSummary,
  AnalysisValue,
} from '../types';

/* ///////////////////////////////////////////////// */

/** Default grade for an outcome when a check does not supply a partial score. */
export const OUTCOME_SCORES: Record<AnalysisOutcome, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  absent: 0,
  'not-applicable': 0,
  unknown: 0,
};

/** Only these outcomes contribute to the numerator *and* the denominator. */
const SCORED_OUTCOMES = new Set<AnalysisOutcome>(['pass', 'warn', 'fail', 'absent']);

/**
 * Outcomes that make a dependent check unevaluable: the subject it builds on
 * is missing, was not measured, or is already charged elsewhere.
 */
const SUPPRESSING_OUTCOMES = new Set<AnalysisOutcome>(['absent', 'unknown', 'not-applicable']);

const STATUS_BY_OUTCOME: Record<AnalysisOutcome, AnalysisStatus> = {
  pass: 'passed',
  warn: 'warning',
  fail: 'error',
  absent: 'error',
  'not-applicable': 'skipped',
  unknown: 'skipped',
};

/**
 * Explicit share of the final score per category. Without this the weight of a
 * category is whatever its member checks happen to add up to, so adding one
 * check silently reweights the whole model.
 */
export const CATEGORY_WEIGHTS: Record<AnalysisCategoryId, number> = {
  'basic-seo': 25,
  indexing: 30,
  content: 20,
  social: 15,
  urls: 5,
  technical: 5,
};

/* ///////////////////////////////////////////////// */

export interface CheckOptions {
  id: string;
  name: string;
  outcome: AnalysisOutcome;
  /** Partial credit in the 0..1 range; defaults to the outcome's grade. */
  score?: number;
  value: AnalysisValue;
  numericValue?: number;
  description: string;
  reason: string;
  recommendation: string;
  limits?: AnalysisLimits;
  weight: number;
  severity?: AnalysisCheck['severity'];
  confidence?: number;
  dependsOn?: string;
  source?: AnalysisCheck['source'];
  evidence?: string[];
}

export interface CategoryOptions {
  id: AnalysisCategoryId;
  name: string;
  description: string;
  checks: AnalysisCheck[];
}

export interface RampRange {
  errorBelow: number;
  minimum: number;
  maximum: number;
  errorAbove: number;
}

/* ///////////////////////////////////////////////// */

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Piecewise-linear credit for range checks. A 79-character title and a
 * 61-character one no longer collapse onto the same grade, so every character
 * removed moves the score in the right direction.
 */
export const rampScore = (value: number, range: RampRange) => {
  if (value >= range.minimum && value <= range.maximum) {
    return 1;
  }

  if (value < range.minimum) {
    const span = range.minimum - range.errorBelow;
    return span <= 0 ? 0 : clamp((value - range.errorBelow) / span);
  }

  const span = range.errorAbove - range.maximum;
  return span <= 0 ? 0 : clamp((range.errorAbove - value) / span);
};

export const outcomeForScore = (score: number): AnalysisOutcome => {
  return score >= 1 ? 'pass' : score > 0 ? 'warn' : 'fail';
};

/**
 * Confidence is a real term in the score instead of decoration: a heuristic
 * that fails at 0.65 confidence forfeits only 65% of its weight, while a
 * deterministic signal forfeits all of it.
 */
const pointsFor = (
  outcome: AnalysisOutcome,
  score: number,
  weight: number,
  confidence: number,
): AnalysisPoints => {
  if (!SCORED_OUTCOMES.has(outcome)) {
    return { earned: 0, maximum: 0 };
  }

  const effective = score + (1 - score) * (1 - clamp(confidence));

  return { earned: round(weight * effective), maximum: weight };
};

const severityForWeight = (weight: number): AnalysisCheck['severity'] => {
  return weight >= 8 ? 'critical' : weight >= 5 ? 'high' : weight >= 3 ? 'medium' : 'low';
};

export const createCheck = (options: CheckOptions): AnalysisCheck => {
  const {
    confidence = 0.9,
    dependsOn,
    evidence = [],
    outcome,
    score: configuredScore,
    severity: configuredSeverity,
    source = 'metadata',
    weight,
    ...check
  } = options;

  const score = clamp(configuredScore ?? OUTCOME_SCORES[outcome]);

  return {
    ...check,
    outcome,
    score: round(score, 4),
    status: STATUS_BY_OUTCOME[outcome],
    applicable: SCORED_OUTCOMES.has(outcome),
    confidence,
    evidence,
    severity: configuredSeverity ?? severityForWeight(weight),
    source,
    weight,
    ...(dependsOn ? { dependsOn } : {}),
    points: pointsFor(outcome, score, weight, confidence),
  };
};

/**
 * Turns `dependsOn` into real behaviour: when the subject a check builds on is
 * missing or unmeasured, the derived check leaves the denominator instead of
 * charging the same defect a second time. A missing `og:image` is then paid for
 * once, by the check that owns it, rather than by four correlated ones.
 */
export const resolveCheckDependencies = (checks: AnalysisCheck[]): AnalysisCheck[] => {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const resolved = new Map<string, AnalysisCheck>();

  const resolve = (check: AnalysisCheck, seen: Set<string>): AnalysisCheck => {
    const cached = resolved.get(check.id);

    if (cached) {
      return cached;
    }

    const parentId = check.dependsOn;
    const parent = parentId ? byId.get(parentId) : undefined;

    if (!parent || seen.has(check.id)) {
      resolved.set(check.id, check);
      return check;
    }

    seen.add(check.id);

    const resolvedParent = resolve(parent, seen);
    const suppressed = check.applicable && SUPPRESSING_OUTCOMES.has(resolvedParent.outcome);

    const next: AnalysisCheck = suppressed
      ? {
          ...check,
          outcome: 'not-applicable',
          status: STATUS_BY_OUTCOME['not-applicable'],
          applicable: false,
          score: 0,
          reason: `Not evaluated: ${resolvedParent.name.toLocaleLowerCase()} could not be established, and that gap is scored there.`,
          points: { earned: 0, maximum: 0 },
        }
      : check;

    resolved.set(check.id, next);

    return next;
  };

  return checks.map((check) => resolve(check, new Set()));
};

export const summarizeChecks = (checks: AnalysisCheck[]): AnalysisSummary => {
  return checks.reduce<AnalysisSummary>(
    (summary, check) => {
      summary.total += 1;

      if (check.outcome === 'unknown') {
        summary.unknown += 1;
        return summary;
      }

      if (check.outcome === 'not-applicable') {
        summary.notApplicable += 1;
        return summary;
      }

      summary.applicable += 1;

      if (check.outcome === 'pass') {
        summary.passed += 1;
      } else if (check.outcome === 'warn') {
        summary.warnings += 1;
      } else {
        summary.errors += 1;
      }

      return summary;
    },
    {
      total: 0,
      applicable: 0,
      notApplicable: 0,
      unknown: 0,
      passed: 0,
      errors: 0,
      warnings: 0,
    },
  );
};

/** `null` rather than a fabricated 100 when nothing could be evaluated. */
export const percentageOf = (earned: number, maximum: number): number | null => {
  return maximum === 0 ? null : Math.round((earned / maximum) * 100);
};

export const sumPoints = (items: Array<{ points: AnalysisPoints }>): AnalysisPoints => {
  return items.reduce(
    (total, item) => ({
      earned: round(total.earned + item.points.earned),
      maximum: round(total.maximum + item.points.maximum),
    }),
    { earned: 0, maximum: 0 },
  );
};

export const coverageOf = (checks: AnalysisCheck[]): AnalysisCoverage => {
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const evaluated = checks.reduce((sum, check) => sum + check.points.maximum, 0);

  return {
    evaluated: round(evaluated),
    total: round(total),
    ratio: total === 0 ? 0 : round(evaluated / total, 4),
  };
};

export const createCategory = (options: CategoryOptions): AnalysisCategory => {
  const points = sumPoints(options.checks);

  return {
    ...options,
    weight: CATEGORY_WEIGHTS[options.id],
    score: percentageOf(points.earned, points.maximum),
    summary: summarizeChecks(options.checks),
    points,
  };
};

/**
 * Each category is normalized before it enters the average, so the global score
 * depends on the declared category weights and not on how many checks a mode
 * happened to run. Quick and deep results become comparable.
 */
export const aggregateScore = (categories: AnalysisCategory[]): number | null => {
  let weighted = 0;
  let total = 0;

  for (const category of categories) {
    if (category.points.maximum === 0) {
      continue;
    }

    weighted += (category.points.earned / category.points.maximum) * category.weight;
    total += category.weight;
  }

  return total === 0 ? null : Math.round((weighted / total) * 100);
};
