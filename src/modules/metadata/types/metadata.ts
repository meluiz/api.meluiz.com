/* ------- root ------- */

export interface Metadata {
  resolvedUrl: string;
  requestedUrl: string;

  /** Present on extraction responses; omitted when the metadata feeds an analysis. */
  document?: MetadataDocument;

  mobile: Mobile;
  general: General;
  crawler: Crawler;
  twitter: Twitter;
  opengraph: Opengraph;
}

export interface MetadataDocument {
  status: number;
  contentType: string;

  /** Bytes read from the body, capped by the fetch byte limit. */
  bytes: number;
  truncated: boolean;

  /** URLs followed after the requested one, in order. */
  redirects: string[];
}

/* ------- shared ------- */

/** An icon declared with a <link> element. */
export interface IconLink {
  href?: string;
  sizes?: string;
}

/* ------- general ------- */

export interface General {
  /** Canonical URL, from <link rel="canonical">. */
  url?: string;
  title?: string;
  language?: string;
  description?: string;

  next?: string;
  previous?: string;
  alternates?: Alternate[];

  /** Declared <base href>, when valid. */
  baseUrl?: string;
  charset?: string;
  viewport?: string;
  colorScheme?: string;
  formatDetection?: string;

  /** Same source as Crawler.robots; kept for compatibility. */
  robots?: string;

  authors?: Author[];
  license?: string;
  keywords?: string;
  generator?: string;
  applicationName?: string;

  favicons?: Favicon[];
  manifest?: string;
  themeColors?: ThemeColor[];

  verification?: SiteVerification;
  structuredData?: StructuredData;
}

export interface Alternate {
  href?: string;
  type?: string;
  media?: string;
  title?: string;
  hrefLang?: string;
}

export interface Author {
  href?: string;
  name?: string;
}

export interface Favicon extends IconLink {
  rel?: string;
  type?: string;
}

export interface ThemeColor {
  media?: string;
  value?: string;
}

export interface SiteVerification {
  bing?: string;
  google?: string;
  yandex?: string;
  pinterest?: string;
}

export interface StructuredData {
  /** Number of application/ld+json blocks. */
  count: number;
  /** Blocks that parsed as JSON. */
  valid: number;
  invalid: number;

  types: string[];
  issues: StructuredDataIssue[];
}

export interface StructuredDataIssue {
  type?: string;
  property?: string;

  message: string;
  severity: 'error' | 'warning';
}

/* ------- open graph ------- */

export interface Opengraph {
  url?: string;
  type?: string;
  title?: string;
  keywords?: string;
  siteName?: string;
  determiner?: string;
  description?: string;

  locale?: string;
  localeAlternate?: string[];

  /** First item of `images`, flattened. */
  image?: string;
  imageAlt?: string;
  images?: OpengraphImage[];

  /** First item of `videos`, flattened. */
  video?: string;
  videoType?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoSecureUrl?: string;
  videos?: OpengraphMedia[];

  /** First item of `audios`, flattened. */
  audio?: string;
  audioType?: string;
  audioSecureUrl?: string;
  audios?: OpengraphMedia[];

  articleTag?: string[];
  articleAuthor?: string[];
  articleSection?: string;
  articleModifiedTime?: string;
  articlePublishedTime?: string;
  articleExpirationTime?: string;

  facebookAppId?: string;
  facebookPages?: string[];
  facebookAdmins?: string[];
}

export interface OpengraphMedia {
  url?: string;
  type?: string;
  width?: number;
  height?: number;
  secureUrl?: string;
}

export interface OpengraphImage extends OpengraphMedia {
  alt?: string;
}

/* ------- twitter ------- */

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

  appIdIphone?: string;
  appUrlIphone?: string;
  appNameIphone?: string;

  appIdIpad?: string;
  appUrlIpad?: string;
  appNameIpad?: string;

  appIdGoogleplay?: string;
  appUrlGoogleplay?: string;
  appNameGoogleplay?: string;

  labels?: TwitterLabel[];
}

export interface TwitterLabel {
  data?: string;
  label?: string;
}

/* ------- mobile ------- */

export interface Mobile {
  mobileWebAppCapable?: string;

  appleMobileWebAppTitle?: string;
  appleMobileWebAppCapable?: string;
  appleMobileWebAppStatusBarStyle?: string;

  appleTouchIcons?: TouchIcon[];
  appleTouchIconsPrecomposed?: TouchIcon[];
}

export type TouchIcon = IconLink;

/* ------- crawler ------- */

export interface Crawler {
  robots?: string;
  /** Browser referrer policy, not a crawler directive. */
  referrer?: string;

  yandex?: string;
  bingbot?: string;
  baiduspider?: string;

  googlebot?: string;
  googlebotNews?: string;
  googlebotImage?: string;
}
