import type { Opengraph, OpengraphImage, OpengraphMedia } from '../types';
import type { ExtractorContext } from './context';

export const extractOpengraph = (ctx: ExtractorContext): Opengraph => {
  const { attribute, fromAll, meta, metaAll, resolve, toNumber } = ctx;

  const getOpengraph = (property: `og:${string}`) => {
    return meta(property);
  };

  const getOpengraphAll = (property: `og:${string}`) => {
    return metaAll(property);
  };

  const getArticle = (property: `article:${string}`) => {
    return meta(property) ?? getOpengraph(`og:${property}`);
  };

  const getAllArticle = (property: `article:${string}`) => {
    const standard = metaAll(property);
    return standard.length > 0 ? standard : getOpengraphAll(`og:${property}`);
  };

  const propertyOf = (element: Parameters<typeof attribute>[0]) => {
    return (attribute(element, 'property') ?? attribute(element, 'name'))?.toLowerCase();
  };

  const extractMedia = (prefix: 'og:audio' | 'og:video') => {
    return fromAll('meta').reduce((items, element) => {
      const property = propertyOf(element);
      const content = attribute(element, 'content');

      if (!property?.startsWith(prefix) || !content) {
        return items;
      }

      const suffix = property.slice(prefix.length);

      if (!suffix || suffix === ':url') {
        items.push({ url: resolve(content) });
        return items;
      }

      const current = items[items.length - 1];

      if (!current) {
        return items;
      }

      if (suffix === ':secure_url') {
        current.secureUrl = resolve(content);
      } else if (suffix === ':type') {
        current.type = content;
      } else if (suffix === ':width') {
        current.width = toNumber(content);
      } else if (suffix === ':height') {
        current.height = toNumber(content);
      }

      return items;
    }, [] as OpengraphMedia[]);
  };

  const images = fromAll('meta').reduce((items, element) => {
    const property = propertyOf(element);
    const content = attribute(element, 'content');

    if (!property?.startsWith('og:image') || !content) {
      return items;
    }

    const suffix = property.slice('og:image'.length);

    if (!suffix || suffix === ':url') {
      items.push({ url: resolve(content) });
      return items;
    }

    const current = items[items.length - 1];

    if (!current) {
      return items;
    }

    if (suffix === ':width') {
      current.width = toNumber(content);
    } else if (suffix === ':height') {
      current.height = toNumber(content);
    } else if (suffix === ':secure_url') {
      current.secureUrl = resolve(content);
    } else if (suffix === ':alt') {
      current.alt = content;
    } else if (suffix === ':type') {
      current.type = content;
    }

    return items;
  }, [] as OpengraphImage[]);

  return {
    type: getOpengraph('og:type'),
    title: getOpengraph('og:title'),
    url: resolve(getOpengraph('og:url')),
    keywords: getOpengraph('og:keywords'),
    siteName: getOpengraph('og:site_name'),
    determiner: getOpengraph('og:determiner'),
    description: getOpengraph('og:description'),

    articleTag: getAllArticle('article:tag'),
    articleSection: getArticle('article:section'),
    articleAuthor: getAllArticle('article:author'),
    articleModifiedTime: getArticle('article:modified_time'),
    articlePublishedTime: getArticle('article:published_time'),
    articleExpirationTime: getArticle('article:expiration_time'),

    audio: resolve(getOpengraph('og:audio')),
    audioType: getOpengraph('og:audio:type'),
    audioSecureUrl: resolve(getOpengraph('og:audio:secure_url')),
    audios: extractMedia('og:audio'),

    locale: getOpengraph('og:locale'),
    localeAlternate: getOpengraphAll('og:locale:alternate'),

    video: resolve(getOpengraph('og:video')),
    videoType: getOpengraph('og:video:type'),
    videoWidth: toNumber(getOpengraph('og:video:width')),
    videoHeight: toNumber(getOpengraph('og:video:height')),
    videoSecureUrl: resolve(getOpengraph('og:video:secure_url')),
    videos: extractMedia('og:video'),

    image: resolve(getOpengraph('og:image') ?? getOpengraph('og:image:url')),
    imageAlt: getOpengraph('og:image:alt'),
    images,

    facebookAppId: meta('fb:app_id'),
    facebookAdmins: metaAll('fb:admins'),
    facebookPages: metaAll('fb:pages'),
  };
};
