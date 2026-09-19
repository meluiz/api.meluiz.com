import { z } from 'zod';

/*
 * Response types are declared as Zod schemas and the TypeScript types are
 * derived from them, so the OpenAPI document and the code share one source.
 * Each schema and its type have the same name: `Metadata` is the schema in
 * value position and the type in type position.
 */

/* ------- shared ------- */

/** An icon declared with a <link> element. */
export const IconLink = z.object({
  href: z.string().optional(),
  sizes: z.string().optional(),
});

export type IconLink = z.infer<typeof IconLink>;

/* ------- general ------- */

export const Alternate = z.object({
  href: z.string().optional(),
  type: z.string().optional(),
  media: z.string().optional(),
  title: z.string().optional(),
  hrefLang: z.string().optional(),
});

export type Alternate = z.infer<typeof Alternate>;

export const Author = z.object({
  href: z.string().optional(),
  name: z.string().optional(),
});

export type Author = z.infer<typeof Author>;

export const Favicon = IconLink.extend({
  rel: z.string().optional(),
  type: z.string().optional(),
});

export type Favicon = z.infer<typeof Favicon>;

export const ThemeColor = z.object({
  media: z.string().optional(),
  value: z.string().optional(),
});

export type ThemeColor = z.infer<typeof ThemeColor>;

export const SiteVerification = z.object({
  bing: z.string().optional(),
  google: z.string().optional(),
  yandex: z.string().optional(),
  pinterest: z.string().optional(),
});

export type SiteVerification = z.infer<typeof SiteVerification>;

export const StructuredDataIssue = z.object({
  type: z.string().optional(),
  property: z.string().optional(),

  message: z.string(),
  severity: z.enum(['error', 'warning']),
});

export type StructuredDataIssue = z.infer<typeof StructuredDataIssue>;

export const StructuredData = z.object({
  count: z.number().int().meta({ description: 'Number of application/ld+json blocks' }),
  valid: z.number().int().meta({ description: 'Blocks that parsed as JSON' }),
  invalid: z.number().int(),

  types: z.array(z.string()),
  issues: z.array(StructuredDataIssue),
});

export type StructuredData = z.infer<typeof StructuredData>;

export const General = z
  .object({
    url: z
      .string()
      .optional()
      .meta({ description: 'Canonical URL, from <link rel="canonical">' }),
    title: z.string().optional(),
    language: z.string().optional(),
    description: z.string().optional(),

    next: z.string().optional(),
    previous: z.string().optional(),
    alternates: z.array(Alternate).optional(),

    baseUrl: z.string().optional().meta({ description: 'Declared <base href>, when valid' }),
    charset: z.string().optional(),
    viewport: z.string().optional(),
    colorScheme: z.string().optional(),
    formatDetection: z.string().optional(),

    robots: z
      .string()
      .optional()
      .meta({ description: 'Same source as crawler.robots; kept for compatibility' }),

    authors: z.array(Author).optional(),
    license: z.string().optional(),
    keywords: z.string().optional(),
    generator: z.string().optional(),
    applicationName: z.string().optional(),

    favicons: z.array(Favicon).optional(),
    manifest: z.string().optional(),
    themeColors: z.array(ThemeColor).optional(),

    verification: SiteVerification.optional(),
    structuredData: StructuredData.optional(),
  })
  .meta({ id: 'General' });

export type General = z.infer<typeof General>;

/* ------- open graph ------- */

export const OpengraphMedia = z.object({
  url: z.string().optional(),
  type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  secureUrl: z.string().optional(),
});

export type OpengraphMedia = z.infer<typeof OpengraphMedia>;

export const OpengraphImage = OpengraphMedia.extend({
  alt: z.string().optional(),
});

export type OpengraphImage = z.infer<typeof OpengraphImage>;

export const Opengraph = z
  .object({
    url: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    keywords: z.string().optional(),
    siteName: z.string().optional(),
    determiner: z.string().optional(),
    description: z.string().optional(),

    locale: z.string().optional(),
    localeAlternate: z.array(z.string()).optional(),

    image: z.string().optional().meta({ description: 'First item of images, flattened' }),
    imageAlt: z.string().optional(),
    images: z.array(OpengraphImage).optional(),

    video: z.string().optional().meta({ description: 'First item of videos, flattened' }),
    videoType: z.string().optional(),
    videoWidth: z.number().optional(),
    videoHeight: z.number().optional(),
    videoSecureUrl: z.string().optional(),
    videos: z.array(OpengraphMedia).optional(),

    audio: z.string().optional().meta({ description: 'First item of audios, flattened' }),
    audioType: z.string().optional(),
    audioSecureUrl: z.string().optional(),
    audios: z.array(OpengraphMedia).optional(),

    articleTag: z.array(z.string()).optional(),
    articleAuthor: z.array(z.string()).optional(),
    articleSection: z.string().optional(),
    articleModifiedTime: z.string().optional(),
    articlePublishedTime: z.string().optional(),
    articleExpirationTime: z.string().optional(),

    facebookAppId: z.string().optional(),
    facebookPages: z.array(z.string()).optional(),
    facebookAdmins: z.array(z.string()).optional(),
  })
  .meta({ id: 'Opengraph' });

export type Opengraph = z.infer<typeof Opengraph>;

/* ------- twitter ------- */

export const TwitterLabel = z.object({
  data: z.string().optional(),
  label: z.string().optional(),
});

export type TwitterLabel = z.infer<typeof TwitterLabel>;

export const Twitter = z
  .object({
    card: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),

    image: z.string().optional(),
    imageAlt: z.string().optional(),

    site: z.string().optional(),
    siteId: z.string().optional(),

    creator: z.string().optional(),
    creatorId: z.string().optional(),

    player: z.string().optional(),
    playerWidth: z.string().optional(),
    playerHeight: z.string().optional(),
    playerStream: z.string().optional(),

    appCountry: z.string().optional(),

    appIdIphone: z.string().optional(),
    appUrlIphone: z.string().optional(),
    appNameIphone: z.string().optional(),

    appIdIpad: z.string().optional(),
    appUrlIpad: z.string().optional(),
    appNameIpad: z.string().optional(),

    appIdGoogleplay: z.string().optional(),
    appUrlGoogleplay: z.string().optional(),
    appNameGoogleplay: z.string().optional(),

    labels: z.array(TwitterLabel).optional(),
  })
  .meta({ id: 'Twitter' });

export type Twitter = z.infer<typeof Twitter>;

/* ------- mobile ------- */

export const TouchIcon = IconLink;

export type TouchIcon = z.infer<typeof TouchIcon>;

export const Mobile = z
  .object({
    mobileWebAppCapable: z.string().optional(),

    appleMobileWebAppTitle: z.string().optional(),
    appleMobileWebAppCapable: z.string().optional(),
    appleMobileWebAppStatusBarStyle: z.string().optional(),

    appleTouchIcons: z.array(TouchIcon).optional(),
    appleTouchIconsPrecomposed: z.array(TouchIcon).optional(),
  })
  .meta({ id: 'Mobile' });

export type Mobile = z.infer<typeof Mobile>;

/* ------- crawler ------- */

export const Crawler = z
  .object({
    robots: z.string().optional(),
    referrer: z
      .string()
      .optional()
      .meta({ description: 'Browser referrer policy, not a crawler directive' }),

    yandex: z.string().optional(),
    bingbot: z.string().optional(),
    baiduspider: z.string().optional(),

    googlebot: z.string().optional(),
    googlebotNews: z.string().optional(),
    googlebotImage: z.string().optional(),
  })
  .meta({ id: 'Crawler' });

export type Crawler = z.infer<typeof Crawler>;

/* ------- root ------- */

export const MetadataDocument = z.object({
  status: z.number().int(),
  contentType: z.string(),

  bytes: z
    .number()
    .int()
    .meta({ description: 'Bytes read from the body, capped by the fetch byte limit' }),
  truncated: z.boolean(),

  redirects: z
    .array(z.string())
    .meta({ description: 'URLs followed after the requested one, in order' }),
});

export type MetadataDocument = z.infer<typeof MetadataDocument>;

export const Metadata = z
  .object({
    resolvedUrl: z.string(),
    requestedUrl: z.string(),

    document: MetadataDocument.optional().meta({
      description:
        'Present on extraction responses; omitted when the metadata feeds an analysis',
    }),

    general: General,
    opengraph: Opengraph,
    twitter: Twitter,
    mobile: Mobile,
    crawler: Crawler,
  })
  .meta({ id: 'Metadata' });

export type Metadata = z.infer<typeof Metadata>;
