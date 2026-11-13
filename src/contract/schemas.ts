// The whole API contract in one place. Zod validates at runtime, TypeScript infers the types,
// and the same schemas become the OpenAPI document. Field names are snake_case, like the Resend API.
import * as z from 'zod';

// ---------- requests: what the client sends ----------
// strictObject: an unknown field is an error, so a misspelled "frist_name" is reported instead of silently ignored.
export const CreateContactRequest = z.strictObject({
  email: z.email().describe("The contact's email address."),
  first_name: z.string().min(1).max(100).optional().describe('First name.'),
  last_name: z.string().min(1).max(100).optional().describe('Last name.'),
  unsubscribed: z.boolean().default(false).describe('If true, the contact gets no broadcasts.'),
});
// input: what the client MAY send (unsubscribed is optional); output: what the server gets after parsing
export type CreateContactInput = z.input<typeof CreateContactRequest>;
export type CreateContactData = z.output<typeof CreateContactRequest>;

// ---------- responses: what the server promises to return ----------
export const Contact = z.object({
  object: z.literal('contact'),
  id: z.string().describe('Stable identifier. It is also the pagination cursor.'),
  email: z.email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  unsubscribed: z.boolean(),
  created_at: z.iso.datetime().describe('ISO 8601, UTC.'),
});
export type Contact = z.output<typeof Contact>;

export const CreateContactResponse = z.object({ object: z.literal('contact'), id: z.string() });
export const DeleteContactResponse = z.object({ object: z.literal('contact'), id: z.string(), deleted: z.literal(true) });

// The same list envelope as Resend: { object: 'list', has_more, data }
export const ContactList = z.object({
  object: z.literal('list'),
  has_more: z.boolean().describe('If true, there are more items after this page.'),
  data: z.array(Contact),
});

// ---------- errors: one shape for the whole API ----------
// The same envelope as Resend: { statusCode, name, message }. The name is the contract (stable, for code);
// the message is for humans and agents, and says what to do.
export const ErrorName = z.enum([
  'missing_api_key',
  'validation_error',
  'missing_required_field',
  'not_found',
  'method_not_allowed',
  'application_error',
]);
export type ErrorName = z.infer<typeof ErrorName>;
export const ErrorResponse = z.object({
  statusCode: z.number().int(),
  name: ErrorName,
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

// ---------- list query: cursor pagination ----------
export const ListContactsQuery = z
  .strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(20).describe('Items per page (1 to 100).'),
    after: z.string().min(1).optional().describe('id of the last item seen: returns the items after it.'),
    before: z.string().min(1).optional().describe('id of the first item seen: returns the items before it.'),
  })
  .refine((q) => !(q.after && q.before), {
    path: ['before'],
    message: 'Use either `after` or `before` in the same request, not both',
  });
export type ListContactsQuery = z.output<typeof ListContactsQuery>;
