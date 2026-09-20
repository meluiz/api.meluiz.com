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

/** One application/ld+json block, with the types it declares and its own issues. */
export const StructuredDataBlock = z.object({
  format: z.literal('json-ld'),
  valid: z.boolean().meta({ description: 'The block parsed as JSON' }),

  types: z
    .array(z.string())
    .meta({ description: 'schema.org types declared in this block, @graph flattened' }),

  issues: z.array(StructuredDataIssue),
});

export type StructuredDataBlock = z.infer<typeof StructuredDataBlock>;

export const StructuredData = z.object({
  blocks: z.array(StructuredDataBlock).meta({
    description:
      'One entry per structured-data block. Counts and the union of types are derived from it, so a block is never confused with a type.',
  }),
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
    siteName: z.string().optional(),
    determiner: z.string().optional(),
    description: z.string().optional(),

    locale: z.string().optional(),
    localeAlternate: z.array(z.string()).optional(),

    images: z.array(OpengraphImage).optional().meta({
      description: 'Every og:image in declaration order; the first is the primary one',
    }),
    videos: z.array(OpengraphMedia).optional(),
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

/* ------- remote resources ------- */

export const RemoteProbeSignal = z.object({
  url: z.string(),
  status: z.number().optional(),
  error: z.string().optional(),

  /** The request ran out of time; the subject is unmeasured, not broken. */
  timeout: z.boolean().optional(),
});

export type RemoteProbeSignal = z.infer<typeof RemoteProbeSignal>;

export const RemoteResourceKind = z.enum([
  'favicon',
  'touch-icon',
  'open-graph-image',
  'twitter-image',
]);

export type RemoteResourceKind = z.infer<typeof RemoteResourceKind>;

/**
 * A declared image after it has actually been fetched: real dimensions, real
 * byte size, real status. `width`/`height` here are measured, unlike the ones a
 * page declares through og:image:width or a link's sizes attribute.
 */
export const RemoteResourceSignal = RemoteProbeSignal.extend({
  kind: RemoteResourceKind,
  bytes: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  contentType: z.string().optional(),
});

export type RemoteResourceSignal = z.infer<typeof RemoteResourceSignal>;

/* ------- root ------- */

export const RedirectHop = z.object({
  from: z.string(),
  to: z.string(),
  status: z.number().int().meta({ description: '301, 302, 303, 307 or 308' }),
});

export type RedirectHop = z.infer<typeof RedirectHop>;

export const MetadataDocument = z.object({
  status: z.number().int(),
  contentType: z.string(),

  bytes: z.number().int().meta({ description: 'Bytes read from the body' }),
  limit: z
    .number()
    .int()
    .meta({ description: 'Byte ceiling applied to the read; `truncated` is bytes === limit' }),
  truncated: z.boolean(),

  headers: z.record(z.string(), z.string()).meta({
    description:
      'Response headers that change how a crawler treats the page, such as x-robots-tag. An allowlist, not the full set.',
  }),

  redirects: z
    .array(RedirectHop)
    .meta({ description: 'Hops followed after the requested one, in order' }),
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

    resources: z.array(RemoteResourceSignal).optional().meta({
      description:
        'Declared images and icons after being fetched and measured. Present only when the request asks for it, since each entry costs a request.',
    }),
  })
  .meta({ id: 'Metadata' });

export type Metadata = z.infer<typeof Metadata>;
