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

export interface OpengraphImage {
  url?: string;
  alt?: string;
  type?: string;
  width?: number;
  height?: number;
  secureUrl?: string;
}

export interface General {
  title?: string;
  description?: string;
  url?: string;
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
  favicons?: Favicon[];
  themeColors?: ThemeColor[];
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
  video?: string;
  videoType?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoSecureUrl?: string;
  image?: string;
  imageAlt?: string;
  images?: OpengraphImage[];
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleExpirationTime?: string;
  articleAuthor?: string[];
  articleSection?: string;
  articleTag?: string[];
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
  bingbot?: string;
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
  general: General;
  opengraph: Opengraph;
  twitter: Twitter;
  mobile: Mobile;
  crawler: Crawler;
}
