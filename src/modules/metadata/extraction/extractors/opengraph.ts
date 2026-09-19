import type { Opengraph, OpengraphImage, OpengraphMedia } from '../../schemas';
import type { ExtractorContext } from '../context';

/* ///////////////////////////////////////////////// */

// Properties that open a sequence of items refined by the tags that follow them
// (og:image, og:image:width, og:image:alt, og:image, ...)
const STRUCTURED_ROOTS = ['og:image', 'og:video', 'og:audio'] as const;

type StructuredRoot = (typeof STRUCTURED_ROOTS)[number];

const isStructuredRoot = (value: string): value is StructuredRoot => {
  return (STRUCTURED_ROOTS as readonly string[]).includes(value);
};

/* ///////////////////////////////////////////////// */

export const extractOpengraph = (ctx: ExtractorContext): Opengraph => {
  const { attribute, fromAll, meta, metaAll, resolve, toNumber } = ctx;

  const og = (name: string) => {
    return meta(`og:${name}`);
  };

  const ogAll = (name: string) => {
    return metaAll(`og:${name}`);
  };

  // article:* is the standard namespace; og:article:* is a common mistake we tolerate
  const article = (name: string) => {
    return meta(`article:${name}`) ?? og(`article:${name}`);
  };

  const articleAll = (name: string) => {
    const standard = metaAll(`article:${name}`);
    return standard.length > 0 ? standard : ogAll(`article:${name}`);
  };

  /* ------- structured properties (single pass, document order) ------- */

  const structured: Record<StructuredRoot, OpengraphImage[]> = {
    'og:image': [],
    'og:video': [],
    'og:audio': [],
  };

  for (const element of fromAll('meta')) {
    const property = (
      attribute(element, 'property') ?? attribute(element, 'name')
    )?.toLowerCase();
    const content = attribute(element, 'content');

    if (!property || !content) {
      continue;
    }

    const [namespace, name, field] = property.split(':');
    const root = `${namespace}:${name}`;

    if (!isStructuredRoot(root)) {
      continue;
    }

    const items = structured[root];
    const current = items.at(-1);

    if (field === undefined || field === 'url') {
      const url = resolve(content);

      // og:image followed by og:image:url with the same value describes one image
      if (current && current.url !== undefined && current.url === url) {
        continue;
      }

      items.push({ url });
      continue;
    }

    // Refinements before the first root tag have nothing to attach to
    if (!current) {
      continue;
    }

    switch (field) {
      case 'secure_url': {
        current.secureUrl = resolve(content);
        break;
      }

      case 'type': {
        current.type = content;
        break;
      }

      case 'width': {
        current.width = toNumber(content);
        break;
      }

      case 'height': {
        current.height = toNumber(content);
        break;
      }

      case 'alt': {
        // Only images carry alternative text
        if (root === 'og:image') {
          current.alt = content;
        }

        break;
      }
    }
  }

  const images = structured['og:image'];
  const videos: OpengraphMedia[] = structured['og:video'];
  const audios: OpengraphMedia[] = structured['og:audio'];

  // Flat fields describe the first declared item, so its alt, size and type
  // never come from a different image or video further down the page
  const [image] = images;
  const [video] = videos;
  const [audio] = audios;

  return {
    type: og('type'),
    title: og('title'),
    url: resolve(og('url')),
    keywords: og('keywords'),
    siteName: og('site_name'),
    determiner: og('determiner'),
    description: og('description'),

    articleTag: articleAll('tag'),
    articleSection: article('section'),
    articleAuthor: articleAll('author'),
    articleModifiedTime: article('modified_time'),
    articlePublishedTime: article('published_time'),
    articleExpirationTime: article('expiration_time'),

    audio: audio?.url,
    audioType: audio?.type,
    audioSecureUrl: audio?.secureUrl,
    audios,

    locale: og('locale'),
    localeAlternate: ogAll('locale:alternate'),

    videos,
    video: video?.url,
    videoType: video?.type,
    videoWidth: video?.width,
    videoHeight: video?.height,
    videoSecureUrl: video?.secureUrl,

    images,
    image: image?.url,
    imageAlt: image?.alt,

    facebookAppId: meta('fb:app_id'),
    facebookPages: metaAll('fb:pages'),
    facebookAdmins: metaAll('fb:admins'),
  };
};
