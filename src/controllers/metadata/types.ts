export interface Author {
  name?: string;
  href?: string;
}

export interface Favicon {
  rel?: string;
  type?: string;
  sizes?: string;
  href?: string;
}

export interface ThemeColor {
  media?: string;
  value?: string;
}

export interface TouchIcon {
  sizes?: string;
  href?: string;
}

export interface Alternate {
  href?: string;
  hrefLang?: string;
  media?: string;
  type?: string;
  title?: string;
}

export interface StructuredData {
  count: number;
  valid: number;
  invalid: number;
  types: string[];
  issues: StructuredDataIssue[];
}

export interface StructuredDataIssue {
  type?: string;
  property?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface SiteVerification {
  google?: string;
  bing?: string;
  yandex?: string;
  pinterest?: string;
}

export interface OpengraphMedia {
  url?: string;
  secureUrl?: string;
  type?: string;
  width?: number;
  height?: number;
}

export interface OpengraphImage {
  url?: string;
  alt?: string;
  type?: string;
  width?: number;
  height?: number;
  secureUrl?: string;
}

export interface TwitterLabel {
  label?: string;
  data?: string;
}

export interface General {
  title?: string;
  description?: string;
  url?: string;
  baseUrl?: string;
  previous?: string;
  next?: string;
  language?: string;
  charset?: string;
  robots?: string;
  keywords?: string;
  generator?: string;
  license?: string;
  viewport?: string;
  colorScheme?: string;
  formatDetection?: string;
  applicationName?: string;
  manifest?: string;
  authors?: Author[];
  alternates?: Alternate[];
  favicons?: Favicon[];
  themeColors?: ThemeColor[];
  verification?: SiteVerification;
  structuredData?: StructuredData;
}

export interface Opengraph {
  title?: string;
  type?: string;
  url?: string;
  description?: string;
  determiner?: string;
  locale?: string;
  localeAlternate?: string[];
  siteName?: string;
  keywords?: string;
  audio?: string;
  audioType?: string;
  audioSecureUrl?: string;
  audios?: OpengraphMedia[];
  video?: string;
  videoType?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoSecureUrl?: string;
  videos?: OpengraphMedia[];
  image?: string;
  imageAlt?: string;
  images?: OpengraphImage[];
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleExpirationTime?: string;
  articleAuthor?: string[];
  articleSection?: string;
  articleTag?: string[];
  facebookAppId?: string;
  facebookAdmins?: string[];
  facebookPages?: string[];
}

export interface Twitter {
  card?: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  site?: string;
  siteId?: string;
  creator?: string;
  creatorId?: string;
  player?: string;
  playerWidth?: string;
  playerHeight?: string;
  playerStream?: string;
  appCountry?: string;
  appNameIphone?: string;
  appIdIphone?: string;
  appUrlIphone?: string;
  appNameIpad?: string;
  appIdIpad?: string;
  appUrlIpad?: string;
  appNameGoogleplay?: string;
  appIdGoogleplay?: string;
  appUrlGoogleplay?: string;
  labels?: TwitterLabel[];
}

export interface Mobile {
  appleTouchIcons?: TouchIcon[];
  appleTouchIconsPrecomposed?: TouchIcon[];
  mobileWebAppCapable?: string;
  appleMobileWebAppCapable?: string;
  appleMobileWebAppTitle?: string;
  appleMobileWebAppStatusBarStyle?: string;
}

export interface Crawler {
  robots?: string;
  googlebot?: string;
  googlebotNews?: string;
  googlebotImage?: string;
  bingbot?: string;
  yandex?: string;
  baiduspider?: string;
  referrer?: string;
}

export interface MetadataDocument {
  bytes: number;
  status: number;
  truncated: boolean;
  contentType: string;
  redirects: string[];
}

export interface Metadata {
  requestedUrl: string;
  resolvedUrl: string;
  document?: MetadataDocument;
  general: General;
  opengraph: Opengraph;
  twitter: Twitter;
  mobile: Mobile;
  crawler: Crawler;
}

export type MetadataAnalysisStatus = 'passed' | 'error' | 'warning' | 'skipped';

/**
 * What the check actually concluded. `status` stays as a UI-facing projection
 * of this value; the scoring model only ever reads the outcome.
 *
 * - `pass` / `warn` / `fail`: the subject exists and was graded.
 * - `absent`: the subject is missing and that absence is itself the defect,
 *   so the check still consumes its full weight.
 * - `not-applicable`: the check does not apply to this page, or the defect is
 *   already charged by another check. Leaves the denominator entirely.
 * - `unknown`: the check could not be evaluated (timeout, missing signal).
 *   Leaves the denominator instead of being scored as a failure.
 */
export type MetadataAnalysisOutcome =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'absent'
  | 'not-applicable'
  | 'unknown';

export type MetadataAnalysisMode = 'quick' | 'deep';

export type MetadataAnalysisSeverity = 'critical' | 'high' | 'medium' | 'low';

export type MetadataAnalysisSource =
  | 'metadata'
  | 'html'
  | 'http'
  | 'robots.txt'
  | 'sitemap'
  | 'remote-resource';

export type MetadataAnalysisCategoryId =
  | 'basic-seo'
  | 'indexing'
  | 'content'
  | 'social'
  | 'urls'
  | 'technical';

export type MetadataAnalysisValue = string | number | boolean | string[] | null;

export type MetadataAnalysisLimitUnit = 'characters' | 'items' | 'pixels' | 'query-parameters';

export interface MetadataAnalysisLimits {
  unit: MetadataAnalysisLimitUnit;
  minimum?: number;
  maximum?: number;
  ideal?: string;
}

export interface MetadataAnalysisPoints {
  earned: number;
  maximum: number;
}

export interface MetadataAnalysisCheck {
  id: string;
  name: string;
  status: MetadataAnalysisStatus;
  outcome: MetadataAnalysisOutcome;
  /** Continuous grade in the 0..1 range; enables partial credit. */
  score: number;
  value: MetadataAnalysisValue;
  numericValue?: number;
  description: string;
  reason: string;
  recommendation: string;
  severity: MetadataAnalysisSeverity;
  confidence: number;
  /** True when the check contributes to both sides of the score fraction. */
  applicable: boolean;
  weight: number;
  /** Check whose subject this one builds on; drives dependency suppression. */
  dependsOn?: string;
  source: MetadataAnalysisSource;
  evidence: string[];
  limits?: MetadataAnalysisLimits;
  points: MetadataAnalysisPoints;
}

export interface MetadataAnalysisSummary {
  total: number;
  applicable: number;
  notApplicable: number;
  unknown: number;
  passed: number;
  errors: number;
  warnings: number;
}

export interface MetadataAnalysisCategory {
  id: MetadataAnalysisCategoryId;
  name: string;
  description: string;
  /** `null` when nothing in the category could be evaluated. */
  score: number | null;
  weight: number;
  summary: MetadataAnalysisSummary;
  points: MetadataAnalysisPoints;
  checks: MetadataAnalysisCheck[];
}

export interface MetadataAnalysisCoverage {
  /** Weight that actually entered the score. */
  evaluated: number;
  /** Weight of every check that was considered, evaluated or not. */
  total: number;
  ratio: number;
}

export interface MetadataAnalysisScoring {
  version: '3.0';
  method: 'weighted-category';
  outcomeScores: Record<MetadataAnalysisOutcome, number>;
  categoryWeights: Record<MetadataAnalysisCategoryId, number>;
  points: MetadataAnalysisPoints;
  coverage: MetadataAnalysisCoverage;
  skipped: string[];
}

export interface MetadataAnalysisScores {
  technical: number | null;
  indexability: number | null;
  content: number | null;
  social: number | null;
}

export interface MetadataAnalysis {
  requestedUrl: string;
  resolvedUrl: string;
  mode: MetadataAnalysisMode;
  score: number | null;
  scores: MetadataAnalysisScores;
  summary: MetadataAnalysisSummary;
  scoring: MetadataAnalysisScoring;
  categories: MetadataAnalysisCategory[];
}
