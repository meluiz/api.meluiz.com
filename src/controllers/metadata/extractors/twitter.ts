import type { Twitter } from '../types';
import type { ExtractorContext } from './context';

export const extractTwitter = (ctx: ExtractorContext): Twitter => {
  const { attr, resolve } = ctx;

  // Twitter cards are commonly published with either name or property
  const getTwitter = (property: `twitter:${string}`) => {
    return (
      attr(`meta[name='${property}']`, 'content') ??
      attr(`meta[property='${property}']`, 'content')
    );
  };

  return {
    card: getTwitter('twitter:card'),
    title: getTwitter('twitter:title'),
    description: getTwitter('twitter:description'),
    image: resolve(getTwitter('twitter:image')),
    imageAlt: getTwitter('twitter:image:alt'),

    site: getTwitter('twitter:site'),
    siteId: getTwitter('twitter:site:id'),
    creator: getTwitter('twitter:creator'),
    creatorId: getTwitter('twitter:creator:id'),

    player: resolve(getTwitter('twitter:player')),
    playerWidth: getTwitter('twitter:player:width'),
    playerHeight: getTwitter('twitter:player:height'),
    playerStream: getTwitter('twitter:player:stream'),

    appCountry: getTwitter('twitter:app:country'),

    appNameIphone: getTwitter('twitter:app:name:iphone'),
    appIdIphone: getTwitter('twitter:app:id:iphone'),
    appUrlIphone: getTwitter('twitter:app:url:iphone'),

    appNameIpad: getTwitter('twitter:app:name:ipad'),
    appIdIpad: getTwitter('twitter:app:id:ipad'),
    appUrlIpad: getTwitter('twitter:app:url:ipad'),

    appNameGoogleplay: getTwitter('twitter:app:name:googleplay'),
    appIdGoogleplay: getTwitter('twitter:app:id:googleplay'),
    appUrlGoogleplay: getTwitter('twitter:app:url:googleplay'),
  };
};
