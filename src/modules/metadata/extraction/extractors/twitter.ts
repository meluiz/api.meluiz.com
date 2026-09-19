import type { Twitter, TwitterLabel } from '../../types';
import type { ExtractorContext } from '../context';

export const extractTwitter = (ctx: ExtractorContext): Twitter => {
  const { meta, resolve } = ctx;

  const twitter = (name: string) => {
    return meta(`twitter:${name}`);
  };

  const twitterUrl = (name: string) => {
    return resolve(twitter(name));
  };

  const labels: TwitterLabel[] = [];

  for (const index of [1, 2]) {
    const label = twitter(`label${index}`);
    const data = twitter(`data${index}`);

    if (label !== undefined || data !== undefined) {
      labels.push({ label, data });
    }
  }

  return {
    card: twitter('card'),
    title: twitter('title'),
    description: twitter('description'),

    image: twitterUrl('image') ?? twitterUrl('image:src'),
    imageAlt: twitter('image:alt'),

    site: twitter('site'),
    siteId: twitter('site:id'),

    creator: twitter('creator'),
    creatorId: twitter('creator:id'),

    player: twitterUrl('player'),
    playerWidth: twitter('player:width'),
    playerHeight: twitter('player:height'),
    playerStream: twitterUrl('player:stream'),

    appIdIpad: twitter('app:id:ipad'),
    appCountry: twitter('app:country'),
    appNameIpad: twitter('app:name:ipad'),
    appIdIphone: twitter('app:id:iphone'),
    appUrlIpad: twitterUrl('app:url:ipad'),
    appNameIphone: twitter('app:name:iphone'),
    appUrlIphone: twitterUrl('app:url:iphone'),

    appIdGoogleplay: twitter('app:id:googleplay'),
    appNameGoogleplay: twitter('app:name:googleplay'),
    appUrlGoogleplay: twitterUrl('app:url:googleplay'),

    labels,
  };
};
