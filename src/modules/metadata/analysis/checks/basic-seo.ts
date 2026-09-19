import type { AnalysisOutcome } from '../../schemas/analysis';
import type { CheckFactory } from './types';

import { characterLength, textValue } from '../helpers';
import { ANALYSIS_LIMITS } from '../limits';
import { createCheck, outcomeForScore, rampScore } from '../scoring';

/* ///////////////////////////////////////////////// */

interface LengthCheckOptions {
  id: string;
  name: string;
  value: string | undefined;
  description: string;
  recommendation: string;
  minimum: number;
  maximum: number;
  /** Lengths at or beyond these bounds earn no credit. */
  errorBelow: number;
  errorAbove: number;
  weight: number;
}

const lengthCheck = (options: LengthCheckOptions) => {
  const value = textValue(options.value);
  const length = value ? characterLength(value) : 0;
  const score = value
    ? rampScore(length, {
        errorBelow: options.errorBelow,
        minimum: options.minimum,
        maximum: options.maximum,
        errorAbove: options.errorAbove,
      })
    : 0;

  const outcome: AnalysisOutcome = value ? outcomeForScore(score) : 'absent';

  return createCheck({
    id: options.id,
    name: options.name,
    outcome,
    score,
    // Presence is measured exactly; the ideal range is only a guideline.
    confidence: value ? 0.85 : 1,
    value: value ?? null,
    numericValue: length,
    description: options.description,
    reason: !value
      ? `${options.name} is missing or empty.`
      : score === 1
        ? `${options.name} is within the recommended range.`
        : `${options.name} has ${length} characters and is outside the recommended ${options.minimum}–${options.maximum} range.`,
    recommendation: options.recommendation,
    limits: {
      unit: 'characters',
      minimum: options.minimum,
      maximum: options.maximum,
      ideal: `${options.minimum}–${options.maximum} characters`,
    },
    weight: options.weight,
  });
};

/* ///////////////////////////////////////////////// */

const titleLength: CheckFactory = ({ metadata }) => {
  return lengthCheck({
    id: 'title-length',
    name: 'Page title',
    value: metadata.general.title,
    description:
      'Checks whether the HTML title is present, concise, and likely to display clearly in search results.',
    recommendation:
      'Write a unique, descriptive title that leads with the page topic and uses branding concisely.',
    minimum: ANALYSIS_LIMITS.title.minimum,
    maximum: ANALYSIS_LIMITS.title.maximum,
    errorBelow: 15,
    errorAbove: 80,
    weight: 10,
  });
};

const descriptionLength: CheckFactory = ({ metadata }) => {
  return lengthCheck({
    id: 'description-length',
    name: 'Meta description',
    value: metadata.general.description,
    description:
      'Checks whether the meta description can provide a useful and sufficiently detailed search snippet.',
    recommendation:
      'Summarize the page accurately in one or two useful sentences, with a clear reason to visit.',
    minimum: ANALYSIS_LIMITS.description.minimum,
    maximum: ANALYSIS_LIMITS.description.maximum,
    errorBelow: 30,
    errorAbove: 220,
    weight: 8,
  });
};

/* ///////////////////////////////////////////////// */

export const basicSeoChecks: CheckFactory[] = [titleLength, descriptionLength];
