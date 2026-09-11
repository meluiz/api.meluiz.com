import type { Mobile } from '../types';
import type { ExtractorContext } from './context';

export const extractMobile = (ctx: ExtractorContext): Mobile => {
  const { attr, fromAll, get, resolve } = ctx;

  const toTouchIcon = (element: Parameters<ReturnType<typeof get>>[0]) => ({
    sizes: get('sizes')(element),
    href: resolve(get('href')(element)),
  });

  return {
    mobileWebAppCapable: attr('meta[name="mobile-web-app-capable"]', 'content'),

    appleTouchIcons: fromAll("link[rel='apple-touch-icon']").map(toTouchIcon),
    appleMobileWebAppTitle: attr('meta[name="apple-mobile-web-app-title"]', 'content'),
    appleMobileWebAppCapable: attr('meta[name="apple-mobile-web-app-capable"]', 'content'),
    appleTouchIconsPrecomposed: fromAll("link[rel='apple-touch-icon-precomposed']").map(
      toTouchIcon,
    ),
    appleMobileWebAppStatusBarStyle: attr(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
      'content',
    ),
  };
};
