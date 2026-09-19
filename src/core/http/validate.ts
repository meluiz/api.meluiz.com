import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

import { validator } from 'hono-openapi';

import { UnprocessableError } from './errors';

/* ///////////////////////////////////////////////// */

interface ValidationIssue {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

/* ///////////////////////////////////////////////// */

/** Group Standard Schema issues by field, in the same shape as z.flattenError. */
const flattenIssues = (issues: readonly ValidationIssue[]) => {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of issues) {
    const segment = issue.path?.[0];
    const key = typeof segment === 'object' ? segment.key : segment;

    // Issues without a path concern the value as a whole
    const field = key === undefined ? '_root' : String(key);

    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }

  return fieldErrors;
};

/* ///////////////////////////////////////////////// */

/**
 * Validate a request target and register it in the OpenAPI document. The
 * validator comes from hono-openapi (not @hono/zod-validator) because only its
 * middleware carries the schema metadata the document generator reads.
 */
export const validate = <Schema extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) => {
  return validator(target, schema, (result) => {
    if (!result.success) {
      throw new UnprocessableError(
        `The provided ${target} is invalid`,
        flattenIssues(result.error),
      );
    }
  });
};
