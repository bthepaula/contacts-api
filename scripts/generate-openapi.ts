// Writes openapi.json (the artifact you publish, for docs and SDK generators) and prints a summary of the operations.
import { writeFileSync } from 'node:fs';
import { buildOpenApi } from '../spec/openapi.ts';

type Op = { operationId: string; responses: Record<string, unknown> };
type Doc = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Op>>;
  components: { schemas: Record<string, { required?: string[] }> };
};
const doc = buildOpenApi() as Doc;

console.log(`openapi ${doc.openapi} · ${doc.info.title} ${doc.info.version}`);
for (const [path, ops] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    console.log(`${method.toUpperCase().padEnd(7)}${path.padEnd(16)}${op.operationId.padEnd(15)}${Object.keys(op.responses).join(', ')}`);
  }
}
const schemas = doc.components.schemas;
console.log(`schemas: ${Object.keys(schemas).sort().join(', ')}`);
console.log(`CreateContactRequest.required (input): ${schemas.CreateContactRequest?.required?.join(', ')}`);
console.log(`Contact.required (output): ${schemas.Contact?.required?.join(', ')}`);
writeFileSync('openapi.json', JSON.stringify(doc, null, 2) + '\n');
console.log('wrote openapi.json');
