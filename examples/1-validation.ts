// What Zod returns when a request is wrong, and the same schema seen as JSON Schema from both sides.
import * as z from 'zod';
import { CreateContactRequest } from '../src/contract/schemas.ts';

const cases: [string, unknown][] = [
  ['valid', { email: 'ana@example.com', first_name: 'Ana' }],
  ['no email', { first_name: 'Ana' }],
  ['invalid email', { email: 'ana@' }],
  ['misspelled key', { email: 'ana@example.com', frist_name: 'Ana' }],
  ['wrong types', { email: 42, unsubscribed: 'yes' }],
];

for (const [label, body] of cases) {
  const result = CreateContactRequest.safeParse(body);
  if (result.success) {
    console.log(`${label.padEnd(15)} ok     ${JSON.stringify(result.data)}`);
    continue;
  }
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '(body)';
    console.log(`${label.padEnd(15)} ERROR  ${path}: ${issue.code} · ${issue.message}`);
  }
}

// What the client may send (input) and what the server gets after parsing (output)
const input = z.toJSONSchema(CreateContactRequest, { io: 'input' }) as { required: string[] };
const output = z.toJSONSchema(CreateContactRequest, { io: 'output' }) as { required: string[] };
console.log(`\nJSON Schema (io: input)  required: ${input.required.join(', ')}`);
console.log(`JSON Schema (io: output) required: ${output.required.join(', ')}`);
