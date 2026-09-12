import type { Twitter } from '../types';
import type { ExtractorContext } from './context';

export const extractTwitter = (ctx: ExtractorContext): Twitter => {
  const { meta, resolve } = ctx;

  const getTwitter = (property: `twitter:${string}`) => {
    return meta(property);
  };

  const labels = [1, 2].map((index) => ({
    label: getTwitter(`twitter:label${index}`),
    data: getTwitter(`twitter:data${index}`),
  }));

  return {
    card: getTwitter('twitter:card'),
    title: getTwitter('twitter:title'),
    description: getTwitter('twitter:description'),
    image: resolve(getTwitter('twitter:image') ?? getTwitter('twitter:image:src')),
    imageAlt: getTwitter('twitter:image:alt'),

    site: getTwitter('twitter:site'),
    siteId: getTwitter('twitter:site:id'),
    creator: getTwitter('twitter:creator'),
    creatorId: getTwitter('twitter:creator:id'),

    player: resolve(getTwitter('twitter:player')),
    playerWidth: getTwitter('twitter:player:width'),
    playerHeight: getTwitter('twitter:player:height'),
    playerStream: resolve(getTwitter('twitter:player:stream')),

    appCountry: getTwitter('twitter:app:country'),

    appNameIphone: getTwitter('twitter:app:name:iphone'),
    appIdIphone: getTwitter('twitter:app:id:iphone'),
    appUrlIphone: resolve(getTwitter('twitter:app:url:iphone')),

    appNameIpad: getTwitter('twitter:app:name:ipad'),
    appIdIpad: getTwitter('twitter:app:id:ipad'),
    appUrlIpad: resolve(getTwitter('twitter:app:url:ipad')),

    appNameGoogleplay: getTwitter('twitter:app:name:googleplay'),
    appIdGoogleplay: getTwitter('twitter:app:id:googleplay'),
    appUrlGoogleplay: resolve(getTwitter('twitter:app:url:googleplay')),

    labels: labels.filter(({ data, label }) => data !== undefined || label !== undefined),
  };
};
