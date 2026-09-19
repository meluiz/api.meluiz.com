import type { CategoryDefinition, CheckFactory } from './types';

import { basicSeoChecks } from './basic-seo';
import { contentChecks } from './content';
import { indexingChecks } from './indexing';
import { socialChecks } from './social';
import { technicalChecks } from './technical';
import { urlChecks } from './urls';

/* ///////////////////////////////////////////////// */

/** Categories in report order. Their weights live in scoring.ts (CATEGORY_WEIGHTS). */
export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: 'basic-seo',
    name: 'Basic SEO',
    description: 'Core metadata used to identify and summarize the page in search results.',
    checks: basicSeoChecks,
  },
  {
    id: 'indexing',
    name: 'Indexing',
    description:
      'Crawler directives and canonical signals that control discovery and indexing.',
    checks: indexingChecks,
  },
  {
    id: 'content',
    name: 'Content',
    description: 'Content quality, language, authorship, and machine-readable meaning.',
    checks: contentChecks,
  },
  {
    id: 'social',
    name: 'Social and Open Graph',
    description: 'Metadata used to create accurate and accessible social sharing previews.',
    checks: socialChecks,
  },
  {
    id: 'urls',
    name: 'URLs',
    description: 'Security, readability, consistency, and localized URL declarations.',
    checks: urlChecks,
  },
  {
    id: 'technical',
    name: 'Technical metadata',
    description: 'Encoding, mobile presentation, icons, and application metadata.',
    checks: technicalChecks,
  },
];

export type { CategoryDefinition, CheckFactory };

export {
  basicSeoChecks,
  contentChecks,
  indexingChecks,
  socialChecks,
  technicalChecks,
  urlChecks,
};
