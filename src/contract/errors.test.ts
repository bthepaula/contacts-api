import { describe, expect, it } from 'vitest';
import { fromZodError } from './errors.ts';
import { CreateContactRequest } from './schemas.ts';

const FIELDS = Object.keys(CreateContactRequest.shape);

// Validates the body and returns the API error (or null when the body is valid)
function apiErrorFor(body: unknown) {
  const result = CreateContactRequest.safeParse(body);
  return result.success ? null : fromZodError(result.error, body, FIELDS).toJSON();
}

describe('fromZodError', () => {
  it('a missing required field becomes 422 missing_required_field with the field name', () => {
    expect(apiErrorFor({ first_name: 'Ana' })).toEqual({
      statusCode: 422,
      name: 'missing_required_field',
      message: 'Missing required field email. Add it to the request body.',
    });
  });

  it('an empty body is also a "missing field", not a "wrong type"', () => {
    expect(apiErrorFor({})?.name).toBe('missing_required_field');
  });

  it('a malformed email becomes validation_error with an example of the right format', () => {
    const error = apiErrorFor({ email: 'ana@' });
    expect(error?.name).toBe('validation_error');
    expect(error?.message).toBe('`email` must be a valid email address, like ana@example.com.');
  });

  it('an unknown field names it and lists the accepted ones (the developer\'s "frist_name")', () => {
    const error = apiErrorFor({ email: 'ana@example.com', frist_name: 'Ana' });
    expect(error?.name).toBe('validation_error');
    expect(error?.message).toContain('Unknown field `frist_name`');
    expect(error?.message).toContain('Accepted fields: email, first_name, last_name, unsubscribed');
  });

  it('a wrong type says which type was expected', () => {
    expect(apiErrorFor({ email: 'ana@example.com', unsubscribed: 'yes' })?.message).toBe(
      '`unsubscribed` must be a boolean. Fix the value and send the request again.',
    );
  });

  it('never leaks Zod\'s internal message', () => {
    for (const body of [{}, { email: 42 }, { email: 'x' }, { email: 'a@b.co', last_name: '' }]) {
      expect(apiErrorFor(body)?.message).not.toMatch(/Invalid input|expected string, received/);
    }
  });
});
