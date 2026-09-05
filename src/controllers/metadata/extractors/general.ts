import type { ExtractorContext } from './context';
import type { Author, General } from '../types';

const extractAuthors = (ctx: ExtractorContext): Author[] => {
  const { fromAll } = ctx;

  const names = fromAll('meta[name=author]')
    .map((element) => element.getAttribute('content'))
    .filter((value): value is string => !!value);

  const hrefs = fromAll('link[rel=author]')
    .map((element) => element.getAttribute('href'))
    .filter((value): value is string => !!value);

  const count = Math.max(names.length, hrefs.length);
  const authors: Author[] = [];

  for (let index = 0; index < count; index += 1) {
    authors.push({
      name: names[index],
      href: hrefs[index],
    });
  }

  return authors;
};

export const extractGeneral = (ctx: ExtractorContext): General => {
  const { attr, fromAll, get, text, resolve } = ctx;

  return {
    title: text('title'),
    description: attr('meta[name=description]', 'content'),
    url: resolve(attr('link[rel=canonical]', 'href')),
    robots: attr('meta[name=robots]', 'content'),
    keywords: attr('meta[name=keywords]', 'content'),
    generator: attr('meta[name=generator]', 'content'),
    license: attr('meta[name=license]', 'content'),
    viewport: attr('meta[name=viewport]', 'content'),
    colorScheme: attr("meta[name='color-scheme']", 'content'),
    formatDetection: attr("meta[name='format-detection']", 'content'),
    applicationName: attr("meta[name='application-name']", 'content'),
    manifest: resolve(attr('link[rel=manifest]', 'href')),
    authors: extractAuthors(ctx),
    favicons: fromAll('link[rel~=icon]').map((element) => ({
      rel: get('rel')(element),
      type: get('type')(element),
      sizes: get('sizes')(element),
      href: resolve(get('href')(element)),
    })),
    themeColors: fromAll("meta[name='theme-color']").map((element) => ({
      media: get('media')(element),
      value: get('content')(element),
    })),
  };
};
