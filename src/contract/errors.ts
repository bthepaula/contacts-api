// Turns a ZodError (written for whoever wrote the schema) into an API error (written for whoever calls
// the API). The rules: a stable name, a consistent status, and a message that says what to DO.
import type * as z from 'zod';
import type { ErrorName, ErrorResponse } from './schemas.ts';

// An error a handler can throw; the server turns it into the JSON response
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorName: ErrorName,
    message: string,
  ) {
    super(message);
  }
  toJSON(): ErrorResponse {
    return { statusCode: this.statusCode, name: this.errorName, message: this.message };
  }
}

// "first_name", "tags.0.name", or "(body)" when the problem is the whole object
export function fieldPath(path: readonly PropertyKey[]): string {
  return path.length ? path.map(String).join('.') : '(body)';
}

// The value the client sent at that path (undefined = the field was not sent)
export function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = input;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

// One sentence per kind of problem, instead of "Invalid input: expected string, received undefined"
function describeIssue(issue: z.core.$ZodIssue, knownFields: readonly string[]): string {
  const field = fieldPath(issue.path);
  switch (issue.code) {
    case 'unrecognized_keys':
      return `Unknown field ${issue.keys.map((k) => `\`${k}\``).join(', ')} in the request. ` +
        `Remove it or fix the spelling. Accepted fields: ${knownFields.join(', ')}.`;
    case 'invalid_format':
      return `\`${field}\` must be a valid ${issue.format === 'email' ? 'email address, like ana@example.com' : issue.format}.`;
    case 'invalid_type':
      return `\`${field}\` must be a ${issue.expected}. Fix the value and send the request again.`;
    case 'too_small':
      return issue.origin === 'string'
        ? `\`${field}\` must have at least ${issue.minimum} character(s).`
        : `\`${field}\` must be greater than or equal to ${issue.minimum}.`;
    case 'too_big':
      return issue.origin === 'string'
        ? `\`${field}\` must have at most ${issue.maximum} characters.`
        : `\`${field}\` must be less than or equal to ${issue.maximum}.`;
    case 'custom':
      return `${issue.message}.`;
    default:
      return `\`${field}\`: ${issue.message}.`;
  }
}

// All the missing fields in one sentence: the caller fixes everything in a single retry
function missingFieldsMessage(fields: readonly string[]): string {
  return fields.length === 1
    ? `Missing required field ${fields[0]}. Add it to the request body.`
    : `Missing required fields ${fields.join(', ')}. Add them to the request body.`;
}

// Zod uses `invalid_type` both for "not sent" and "sent with the wrong type": the original input tells
// them apart. A field counts as missing only when it is absent (undefined); `null` was sent, so it is wrong.
// The root (path []) never counts as a missing *field*: a missing or non-object body is a validation error.
function isMissingField(issue: z.core.$ZodIssue, input: unknown): boolean {
  return issue.code === 'invalid_type' && issue.path.length > 0 && valueAt(input, issue.path) === undefined;
}

// Every schema failure is a 422. The name says WHAT kind of failure (missing fields win, because the
// request is incomplete); the message lists EVERY problem, so the caller fixes it all in one retry.
export function fromZodError(error: z.ZodError, input: unknown, knownFields: readonly string[] = []): ApiError {
  const missing: string[] = [];
  const problems: string[] = [];
  for (const issue of error.issues) {
    if (isMissingField(issue, input)) missing.push(fieldPath(issue.path));
    else problems.push(describeIssue(issue, knownFields));
  }

  if (missing.length > 0) {
    const message = [missingFieldsMessage(missing), ...problems].join(' ');
    return new ApiError(422, 'missing_required_field', message);
  }
  return new ApiError(422, 'validation_error', problems.join(' '));
}
