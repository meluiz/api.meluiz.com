import type { Opengraph, OpengraphImage } from '../types';
import type { ExtractorContext } from './context';

export const extractOpengraph = (ctx: ExtractorContext): Opengraph => {
  const { attr, attrAll, fromAll, resolve, toNumber } = ctx;

  const getOpengraph = (property: `og:${string}`) => {
    return attr(`meta[property='${property}']`, 'content');
  };

  const getOpengraphAll = (property: `og:${string}`) => {
    return attrAll(`meta[property='${property}']`, 'content');
  };

  const getArticle = (property: `article:${string}`) => {
    return attr(`meta[property='${property}']`, 'content') ?? getOpengraph(`og:${property}`);
  };

  const getAllArticle = (property: `article:${string}`) => {
    const standard = attrAll(`meta[property='${property}']`, 'content');
    return standard.length > 0 ? standard : getOpengraphAll(`og:${property}`);
  };

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

    locale: getOpengraph('og:locale'),
    localeAlternate: getOpengraphAll('og:locale:alternate'),

    video: resolve(getOpengraph('og:video')),
    videoType: getOpengraph('og:video:type'),
    videoWidth: toNumber(getOpengraph('og:video:width')),
    videoHeight: toNumber(getOpengraph('og:video:height')),
    videoSecureUrl: resolve(getOpengraph('og:video:secure_url')),

    image: getOpengraph('og:image'),
    imageAlt: getOpengraph('og:image:alt'),
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
