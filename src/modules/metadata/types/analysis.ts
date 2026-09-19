/* ------- root ------- */

import type { Metadata } from './metadata';

export interface Analysis {
  resolvedUrl: string;
  requestedUrl: string;

  mode: AnalysisMode;

  /** Weighted average of the category scores; `null` when nothing was evaluated. */
  score: number | null;
  scores: AnalysisScores;
  summary: AnalysisSummary;
  scoring: AnalysisScoring;
  categories: AnalysisCategory[];
}

export type AnalysisMode = 'quick' | 'deep';

export interface AnalysisScores {
  social: number | null;
  content: number | null;
  technical: number | null;
  indexability: number | null;
}

export interface AnalysisSummary {
  total: number;
  passed: number;
  errors: number;
  unknown: number;
  warnings: number;
  applicable: number;
  notApplicable: number;
}

/* ------- scoring model ------- */

export interface AnalysisScoring {
  version: '3.0';
  method: 'weighted-category';

  points: AnalysisPoints;
  coverage: AnalysisCoverage;
  /** Ids of every check that did not enter the score. */
  skipped: string[];

  outcomeScores: Record<AnalysisOutcome, number>;
  categoryWeights: Record<AnalysisCategoryId, number>;
}

export interface AnalysisPoints {
  earned: number;
  maximum: number;
}

export interface AnalysisCoverage {
  /** Weight of every check that was considered, evaluated or not. */
  total: number;
  ratio: number;
  /** Weight that actually entered the score. */
  evaluated: number;
}

/* ------- categories ------- */

export type AnalysisCategoryId =
  | 'basic-seo'
  | 'indexing'
  | 'content'
  | 'social'
  | 'urls'
  | 'technical';

export interface AnalysisCategory {
  id: AnalysisCategoryId;
  name: string;
  description: string;

  /** `null` when nothing in the category could be evaluated. */
  score: number | null;
  weight: number;
  points: AnalysisPoints;
  summary: AnalysisSummary;

  checks: AnalysisCheck[];
}

/* ------- checks ------- */

export interface AnalysisCheck {
  id: string;
  name: string;
  description: string;

  outcome: AnalysisOutcome;
  /** UI projection of `outcome`; the scoring model never reads it. */
  status: AnalysisStatus;
  /** Continuous grade in the 0..1 range; enables partial credit. */
  score: number;
  weight: number;
  points: AnalysisPoints;
  severity: AnalysisSeverity;
  confidence: number;
  /** True when the check contributes to both sides of the score fraction. */
  applicable: boolean;
  /** Check whose subject this one builds on; drives dependency suppression. */
  dependsOn?: string;

  value: AnalysisValue;
  numericValue?: number;
  limits?: AnalysisLimits;

  reason: string;
  source: AnalysisSource;
  evidence: string[];
  recommendation: string;
}

/**
 * What the check actually concluded.
 *
 * - `pass` / `warn` / `fail`: the subject exists and was graded.
 * - `absent`: the subject is missing and that absence is itself the defect,
 *   so the check still consumes its full weight.
 * - `not-applicable`: the check does not apply to this page, or the defect is
 *   already charged by another check. Leaves the denominator entirely.
 * - `unknown`: the check could not be evaluated (timeout, missing signal).
 *   Leaves the denominator instead of being scored as a failure.
 */
export type AnalysisOutcome =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'absent'
  | 'not-applicable'
  | 'unknown';

export type AnalysisStatus = 'passed' | 'warning' | 'error' | 'skipped';

export type AnalysisSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AnalysisSource =
  | 'metadata'
  | 'html'
  | 'http'
  | 'robots.txt'
  | 'sitemap'
  | 'remote-resource';

export type AnalysisValue = string | number | boolean | string[] | null;

export interface AnalysisLimits {
  unit: AnalysisLimitUnit;
  ideal?: string;
  minimum?: number;
  maximum?: number;
}

export type AnalysisLimitUnit = 'characters' | 'items' | 'pixels' | 'query-parameters';

/* ------- analysis context ------- */

/** Everything a check may read besides the extracted . */
export interface AnalysisContext {
  mode: AnalysisMode;
  /** DOM-level facts the extractors do not model. */
  document?: DocumentSignals;
  /** The response that delivered the document. */
  http?: HttpSignals;
  /** Network probes; only populated in deep mode. */
  deep?: DeepAnalysisSignals;
}

/** Input shared by every check. */
export type CheckInput = {
  metadata: Metadata;
  context: AnalysisContext;
};

/* ------- document signals ------- */

export interface DocumentSignals {
  titleCount: number;
  canonicalCount: number;
  descriptionCount: number;

  h1s: string[];
  mainText: string;
  images: DocumentImageSignal[];
  /**  declared outside the head; empty when the head is implicit. */
  metadataOutsideHead: string[];
  detectedLanguage?: DetectedLanguage;
}

export interface DocumentImageSignal {
  alt?: string;
  src?: string;
}

export interface DetectedLanguage {
  code: 'en' | 'es' | 'pt';
  confidence: number;
}

/* ------- http signals ------- */

export interface HttpSignals {
  status: number;
  headers: Record<string, string>;
  redirects: string[];
}

/* ------- deep signals ------- */

export interface DeepAnalysisSignals {
  robots?: RobotsSignals;
  sitemap?: SitemapSignals;
  resources: RemoteResourceSignal[];
  alternates: AlternatePageSignal[];
}

/** Fields shared by every remote probe. */
export interface RemoteProbeSignal {
  url: string;
  status?: number;
  error?: string;
  /** The request ran out of time; the subject is unmeasured, not broken. */
  timeout?: boolean;
}

export type RemoteResourceKind = 'favicon' | 'open-graph-image' | 'twitter-image';

export interface RemoteResourceSignal extends RemoteProbeSignal {
  kind: RemoteResourceKind;
  bytes?: number;
  width?: number;
  height?: number;
  contentType?: string;
}

export interface RobotsSignals extends RemoteProbeSignal {
  /** `null` when no rule applies, which means crawling is allowed by default. */
  allowed: boolean | null;
  sitemaps: string[];
}

export interface SitemapSignals extends RemoteProbeSignal {
  /** `null` when the sitemap could only be read partially without a match. */
  containsCanonical: boolean | null;
  /** Number of sitemap documents inspected, following one index level. */
  inspected?: number;
}

export interface AlternatePageSignal extends RemoteProbeSignal {
  hrefLang?: string;
  canonical?: string;
  reciprocal: boolean | null;
  /** The body was cut before `</head>`, so canonical and hreflang are unknown. */
  truncated?: boolean;
}
