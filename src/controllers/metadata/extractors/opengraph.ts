import type { Opengraph, OpengraphImage } from '../types';
import type { ExtractorContext } from './context';

export const extractOpengraph = (ctx: ExtractorContext): Opengraph => {
  const { attr, attrAll, fromAll, resolve, toNumber } = ctx;

  const get = (property: `og:${string}`) => {
    return attr(`meta[property='${property}']`, 'content');
  };

  const getAll = (property: `og:${string}`) => {
    return attrAll(`meta[property='${property}']`, 'content');
  };

  // og:image starts a new image; og:image:* fills the last one.
  // This relies on document order — do not split the selector.
  const images = fromAll("meta[property^='og:image']").reduce((previous, element) => {
    const property = element.getAttribute('property');
    const content = element.getAttribute('content');

    if (!content || !property) {
      return previous;
    }

    const suffix = property.split('og:image')[1];

    if (!suffix) {
      previous.push({ url: resolve(content) });
      return previous;
    }

    const last = previous[previous.length - 1];

    if (!last) {
      return previous;
    }

    const key = suffix.split(':')[1];

    if (key === 'width' || key === 'height') {
      last[key] = toNumber(content);
    } else if (key === 'secure_url') {
      last.secureUrl = resolve(content);
    } else if (key === 'url') {
      last.url = resolve(content);
    } else if (key === 'alt' || key === 'type') {
      last[key] = content;
    }

    return previous;
  }, [] as OpengraphImage[]);

  return {
    type: get('og:type'),
    title: get('og:title'),
    url: resolve(get('og:url')),
    keywords: get('og:keywords'),
    siteName: get('og:site_name'),
    determiner: get('og:determiner'),
    description: get('og:description'),

    articleTag: getAll('og:article:tag'),
    articleSection: get('og:article:section'),
    articleAuthor: getAll('og:article:author'),
    articleModifiedTime: get('og:article:modified_time'),
    articlePublishedTime: get('og:article:published_time'),
    articleExpirationTime: get('og:article:expiration_time'),

    audio: resolve(get('og:audio')),
    audioType: get('og:audio:type'),
    audioSecureUrl: resolve(get('og:audio:secure_url')),

    locale: get('og:locale'),
    localeAlternate: getAll('og:locale:alternate'),

    video: resolve(get('og:video')),
    videoType: get('og:video:type'),
    videoWidth: toNumber(get('og:video:width')),
    videoHeight: toNumber(get('og:video:height')),
    videoSecureUrl: resolve(get('og:video:secure_url')),

    image: get('og:image'),
    imageAlt: get('og:image:alt'),
    images: fromAll("meta[property^='og:image']").reduce((previous, element) => {
      const property = element.getAttribute('property');
      const content = element.getAttribute('content');

      if (!content || !property) {
        return previous;
      }

      const suffix = property.split('og:image')[1];

      if (!suffix) {
        previous.push({ url: resolve(content) });
        return previous;
      }

      const last = previous[previous.length - 1];

      if (!last) {
        return previous;
      }

      const key = suffix.split(':')[1];

      if (key === 'width' || key === 'height') {
        last[key] = toNumber(content);
      } else if (key === 'secure_url') {
        last.secureUrl = resolve(content);
      } else if (key === 'url') {
        last.url = resolve(content);
      } else if (key === 'alt' || key === 'type') {
        last[key] = content;
      }

      return previous;
    }, [] as OpengraphImage[]),
  };
};
