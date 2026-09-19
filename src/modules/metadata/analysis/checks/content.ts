import type { AnalysisOutcome } from '../../types/analysis';
import type { CheckFactory } from './types';

import { isIso8601 } from '@/shared/date';
import {
  getTokensOf,
  getWordsOf,
  isKeywordStuffed,
  normalizeText,
  textSimilarity,
} from '@/shared/text';

import { clamp, coveredBy, pluralize, textValue } from '../helpers';
import { createCheck, outcomeForScore, rampScore } from '../scoring';

/* ///////////////////////////////////////////////// */

const GENERIC_TITLES = new Set(
  [
    'document',
    'home',
    'homepage',
    'início',
    'new page',
    'page',
    'página',
    'página inicial',
    'sem título',
    'test',
    'untitled',
    'welcome',
  ].map(normalizeText),
);

// BCP 47-style tag: a 2-3 letter language, then optional script/region/variant subtags
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const MINIMUM_DESCRIPTION_WORDS = 6;

/* ------- metadata quality ------- */

const titleQuality: CheckFactory = ({ metadata }) => {
  const title = textValue(metadata.general.title);
  const generic = !!title && GENERIC_TITLES.has(normalizeText(title));
  const stuffed = !!title && isKeywordStuffed(title);

  return createCheck({
    id: 'title-quality',
    name: 'Title quality',
    // The absence of a title is charged once, by Page title.
    ...(title
      ? { outcome: generic ? 'fail' : stuffed ? ('warn' as const) : ('pass' as const) }
      : coveredBy('title-length')),
    dependsOn: 'title-length',
    confidence: 0.72,
    value: title ?? null,
    description: 'Evaluates whether the title is specific rather than generic or repetitive.',
    reason: !title
      ? 'Title quality cannot be evaluated without a title.'
      : generic
        ? 'The title is generic and does not identify the page topic.'
        : stuffed
          ? 'The title repeats the same term or phrase heavily and may look keyword-stuffed.'
          : 'The title contains descriptive text without obvious keyword repetition.',
    recommendation:
      'Use natural, page-specific wording and remove generic labels or repeated keyword variants.',
    weight: 4,
  });
};

const descriptionQuality: CheckFactory = ({ metadata }) => {
  const title = textValue(metadata.general.title);
  const description = textValue(metadata.general.description);
  const duplicatesTitle =
    !!description && !!title && normalizeText(title) === normalizeText(description);
  const tooShort = !!description && getWordsOf(description).length < MINIMUM_DESCRIPTION_WORDS;
  const stuffed = !!description && isKeywordStuffed(description);

  const outcome: AnalysisOutcome = duplicatesTitle
    ? 'fail'
    : tooShort || stuffed
      ? 'warn'
      : 'pass';

  return createCheck({
    id: 'description-quality',
    name: 'Description quality',
    ...(description ? { outcome } : coveredBy('description-length')),
    dependsOn: 'description-length',
    confidence: 0.72,
    value: description ?? null,
    description:
      'Evaluates whether the description is informative, distinct, and naturally written.',
    reason: !description
      ? 'Description quality cannot be evaluated without a description.'
      : duplicatesTitle
        ? 'The description duplicates the title instead of summarizing the page.'
        : tooShort
          ? 'The description contains too little context to explain the page clearly.'
          : stuffed
            ? 'The description repeats terms heavily and may read as keyword stuffing.'
            : 'The description contains distinct, descriptive content.',
    recommendation:
      'Describe the page in natural language, avoid duplicating the title, and remove repeated keywords.',
    weight: 4,
  });
};

const documentLanguage: CheckFactory = ({ metadata }) => {
  const language = textValue(metadata.general.language);
  const isValid = !!language && LANGUAGE_TAG.test(language);

  return createCheck({
    id: 'document-language',
    name: 'Document language',
    outcome: !language ? 'absent' : isValid ? 'pass' : 'fail',
    confidence: 1,
    value: language ?? null,
    description:
      'Checks the HTML lang value used by search engines, browsers, and assistive technologies.',
    reason: !language
      ? 'The document does not declare a language.'
      : isValid
        ? 'The document declares a valid language tag.'
        : 'The declared language is not a valid BCP 47-style language tag.',
    recommendation: 'Set a valid lang value on the html element, such as en, pt-BR, or es.',
    weight: 3,
  });
};

const structuredData: CheckFactory = ({ metadata }) => {
  const data = metadata.general.structuredData;
  const count = data?.count ?? 0;
  const invalid = data?.invalid ?? 0;
  const issues = data?.issues ?? [];
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const score = count === 0 ? 0 : clamp(1 - (invalid + errors) / count - warnings * 0.1);

  return createCheck({
    id: 'structured-data',
    name: 'Structured data',
    // JSON-LD is an optional enhancement: its absence leaves the score alone.
    outcome: count === 0 ? 'not-applicable' : outcomeForScore(score),
    score,
    value: data?.types ?? [],
    numericValue: count,
    description:
      'Checks for parseable JSON-LD that can help eligible pages appear with enhanced search features.',
    reason:
      count === 0
        ? 'No JSON-LD structured data was found; it is optional and is not scored when absent.'
        : invalid > 0
          ? `${invalid} of ${count} JSON-LD blocks could not be parsed.`
          : errors > 0
            ? `${errors} semantic structured-data ${pluralize(errors, 'error')} found.`
            : warnings > 0
              ? `${warnings} structured-data ${pluralize(warnings, 'improvement')} found.`
              : `${count} valid JSON-LD ${pluralize(count, 'block')} found.`,
    recommendation:
      invalid > 0
        ? 'Fix invalid JSON-LD and validate each applicable schema with a structured-data testing tool.'
        : 'Use relevant, accurate schema.org JSON-LD when the page is eligible for a rich result.',
    limits: {
      unit: 'items',
      minimum: 1,
    },
    weight: 3,
    confidence: 0.88,
    evidence: issues.map((issue) => issue.message),
  });
};

const metaKeywords: CheckFactory = ({ metadata }) => {
  const keywords = textValue(metadata.general.keywords);

  return createCheck({
    id: 'meta-keywords',
    name: 'Meta keywords usage',
    outcome: keywords ? 'warn' : 'pass',
    value: keywords ?? null,
    description:
      'Detects the obsolete meta keywords field, which modern major search engines do not use for ranking.',
    reason: keywords
      ? 'A meta keywords value is present but does not provide modern SEO value.'
      : 'No obsolete meta keywords dependency was detected.',
    recommendation:
      'Invest effort in descriptive content, titles, internal links, and structured data instead of meta keywords.',
    weight: 1,
  });
};

const articleMetadata: CheckFactory = ({ metadata }) => {
  const isArticle = metadata.opengraph.type?.toLocaleLowerCase() === 'article';
  const authors = metadata.opengraph.articleAuthor ?? [];
  const published = textValue(metadata.opengraph.articlePublishedTime);
  const validPublished = isIso8601(published);
  const missing = [
    authors.length === 0 ? 'article:author' : null,
    !published ? 'article:published_time' : null,
  ].filter((value): value is string => value !== null);

  const score = published && !validPublished ? 0 : (2 - missing.length) / 2;

  return createCheck({
    id: 'article-metadata',
    name: 'Article metadata',
    // Emitted for every page so `notApplicable` stays a meaningful count
    // instead of the check silently disappearing from the report.
    outcome: isArticle ? outcomeForScore(score) : 'not-applicable',
    score,
    value: [
      ...authors.map((author) => `author: ${author}`),
      ...(published ? [`published: ${published}`] : []),
    ],
    numericValue: 2 - missing.length,
    description: 'Checks authorship and publication time for pages declared as articles.',
    reason: !isArticle
      ? 'The page is not declared as an article, so article metadata does not apply.'
      : published && !validPublished
        ? 'The article publication time is not a valid ISO 8601 date.'
        : missing.length > 0
          ? `Recommended article fields are missing: ${missing.join(', ')}.`
          : 'The article includes authorship and a valid publication time.',
    recommendation:
      'Provide accurate article:author and ISO 8601 article:published_time values for article pages.',
    limits: { unit: 'items', minimum: 2 },
    weight: 3,
  });
};

/* ------- document content ------- */

const titleHeadingAlignment: CheckFactory = ({ context, metadata }) => {
  const document = context.document;

  if (!document) {
    return null;
  }

  const title = textValue(metadata.general.title);
  const heading = document.h1s[0];
  const comparable =
    !!title && !!heading && getTokensOf(title).length > 0 && getTokensOf(heading).length > 0;
  const similarity = comparable ? textSimilarity(title, heading) : 0;
  const score = rampScore(similarity, {
    errorBelow: 0.1,
    minimum: 0.5,
    maximum: 1,
    errorAbove: 2,
  });

  const outcome: AnalysisOutcome = !title
    ? 'not-applicable'
    : !heading
      ? 'absent'
      : // Neither side produced comparable tokens; the heuristic has nothing to
        // say, which is not the same as the page being wrong.
        !comparable
        ? 'unknown'
        : outcomeForScore(score);

  return createCheck({
    id: 'title-heading-alignment',
    name: 'Title and main heading alignment',
    outcome,
    score: outcome === 'absent' ? 0.3 : score,
    dependsOn: 'title-length',
    value: heading ?? null,
    numericValue: Math.round(similarity * 100),
    description:
      'Compares the page title with the primary H1 to identify potentially unrelated or unclear page labeling.',
    reason: !title
      ? 'There is no title to compare with the main heading.'
      : !heading
        ? 'No H1 was found to compare with the page title.'
        : !comparable
          ? 'The title and H1 did not produce comparable tokens, so alignment was not scored.'
          : `The title and H1 share ${Math.round(similarity * 100)}% of their terms.`,
    recommendation:
      'Use one descriptive H1 whose subject clearly aligns with the page title without requiring identical wording.',
    weight: 4,
    confidence: 0.65,
    source: 'html',
    evidence: [...(title ? [`title: ${title}`] : []), ...(heading ? [`h1: ${heading}`] : [])],
  });
};

const contentLanguageAlignment: CheckFactory = ({ context, metadata }) => {
  if (!context.document) {
    return null;
  }

  const declared = textValue(metadata.general.language)?.split('-')[0]?.toLocaleLowerCase();
  const detected = context.document.detectedLanguage;
  const matches = !!declared && !!detected && declared === detected.code;

  const outcome: AnalysisOutcome = !detected
    ? // Not enough textual evidence: excluded instead of scored as a warning.
      'unknown'
    : !declared
      ? 'not-applicable'
      : matches
        ? 'pass'
        : 'fail';

  return createCheck({
    id: 'content-language-alignment',
    name: 'Declared and detected language',
    outcome,
    dependsOn: 'document-language',
    value: detected?.code ?? null,
    numericValue: detected ? Math.round(detected.confidence * 100) : undefined,
    description:
      'Uses a lightweight language heuristic to compare visible content with the HTML language declaration.',
    reason: !detected
      ? 'There was not enough textual evidence to infer the page language reliably.'
      : !declared
        ? 'The content language was inferred, but the document does not declare a language.'
        : matches
          ? `The inferred ${detected.code} content matches the declared ${declared} language.`
          : `The inferred ${detected.code} content differs from the declared ${declared} language.`,
    recommendation:
      'Confirm the content language and set the html lang value to the matching BCP 47 language tag.',
    weight: 3,
    confidence: detected?.confidence ?? 0.4,
    source: 'html',
    evidence: [
      ...(declared ? [`declared language: ${declared}`] : []),
      ...(detected
        ? [`detected language: ${detected.code} (${Math.round(detected.confidence * 100)}%)`]
        : []),
    ],
  });
};

const contentImageAlternatives: CheckFactory = ({ context }) => {
  const images = context.document?.images;

  if (!images) {
    return null;
  }

  const missing = images.filter((image) => image.alt === undefined).length;
  const score = images.length === 0 ? 0 : clamp(1 - missing / images.length);

  return createCheck({
    id: 'content-image-alternatives',
    name: 'Content image alternatives',
    outcome: images.length === 0 ? 'not-applicable' : outcomeForScore(score),
    score,
    value: images.flatMap((image) => (image.src && image.alt === undefined ? [image.src] : [])),
    numericValue: missing,
    description:
      'Checks whether content images declare alt attributes; empty alt remains valid for decorative images.',
    reason:
      images.length === 0
        ? 'The document has no content images to evaluate.'
        : missing === 0
          ? `All ${images.length} content images declare alt attributes.`
          : `${missing} of ${images.length} images do not declare an alt attribute.`,
    recommendation:
      'Add concise descriptive alt text to informative images and an empty alt attribute to decorative images.',
    weight: 4,
    confidence: 0.95,
    source: 'html',
    evidence: [`images: ${images.length}`, `missing alt attributes: ${missing}`],
  });
};

/* ///////////////////////////////////////////////// */

export const contentChecks: CheckFactory[] = [
  titleQuality,
  descriptionQuality,
  documentLanguage,
  structuredData,
  metaKeywords,
  articleMetadata,
  titleHeadingAlignment,
  contentLanguageAlignment,
  contentImageAlternatives,
];
