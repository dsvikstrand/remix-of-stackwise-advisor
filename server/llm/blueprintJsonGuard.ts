import { ZodError, type ZodType } from 'zod';
import { extractJson } from './prompts';

export type BlueprintJsonFailureClass = 'empty_output' | 'invalid_json' | 'invalid_schema';

export class BlueprintJsonInvalidError extends Error {
  code: 'BLUEPRINT_JSON_INVALID';
  failureClass: BlueprintJsonFailureClass;
  detail: string;
  rawExcerpt: string | null;

  constructor(input: {
    failureClass: BlueprintJsonFailureClass;
    detail: string;
    rawText?: string | null;
    message?: string;
  }) {
    super(input.message || 'Blueprint generation returned malformed structured output. Please try again.');
    this.name = 'BlueprintJsonInvalidError';
    this.code = 'BLUEPRINT_JSON_INVALID';
    this.failureClass = input.failureClass;
    this.detail = String(input.detail || '').trim() || 'Unknown blueprint JSON error';
    const rawText = String(input.rawText || '').trim();
    this.rawExcerpt = rawText ? rawText.slice(0, 240) : null;
  }
}

export function isBlueprintJsonInvalidError(error: unknown): error is BlueprintJsonInvalidError {
  return error instanceof BlueprintJsonInvalidError
    || String((error as { code?: unknown } | null)?.code || '').trim().toUpperCase() === 'BLUEPRINT_JSON_INVALID';
}

export function parseBlueprintJsonOutput<T>(input: {
  rawText: string | null | undefined;
  validator: ZodType<T>;
}) {
  const rawText = String(input.rawText || '').trim();
  if (!rawText) {
    throw new BlueprintJsonInvalidError({
      failureClass: 'empty_output',
      detail: 'No output text from model',
      rawText,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch (error) {
    throw new BlueprintJsonInvalidError({
      failureClass: 'invalid_json',
      detail: error instanceof Error ? error.message : String(error || 'JSON parse failed'),
      rawText,
    });
  }

  try {
    return input.validator.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BlueprintJsonInvalidError({
        failureClass: 'invalid_schema',
        detail: error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
          .join('; '),
        rawText,
      });
    }
    throw error;
  }
}
