import { z } from 'zod';

import { Metadata } from './metadata';

/*
 * The analysis response is declared as Zod schemas, with the TypeScript types
 * derived from them, so the OpenAPI document and the code share one source.
 * The analysis context below is internal input and stays as plain interfaces.
 */

/* ------- enums ------- */

/**
 * What the check actually concluded. `absent` still consumes the full weight;
 * `not-applicable` and `unknown` leave the denominator.
 */
export const AnalysisOutcome = z
  .enum(['pass', 'warn', 'fail', 'absent', 'not-applicable', 'unknown'])
  .meta({
    description:
      'pass/warn/fail: graded. absent: missing, and the absence is the defect. not-applicable: does not apply or is charged elsewhere. unknown: could not be evaluated.',
  });

export type AnalysisOutcome = z.infer<typeof AnalysisOutcome>;

export const AnalysisStatus = z
  .enum(['passed', 'warning', 'error', 'skipped'])
  .meta({ description: 'UI projection of outcome; the scoring model never reads it' });

export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const AnalysisMode = z.enum(['quick', 'deep']);

export type AnalysisMode = z.infer<typeof AnalysisMode>;

export const AnalysisSeverity = z.enum(['critical', 'high', 'medium', 'low']);

export type AnalysisSeverity = z.infer<typeof AnalysisSeverity>;

export const AnalysisSource = z.enum([
  'metadata',
  'html',
  'http',
  'robots.txt',
  'sitemap',
  'remote-resource',
]);

export type AnalysisSource = z.infer<typeof AnalysisSource>;

export const AnalysisCategoryId = z.enum([
  'basic-seo',
  'indexing',
  'content',
  'social',
  'urls',
  'technical',
]);

export type AnalysisCategoryId = z.infer<typeof AnalysisCategoryId>;

export const AnalysisLimitUnit = z.enum(['characters', 'items', 'pixels', 'query-parameters']);

export type AnalysisLimitUnit = z.infer<typeof AnalysisLimitUnit>;

/* ------- scoring model ------- */

export const AnalysisPoints = z.object({
  earned: z.number(),
  maximum: z.number(),
});

export type AnalysisPoints = z.infer<typeof AnalysisPoints>;

export const AnalysisCoverage = z.object({
  total: z
    .number()
    .meta({ description: 'Weight of every check that was considered, evaluated or not' }),
  ratio: z.number(),
  evaluated: z.number().meta({ description: 'Weight that actually entered the score' }),
});

export type AnalysisCoverage = z.infer<typeof AnalysisCoverage>;

export const AnalysisScoring = z.object({
  version: z.literal('3.0'),
  method: z.literal('weighted-category'),

  points: AnalysisPoints,
  coverage: AnalysisCoverage,
  skipped: z
    .array(z.string())
    .meta({ description: 'Ids of every check that did not enter the score' }),

  outcomeScores: z.record(AnalysisOutcome, z.number()),
  categoryWeights: z.record(AnalysisCategoryId, z.number()),
});

export type AnalysisScoring = z.infer<typeof AnalysisScoring>;

export const AnalysisSummary = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  errors: z.number().int(),
  unknown: z.number().int(),
  warnings: z.number().int(),
  applicable: z.number().int(),
  notApplicable: z.number().int(),
});

export type AnalysisSummary = z.infer<typeof AnalysisSummary>;

/* ------- checks ------- */

export const AnalysisValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export type AnalysisValue = z.infer<typeof AnalysisValue>;

export const AnalysisLimits = z.object({
  unit: AnalysisLimitUnit,
  ideal: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
});

export type AnalysisLimits = z.infer<typeof AnalysisLimits>;

export const AnalysisCheck = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),

    outcome: AnalysisOutcome,
    status: AnalysisStatus,
    score: z.number().meta({ description: 'Continuous grade in the 0..1 range' }),
    weight: z.number(),
    points: AnalysisPoints,
    severity: AnalysisSeverity,
    confidence: z.number(),
    applicable: z
      .boolean()
      .meta({ description: 'True when the check contributes to both sides of the score' }),
    dependsOn: z
      .string()
      .optional()
      .meta({ description: 'Check whose subject this one builds on' }),

    value: AnalysisValue,
    numericValue: z.number().optional(),
    limits: AnalysisLimits.optional(),

    reason: z.string(),
    source: AnalysisSource,
    evidence: z.array(z.string()),
    recommendation: z.string(),
  })
  .meta({ id: 'AnalysisCheck' });

export type AnalysisCheck = z.infer<typeof AnalysisCheck>;

/* ------- categories ------- */

export const AnalysisCategory = z
  .object({
    id: AnalysisCategoryId,
    name: z.string(),
    description: z.string(),

    score: z
      .number()
      .nullable()
      .meta({ description: 'null when nothing in the category could be evaluated' }),
    weight: z.number(),
    points: AnalysisPoints,
    summary: AnalysisSummary,

    checks: z.array(AnalysisCheck),
  })
  .meta({ id: 'AnalysisCategory' });

export type AnalysisCategory = z.infer<typeof AnalysisCategory>;

/* ------- root ------- */

export const AnalysisScores = z.object({
  social: z.number().nullable(),
  content: z.number().nullable(),
  technical: z.number().nullable(),
  indexability: z.number().nullable(),
});

export type AnalysisScores = z.infer<typeof AnalysisScores>;

export const Analysis = z
  .object({
    resolvedUrl: z.string(),
    requestedUrl: z.string(),

    mode: AnalysisMode,

    score: z.number().nullable().meta({
      description: 'Weighted average of the category scores; null when nothing was evaluated',
    }),
    scores: AnalysisScores,
    summary: AnalysisSummary,
    scoring: AnalysisScoring,
    categories: z.array(AnalysisCategory),
  })
  .meta({ id: 'Analysis' });

export type Analysis = z.infer<typeof Analysis>;

/* ------- analysis context ------- */

/* ------- document signals ------- */

export const DetectedLanguage = z.object({
  code: z.enum(['en', 'es', 'pt']),
  confidence: z.number(),
});

export type DetectedLanguage = z.infer<typeof DetectedLanguage>;

export const DocumentImageSignal = z.object({
  alt: z.string().optional(),
  src: z.string().optional(),
});

export type DocumentImageSignal = z.infer<typeof DocumentImageSignal>;

export const DocumentSignals = z.object({
  titleCount: z.number(),
  canonicalCount: z.number(),
  descriptionCount: z.number(),

  h1s: z.array(z.string()),
  mainText: z.string(),
  images: z.array(DocumentImageSignal),

  /** Metadata declared outside the head; empty when the head is implicit. */
  metadataOutsideHead: z.array(z.string()),

  detectedLanguage: DetectedLanguage.optional(),
});

export type DocumentSignals = z.infer<typeof DocumentSignals>;

/* ------- http signals ------- */

export const HttpSignals = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()),
  redirects: z.array(z.string()),
});

export type HttpSignals = z.infer<typeof HttpSignals>;

/* ------- deep signals ------- */

export const RemoteProbeSignal = z.object({
  url: z.string(),
  status: z.number().optional(),
  error: z.string().optional(),

  /** The request ran out of time; the subject is unmeasured, not broken. */
  timeout: z.boolean().optional(),
});

export type RemoteProbeSignal = z.infer<typeof RemoteProbeSignal>;

export const RemoteResourceKind = z.enum(['favicon', 'open-graph-image', 'twitter-image']);

export type RemoteResourceKind = z.infer<typeof RemoteResourceKind>;

export const RemoteResourceSignal = RemoteProbeSignal.extend({
  kind: RemoteResourceKind,
  bytes: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  contentType: z.string().optional(),
});

export type RemoteResourceSignal = z.infer<typeof RemoteResourceSignal>;

export const RobotsSignals = RemoteProbeSignal.extend({
  /** `null` when no rule applies, which means crawling is allowed by default. */
  allowed: z.boolean().nullable(),
  sitemaps: z.array(z.string()),
});

export type RobotsSignals = z.infer<typeof RobotsSignals>;

export const SitemapSignals = RemoteProbeSignal.extend({
  /** `null` when the sitemap could only be read partially without a match. */
  containsCanonical: z.boolean().nullable(),

  /** Number of sitemap documents inspected, following one index level. */
  inspected: z.number().optional(),
});

export type SitemapSignals = z.infer<typeof SitemapSignals>;

export const AlternatePageSignal = RemoteProbeSignal.extend({
  hrefLang: z.string().optional(),
  canonical: z.string().optional(),
  reciprocal: z.boolean().nullable(),

  /** The body was cut before `</head>`, so canonical and hreflang are unknown. */
  truncated: z.boolean().optional(),
});

export type AlternatePageSignal = z.infer<typeof AlternatePageSignal>;

export const DeepAnalysisSignals = z.object({
  robots: RobotsSignals.optional(),
  sitemap: SitemapSignals.optional(),
  resources: z.array(RemoteResourceSignal),
  alternates: z.array(AlternatePageSignal),
});

export type DeepAnalysisSignals = z.infer<typeof DeepAnalysisSignals>;

/* ------- analysis context ------- */

/** Everything a check may read besides the extracted metadata. */
export const AnalysisContext = z
  .object({
    mode: AnalysisMode,

    /** DOM-level facts the extractors do not model. */
    document: DocumentSignals.optional(),

    /** The response that delivered the document. */
    http: HttpSignals.optional(),

    /** Network probes; only populated in deep mode. */
    deep: DeepAnalysisSignals.optional(),
  })
  .meta({ id: 'AnalysisContext' });

export type AnalysisContext = z.infer<typeof AnalysisContext>;

/** Input shared by every check. */
export const CheckInput = z
  .object({
    metadata: Metadata,
    context: AnalysisContext,
  })
  .meta({ id: 'CheckInput' });

export type CheckInput = z.infer<typeof CheckInput>;
